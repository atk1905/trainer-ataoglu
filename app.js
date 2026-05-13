import VexFlow, { Renderer, Stave, StaveNote, Voice, Formatter, Accidental } from "./vendor/vexflow/entry/vexflow.js";
import {
  catalog,
  filterCatalog,
  flattenSystems,
  getInitialSelection,
  getItemById,
  getItemsForLevel,
  getLevelById,
  midiToNote,
  midiToVexKey,
  noteToMidi,
  practiceSequenceFor,
  renderLabelFor,
} from "./music-data.js";

const Tone = window.Tone;
const { levels, exercises, repertoire } = catalog;

const $ = (id) => document.getElementById(id);
const els = {
  appShell: $("appShell"),
  currentItemBadge: $("currentItemBadge"),
  currentMeta: $("currentMeta"),
  midiStatus: $("midiStatus"),
  midiStatusText: $("midiStatusText"),
  midiFlowText: $("midiFlowText"),
  midiPortList: $("midiPortList"),
  midiRawText: $("midiRawText"),
  midiLastSeenText: $("midiLastSeenText"),
  midiActivityText: $("midiActivityText"),
  unlockAudioBtn: $("unlockAudioBtn"),
  levelList: $("levelList"),
  repertoireList: $("repertoireList"),
  catalogFilter: $("catalogFilter"),
  scoreCanvas: $("scoreCanvas"),
  scoreTitle: $("scoreTitle"),
  scoreSubtitle: $("scoreSubtitle"),
  expectedNoteText: $("expectedNoteText"),
  lastMidiText: $("lastMidiText"),
  accuracyText: $("accuracyText"),
  tempoText: $("tempoText"),
  eventLog: $("eventLog"),
  playBtn: $("playBtn"),
  pauseBtn: $("pauseBtn"),
  stopBtn: $("stopBtn"),
  tempoRange: $("tempoRange"),
  tempoValue: $("tempoValue"),
  reconnectMidiBtn: $("reconnectMidiBtn"),
  demoModeBtn: $("demoModeBtn"),
  toastHost: $("toastHost"),
};

const state = {
  preferredLevelId: levels[0]?.id ?? null,
  selectedItemId: getInitialSelection()?.id ?? null,
  searchQuery: "",
  practiceIndex: 0,
  noteStates: [],
  lastMidi: null,
  lastMidiAt: 0,
  lastMidiRaw: "—",
  lastAttempt: null,
  lastWrongIndex: null,
  accuracy: 0,
  correctCount: 0,
  wrongCount: 0,
  connectedInputs: [],
  midiAccess: null,
  midiEnabled: false,
  audioUnlocked: false,
  samplerReady: false,
  sampler: null,
  fallbackSynth: null,
  previewCursor: 0,
  previewPaused: true,
  previewToken: 0,
  previewItemId: null,
  demoMode: false,
};

let wrongResetTimer = null;
let midiMonitorTimer = null;
let renderFrame = 0;

function currentItem() {
  return getItemById(state.selectedItemId);
}

function currentSequence() {
  return practiceSequenceFor(currentItem() ?? getInitialSelection());
}

function itemLabel(item) {
  const level = getLevelById(item.levelId);
  const suffix = item.status === "placeholder" ? " · Hazırlanıyor" : " · Hazır";
  return `${level?.name ?? "Seviye"}${suffix}`;
}

function addLog(message, tone = "info", meta = "") {
  const row = document.createElement("div");
  row.className = `log-entry log-entry--${tone}`;
  row.innerHTML = `<strong>${message}</strong><span>${meta}</span>`;
  els.eventLog.prepend(row);
  while (els.eventLog.children.length > 8) {
    els.eventLog.lastElementChild?.remove();
  }
}

function toast(message, tone = "info", ms = 2400) {
  const node = document.createElement("div");
  node.className = `toast toast--${tone}`;
  node.textContent = message;
  els.toastHost.appendChild(node);
  window.setTimeout(() => {
    node.style.opacity = "0";
    node.style.transform = "translateY(8px)";
    node.style.transition = "opacity 180ms ease, transform 180ms ease";
  }, Math.max(800, ms - 180));
  window.setTimeout(() => node.remove(), ms);
}

function scheduleRender() {
  cancelAnimationFrame(renderFrame);
  renderFrame = requestAnimationFrame(renderAll);
}

function setMidiStatus(kind, text) {
  els.midiStatusText.textContent = text;
  const dot = els.midiStatus.querySelector(".midi-status__dot");
  dot.classList.remove("midi-status__dot--connected", "midi-status__dot--idle", "midi-status__dot--error");
  dot.classList.add(kind === "connected" ? "midi-status__dot--connected" : kind === "error" ? "midi-status__dot--error" : "midi-status__dot--idle");
}

function updateMidiMonitorUI() {
  const portNames = state.connectedInputs.map((input) => input.name || "Bilinmeyen cihaz");
  els.midiPortList.textContent = portNames.length ? portNames.join(" · ") : "—";
  els.midiRawText.textContent = state.lastMidiRaw || "—";
  els.midiLastSeenText.textContent = state.lastMidiAt ? `${Math.max(0, Math.round((Date.now() - state.lastMidiAt) / 1000))} sn önce` : "—";
  const hasPorts = state.connectedInputs.length > 0;
  const fresh = state.lastMidiAt && Date.now() - state.lastMidiAt < 4000;
  const flowLabel = !hasPorts
    ? "Port yok"
    : fresh
      ? "Veri akıyor"
      : "Bağlı ama veri bekleniyor";
  els.midiFlowText.textContent = flowLabel;
  els.midiActivityText.textContent = fresh ? "Aktif" : hasPorts ? "Bekliyor" : "Pasif";
  const dot = els.midiStatus.querySelector(".midi-status__dot");
  if (dot) {
    dot.classList.remove("midi-status__dot--connected", "midi-status__dot--idle", "midi-status__dot--error");
    if (!hasPorts) {
      dot.classList.add("midi-status__dot--idle");
    } else if (fresh) {
      dot.classList.add("midi-status__dot--connected");
    } else {
      dot.classList.add("midi-status__dot--idle");
    }
  }
}

function updateStatsUI() {
  const total = state.correctCount + state.wrongCount;
  state.accuracy = total ? Math.round((state.correctCount / total) * 100) : 0;
  els.accuracyText.textContent = `${state.accuracy}%`;
  const tempo = Number(els.tempoRange.value || 72);
  els.tempoValue.textContent = String(tempo);
  els.tempoText.textContent = `${tempo} BPM`;
  els.lastMidiText.textContent = state.lastMidi === null ? "—" : `${state.lastMidi} (${midiToNote(state.lastMidi)})`;

  const expected = currentSequence()[state.practiceIndex];
  els.expectedNoteText.textContent = expected ? `${expected.note} / MIDI ${expected.midi}` : "Hazır";

  const item = currentItem();
  if (item) {
    const level = getLevelById(item.levelId);
    els.currentItemBadge.textContent = item.status === "placeholder" ? "Hazırlanıyor" : "Hazır";
    els.currentMeta.textContent = `${item.title} · ${level?.title ?? "Seviye"} · ${item.bpm} BPM`;
    els.scoreTitle.textContent = item.title;
    els.scoreSubtitle.textContent = `${item.subtitle} · ${renderLabelFor(item)} · ${flattenSystems(item).map((s) => s.clef === "grand" ? "grand" : s.clef).join(" / ")}`;
  }
  updateMidiMonitorUI();
}

function renderLevels() {
  els.levelList.innerHTML = "";
  levels.forEach((level) => {
    const count = getItemsForLevel(level.id).length;
    const btn = document.createElement("button");
    btn.className = `nav-item ${state.preferredLevelId === level.id ? "is-active" : ""}`;
    btn.type = "button";
    btn.innerHTML = `
      <span>
        <strong>${level.name}</strong>
        <small>${level.title}</small>
      </span>
      <span class="catalog-item__meta">${count} öğe</span>
    `;
    btn.addEventListener("click", () => {
      state.preferredLevelId = level.id;
      renderLevels();
      renderCatalog();
      toast(`${level.name} seçildi`, "info");
      scheduleRender();
    });
    els.levelList.appendChild(btn);
  });
}

function visibleCatalogItems() {
  const filtered = filterCatalog(state.searchQuery);
  return filtered.sort((a, b) => {
    const aPreferred = a.levelId === state.preferredLevelId ? 0 : 1;
    const bPreferred = b.levelId === state.preferredLevelId ? 0 : 1;
    if (aPreferred !== bPreferred) return aPreferred - bPreferred;
    const aReady = a.status === "ready" ? 0 : 1;
    const bReady = b.status === "ready" ? 0 : 1;
    if (aReady !== bReady) return aReady - bReady;
    return a.title.localeCompare(b.title, "tr");
  });
}

function renderCatalog() {
  els.repertoireList.innerHTML = "";
  const items = visibleCatalogItems();

  items.forEach((item) => {
    const btn = document.createElement("button");
    btn.className = `catalog-item ${state.selectedItemId === item.id ? "is-active" : ""} ${item.status !== "ready" ? "is-locked" : ""}`;
    btn.type = "button";
    btn.innerHTML = `
      <span>
        <strong>${item.title}</strong>
        <small>${item.subtitle}</small>
      </span>
      <span class="catalog-item__meta">${itemLabel(item)}</span>
    `;
    btn.addEventListener("click", () => selectItem(item.id));
    els.repertoireList.appendChild(btn);
  });
}

function resetPracticeState() {
  state.practiceIndex = 0;
  state.noteStates = currentSequence().map(() => "pending");
  state.lastWrongIndex = null;
  state.lastMidi = null;
  state.lastAttempt = null;
  if (wrongResetTimer) {
    clearTimeout(wrongResetTimer);
    wrongResetTimer = null;
  }
}

function selectItem(id) {
  const item = getItemById(id);
  if (!item) return;
  state.selectedItemId = id;
  state.preferredLevelId = item.levelId;
  state.previewCursor = 0;
  state.previewPaused = true;
  state.previewItemId = id;
  resetPracticeState();
  renderLevels();
  renderCatalog();
  updateStatsUI();
  scheduleRender();
  toast(`${item.title} yüklendi`, item.status === "ready" ? "success" : "info");
  addLog(`Yüklendi: ${item.title}`, "info", item.status === "ready" ? "hazır" : "taslak");
}

function setCurrentNoteState(index, status) {
  if (index < 0) return;
  state.noteStates[index] = status;
}

function evaluateAttempt(midi, source = "MIDI") {
  const seq = currentSequence();
  const expected = seq[state.practiceIndex];
  if (!expected) {
    return;
  }

  state.lastMidi = midi;
  if (midi === expected.midi) {
    state.correctCount += 1;
    setCurrentNoteState(state.practiceIndex, "correct");
    state.lastWrongIndex = null;
    state.lastAttempt = { ok: true, midi, source };
    addLog(`Doğru: ${midiToNote(midi)}`, "success", `MIDI ${midi} · ${source}`);
    toast(`Doğru nota: ${midiToNote(midi)}`, "success");
    state.practiceIndex += 1;
    const next = seq[state.practiceIndex];
    if (next) {
      setCurrentNoteState(state.practiceIndex, "expected");
    }
    if (state.practiceIndex >= seq.length) {
      addLog("Bölüm tamamlandı", "success", currentItem()?.title ?? "");
      toast("Tebrikler, bölüm tamamlandı!", "success", 3000);
    }
  } else {
    state.wrongCount += 1;
    state.lastWrongIndex = state.practiceIndex;
    setCurrentNoteState(state.practiceIndex, "wrong");
    state.lastAttempt = { ok: false, midi, source };
    addLog(`Yanlış: ${midiToNote(midi)}`, "danger", `Beklenen ${expected.note}`);
    toast(`Yanlış nota. Beklenen: ${expected.note}`, "danger");
    if (wrongResetTimer) clearTimeout(wrongResetTimer);
    wrongResetTimer = setTimeout(() => {
      if (state.lastWrongIndex === state.practiceIndex && state.practiceIndex < seq.length) {
        setCurrentNoteState(state.practiceIndex, "expected");
        state.lastWrongIndex = null;
        scheduleRender();
      }
    }, 900);
  }
  updateStatsUI();
  renderCatalog();
  scheduleRender();
}

function parseMidiMessage(data) {
  const [status, data1 = 0, data2 = 0] = data;
  const command = status >> 4;
  const channel = status & 0x0f;
  if (command === 0x9 && data2 > 0) {
    return { type: "noteOn", note: data1, velocity: data2, channel };
  }
  if (command === 0x8 || (command === 0x9 && data2 === 0)) {
    return { type: "noteOff", note: data1, velocity: data2, channel };
  }
  if (command === 0xb) {
    return { type: "cc", controller: data1, value: data2, channel };
  }
  return { type: "other", raw: Array.from(data), channel };
}

function handleMidiMessage(event, portName = "MIDI") {
  const raw = Array.from(event.data || []);
  const parsed = parseMidiMessage(raw);
  if (!parsed) return;

  state.lastMidiAt = Date.now();
  state.lastMidiRaw = raw.length ? raw.join(" · ") : "—";

  if (parsed.type === "noteOn") {
    const label = midiToNote(parsed.note);
    addLog(`Geldi: ${label}`, "info", `MIDI ${parsed.note} · ${portName}`);
    evaluateAttempt(parsed.note, portName);
  } else if (parsed.type === "noteOff") {
    addLog(`Bırakıldı: ${midiToNote(parsed.note)}`, "info", `MIDI ${parsed.note}`);
  } else if (parsed.type === "cc") {
    addLog(`Kontrol: CC${parsed.controller}`, "info", `değer ${parsed.value} · ${portName}`);
  } else {
    addLog("MIDI veri paketi", "info", `${state.lastMidiRaw} · ${portName}`);
  }

  updateMidiMonitorUI();
}

function bindMidiInput(input) {
  const portName = input.name || "MIDI cihazı";
  const handler = (event) => handleMidiMessage(event, portName);
  input.onmidimessage = handler;
  if (typeof input.open === "function") {
    return input
      .open()
      .catch((error) => {
        console.warn("MIDI input open failed", portName, error);
        return null;
      })
      .then(() => input);
  }
  return Promise.resolve(input);
}

function scheduleMidiRetry() {
  const retry = () => {
    window.removeEventListener("pointerdown", retry);
    window.removeEventListener("touchstart", retry);
    window.removeEventListener("keydown", retry);
    connectMidi();
  };
  window.addEventListener("pointerdown", retry, { once: true, passive: true });
  window.addEventListener("touchstart", retry, { once: true, passive: true });
  window.addEventListener("keydown", retry, { once: true });
}

async function connectMidi() {
  if (!navigator.requestMIDIAccess) {
    setMidiStatus("error", "Bu tarayıcı MIDI desteklemiyor");
    toast("Web MIDI API yok: demo moduna geçin", "danger", 3200);
    return;
  }

  try {
    const access = await navigator.requestMIDIAccess({ sysex: false });
    state.midiAccess = access;
    state.midiEnabled = true;
    access.onstatechange = () => {
      refreshMidiPorts();
    };
    await refreshMidiPorts();
    if (state.connectedInputs.length) {
      setMidiStatus("connected", `${state.connectedInputs.length} cihaz bağlı`);
    } else {
      setMidiStatus("idle", "MIDI bekleniyor");
    }
    toast("MIDI erişimi açıldı", "success");
    addLog("MIDI erişimi açıldı", "success", "requestMIDIAccess");
  } catch (error) {
    state.midiEnabled = false;
    const message = error?.message ?? String(error);
    const permissionDenied = /not granted|denied|permission/i.test(message);
    if (permissionDenied) {
      setMidiStatus("idle", "MIDI izni bekleniyor");
      toast("MIDI izni verilmedi; uygun yetkili wrapper içinde tekrar deneyin", "info", 3200);
      addLog("MIDI izni bekleniyor", "info", message);
      scheduleMidiRetry();
    } else {
      setMidiStatus("error", "MIDI bağlantısı başarısız");
      console.error("MIDI error", error);
      toast("MIDI bağlantısı kurulamadı", "danger", 3000);
      addLog("MIDI hatası", "danger", message);
    }
  }
}

async function refreshMidiPorts() {
  if (!state.midiAccess) return;
  const inputs = Array.from(state.midiAccess.inputs.values());
  state.connectedInputs = [];
  for (const input of inputs) {
    await bindMidiInput(input);
    state.connectedInputs.push(input);
  }
  const names = state.connectedInputs.map((input) => input.name || "Bilinmeyen cihaz");
  if (names.length) {
    setMidiStatus("connected", `${names.length} cihaz bağlı`);
    addLog("Bağlı MIDI cihazları", "info", names.join(", "));
  } else {
    setMidiStatus("idle", "MIDI bekleniyor");
    addLog("MIDI girişi yok", "info", "wrapper bekleniyor");
  }
  updateMidiMonitorUI();
  renderCatalog();
}

async function ensureAudioEngine() {
  if (!Tone) {
    toast("Tone.js yüklenemedi", "danger", 3000);
    return false;
  }
  try {
    await Tone.start();
    state.audioUnlocked = true;
    if (!state.sampler && !state.fallbackSynth) {
      try {
        state.sampler = new Tone.Sampler({
          urls: {
            A0: "A0.mp3",
            C1: "C1.mp3",
            "D#1": "Ds1.mp3",
            F1: "F1.mp3",
            A1: "A1.mp3",
            C2: "C2.mp3",
            "D#2": "Ds2.mp3",
            "F#2": "Fs2.mp3",
            A2: "A2.mp3",
            C3: "C3.mp3",
            "D#3": "Ds3.mp3",
            F3: "F3.mp3",
            A3: "A3.mp3",
            C4: "C4.mp3",
            "D#4": "Ds4.mp3",
            "F#4": "Fs4.mp3",
            A4: "A4.mp3",
            C5: "C5.mp3",
            "D#5": "Ds5.mp3",
            "F#5": "Fs5.mp3",
            A5: "A5.mp3",
            C6: "C6.mp3",
            "D#6": "Ds6.mp3",
            "F#6": "Fs6.mp3",
            A6: "A6.mp3",
            C7: "C7.mp3",
          },
          release: 1.5,
          baseUrl: "https://tonejs.github.io/audio/salamander/",
          onload: () => {
            state.samplerReady = true;
            toast("Piyano örnekleri yüklendi", "success");
            addLog("Sampler hazır", "success", "Salamander");
          },
        }).toDestination();
        await Tone.loaded();
      } catch (samplerError) {
        console.warn("Sampler load failed, fallback to synth", samplerError);
      }
      if (!state.samplerReady) {
        state.fallbackSynth = new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: "triangle" },
          envelope: { attack: 0.02, decay: 0.2, sustain: 0.28, release: 1.4 },
        }).toDestination();
      }
    }
    els.unlockAudioBtn.textContent = "Ses Açıldı";
    els.unlockAudioBtn.disabled = true;
    return true;
  } catch (error) {
    console.error("Audio unlock failed", error);
    toast("Ses açma başarısız", "danger", 3200);
    addLog("Ses kilidi açılamadı", "danger", error?.message ?? String(error));
    return false;
  }
}

function playMidi(midi, durationBeats = 1, velocity = 0.9) {
  const note = Tone.Frequency(midi, "midi").toNote();
  const seconds = (60 / Number(els.tempoRange.value || 72)) * durationBeats;
  if (state.samplerReady && state.sampler) {
    state.sampler.triggerAttackRelease(note, Math.max(0.18, seconds), Tone.now(), velocity);
    return;
  }
  if (state.fallbackSynth) {
    state.fallbackSynth.triggerAttackRelease(note, Math.max(0.18, seconds), Tone.now(), velocity);
  }
}

async function runPreview() {
  const item = currentItem();
  if (!item) return;
  if (!state.audioUnlocked) {
    const ok = await ensureAudioEngine();
    if (!ok) return;
  }

  const seq = currentSequence();
  if (!seq.length) return;

  const token = ++state.previewToken;
  const startIndex = state.previewPaused && state.previewItemId === item.id ? state.previewCursor : 0;
  state.previewItemId = item.id;
  state.previewPaused = false;
  els.playBtn.textContent = startIndex > 0 ? "Play" : "Playing";
  els.pauseBtn.textContent = "Pause";

  addLog("Playback başladı", "info", item.title);
  for (let i = startIndex; i < seq.length; i += 1) {
    if (token !== state.previewToken || state.previewPaused) break;
    const step = seq[i];
    playMidi(step.midi, step.beats, 0.94);
    state.previewCursor = i + 1;
    await new Promise((resolve) => setTimeout(resolve, Math.round((60 / Number(els.tempoRange.value || 72)) * step.beats * 1000)));
  }

  if (token === state.previewToken && !state.previewPaused) {
    state.previewCursor = 0;
    state.previewPaused = true;
    els.playBtn.textContent = "Play";
    addLog("Playback tamamlandı", "success", item.title);
  } else {
    addLog("Playback duraklatıldı", "info", item.title);
  }
}

function pausePreview() {
  state.previewPaused = true;
  state.previewToken += 1;
  els.playBtn.textContent = "Play";
  addLog("Playback pause", "info", currentItem()?.title ?? "");
  toast("Playback duraklatıldı", "info");
}

function stopPreview() {
  state.previewPaused = true;
  state.previewToken += 1;
  state.previewCursor = 0;
  els.playBtn.textContent = "Play";
  state.practiceIndex = 0;
  state.noteStates = currentSequence().map(() => "pending");
  addLog("Playback stop", "info", currentItem()?.title ?? "");
  toast("Playback durduruldu", "info");
  updateStatsUI();
  scheduleRender();
}

function durationFromBeats(beats) {
  if (beats >= 4) return "w";
  if (beats >= 2) return "h";
  if (beats >= 1) return "q";
  if (beats >= 0.5) return "8";
  return "16";
}

function toVexKeyFromNoteName(noteName) {
  const match = /^([A-G])([#b]?)(-?\d+)$/.exec(noteName.trim());
  if (!match) {
    return "c/4";
  }
  const step = match[1].toLowerCase();
  const accidental = match[2];
  const octave = match[3];
  return `${step}${accidental}/${octave}`;
}

function buildMeasureChunks(notes, beatsPerMeasure = 4) {
  const chunks = [];
  let current = [];
  let currentBeats = 0;
  notes.forEach((note) => {
    if (current.length && currentBeats + note.beats > beatsPerMeasure) {
      chunks.push(current);
      current = [];
      currentBeats = 0;
    }
    current.push(note);
    currentBeats += note.beats;
    if (currentBeats >= beatsPerMeasure) {
      chunks.push(current);
      current = [];
      currentBeats = 0;
    }
  });
  if (current.length) chunks.push(current);
  return chunks;
}

function noteStyleForIndex(index) {
  const status = state.noteStates[index] ?? (index === state.practiceIndex ? "expected" : "pending");
  if (status === "correct") {
    return { fill: "#12a150", stroke: "#12a150" };
  }
  if (status === "wrong") {
    return { fill: "#d64545", stroke: "#d64545" };
  }
  if (status === "expected") {
    return { fill: "#3366ff", stroke: "#3366ff" };
  }
  return { fill: "#3f4a5f", stroke: "#3f4a5f" };
}

function renderSystem(system, systemIndex, totalSystems) {
  const container = document.createElement("div");
  container.className = "vf-row";

  const label = document.createElement("div");
  label.className = "vf-label";
  label.textContent = `${system.title} · ${system.clef === "grand" ? "Grand staff" : system.clef === "bass" ? "Bas anahtarı" : "Tiz anahtarı"}`;
  container.appendChild(label);

  const surface = document.createElement("div");
  surface.style.width = "100%";
  container.appendChild(surface);

  const width = Math.max(420, els.scoreCanvas.clientWidth - 48);
  const height = totalSystems > 1 ? 162 : 150;
  const renderer = new Renderer(surface, Renderer.Backends.SVG);
  renderer.resize(width, height);
  const context = renderer.getContext();

  const measureChunks = buildMeasureChunks(system.notes);
  const measureWidth = Math.max(180, Math.floor((width - 40) / Math.max(1, measureChunks.length)));
  let x = 12;

  measureChunks.forEach((chunk, chunkIndex) => {
    const stave = new Stave(x, 20, measureWidth - 10);
    if (chunkIndex === 0) {
      stave.addClef(system.clef === "bass" ? "bass" : "treble");
      stave.addTimeSignature("4/4");
    }
    stave.setContext(context).draw();

    const notes = chunk.map((note, noteIndex) => {
      const globalIndex = chunkIndex * 4 + noteIndex;
      const vexKey = toVexKeyFromNoteName(note.name);
      const staveNote = new StaveNote({ keys: [vexKey], duration: durationFromBeats(note.beats) });
      const accidental = note.name.includes("#") ? "#" : note.name.includes("b") ? "b" : null;
      if (accidental) {
        staveNote.addModifier(new Accidental(accidental), 0);
      }
      const style = noteStyleForIndex(globalIndex);
      staveNote.setStyle({ fillStyle: style.fill, strokeStyle: style.stroke });
      return staveNote;
    });

    const voice = new Voice({ num_beats: Math.min(4, chunk.reduce((sum, note) => sum + note.beats, 0)), beat_value: 4 });
    voice.setMode(Voice.Mode.SOFT);
    voice.addTickables(notes);
    Formatter.FormatAndDraw(context, stave, notes);
    x += measureWidth;
  });

  return container;
}

function renderScore() {
  els.scoreCanvas.innerHTML = "";
  const item = currentItem();
  if (!item) {
    const fallback = document.createElement("div");
    fallback.className = "empty-state";
    fallback.innerHTML = `
      <div>
        <div class="empty-state__icon">♪</div>
        <h3>Çalışmaya başlamak için bir egzersiz seçin</h3>
        <p>VexFlow notasyonu burada çizilecek. Play ile dinleyebilir, MIDI ile çalabilirsiniz.</p>
      </div>`;
    els.scoreCanvas.appendChild(fallback);
    return;
  }

  const systems = flattenSystems(item);
  const wrapper = document.createElement("div");
  wrapper.className = "vexflow-stage";
  systems.forEach((system, index) => {
    wrapper.appendChild(renderSystem(system, index, systems.length));
  });
  els.scoreCanvas.appendChild(wrapper);
}

function renderAll() {
  updateStatsUI();
  renderLevels();
  renderCatalog();
  renderScore();
}

function attachEvents() {
  els.catalogFilter.addEventListener("input", (event) => {
    state.searchQuery = event.target.value;
    renderCatalog();
  });

  els.tempoRange.addEventListener("input", () => {
    updateStatsUI();
  });

  els.unlockAudioBtn.addEventListener("click", async () => {
    if (state.audioUnlocked) return;
    const ok = await ensureAudioEngine();
    if (ok) {
      toast("Ses motoru açıldı", "success");
      addLog("AudioContext resumed", "success", "user gesture");
    }
  });

  els.reconnectMidiBtn.addEventListener("click", () => {
    connectMidi();
  });

  els.playBtn.addEventListener("click", () => {
    runPreview();
  });

  els.pauseBtn.addEventListener("click", () => {
    pausePreview();
  });

  els.stopBtn.addEventListener("click", () => {
    stopPreview();
  });

  els.demoModeBtn.addEventListener("click", () => {
    state.demoMode = !state.demoMode;
    els.demoModeBtn.textContent = state.demoMode ? "Demo Açık" : "Demo Klavye";
    toast(state.demoMode ? "Demo klavye açık" : "Demo klavye kapalı", state.demoMode ? "success" : "info");
    addLog("Demo modu", state.demoMode ? "success" : "info", state.demoMode ? "açık" : "kapalı");
  });

  window.addEventListener("keydown", (event) => {
    if (!state.demoMode) return;
    if (event.target && ["INPUT", "TEXTAREA"].includes(event.target.tagName)) return;
    const map = {
      a: 60,
      s: 62,
      d: 64,
      f: 65,
      g: 67,
      h: 69,
      j: 71,
      k: 72,
    };
    const midi = map[event.key.toLowerCase()];
    if (midi !== undefined) {
      event.preventDefault();
      handleMidiMessage({ data: [0x90, midi, 100] }, "Demo Klavye");
    }
  });

  window.addEventListener("resize", () => {
    scheduleRender();
  });

  window.addEventListener("orientationchange", () => {
    setTimeout(scheduleRender, 180);
  });
}

async function init() {
  attachEvents();
  renderAll();
  await connectMidi();

  const initialItem = currentItem() ?? getInitialSelection();
  if (initialItem) {
    selectItem(initialItem.id);
  }
  updateStatsUI();
  if (!midiMonitorTimer) {
    midiMonitorTimer = window.setInterval(() => {
      updateMidiMonitorUI();
    }, 1000);
  }
  if (!state.midiAccess && !state.midiEnabled) {
    setMidiStatus("idle", "MIDI bekleniyor");
  }
  if (typeof Tone !== "undefined") {
    addLog("Tone.js yüklendi", "success", Tone.version ?? "");
  }
}

VexFlow.BUILD = VexFlow.BUILD || {};
window.VexFlow = VexFlow;
window.TrainerAtaoglu = { state, catalog };

init().catch((error) => {
  console.error(error);
  toast("Uygulama başlatılamadı", "danger", 4000);
  addLog("Başlatma hatası", "danger", error?.message ?? String(error));
});
