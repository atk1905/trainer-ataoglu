const NOTE_OFFSETS = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

const REVERSE_NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function noteToMidi(note) {
  const match = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(note.trim());
  if (!match) {
    throw new Error(`Geçersiz nota: ${note}`);
  }
  const step = match[1].toUpperCase();
  const accidental = match[2];
  const octave = Number(match[3]);
  let midi = (octave + 1) * 12 + NOTE_OFFSETS[step];
  if (accidental === "#") midi += 1;
  if (accidental === "b") midi -= 1;
  return midi;
}

export function midiToNote(midi) {
  const clamped = Math.max(0, Math.min(127, Math.round(midi)));
  const noteName = REVERSE_NOTE_NAMES[clamped % 12];
  const octave = Math.floor(clamped / 12) - 1;
  return `${noteName}${octave}`;
}

export function midiToVexKey(midi) {
  const clamped = Math.max(0, Math.min(127, Math.round(midi)));
  const noteName = REVERSE_NOTE_NAMES[clamped % 12].toLowerCase();
  const octave = Math.floor(clamped / 12) - 1;
  return `${noteName}/${octave}`;
}

export function beatsFromDuration(duration) {
  const map = {
    w: 4,
    h: 2,
    q: 1,
    8: 0.5,
    16: 0.25,
  };
  return map[duration] ?? 1;
}

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeNote(name, duration = "q", accent = null) {
  return {
    name,
    midi: noteToMidi(name),
    duration,
    beats: beatsFromDuration(duration),
    accent,
  };
}

function phrase(notes, title) {
  return {
    title,
    notes: notes.map((note) => (typeof note === "string" ? makeNote(note) : note)),
  };
}

function makeSystem(title, clef, notes, keySignature = 0) {
  return {
    title,
    clef,
    keySignature,
    notes: notes.map((note) => (typeof note === "string" ? makeNote(note) : note)),
  };
}

function buildPracticeSequence(notes) {
  return notes.map((note) => ({
    note: note.name,
    midi: note.midi,
    duration: note.duration,
    beats: note.beats,
  }));
}

function basicItem({ id, title, subtitle, levelId, category, clef, bpm, systems, practiceNotes, status = "ready" }) {
  const practiceSequence = buildPracticeSequence(practiceNotes.map((n) => (typeof n === "string" ? makeNote(n) : n)));
  return {
    id,
    title,
    subtitle,
    levelId,
    category,
    clef,
    bpm,
    status,
    systems,
    practiceSequence,
    totalBeats: practiceSequence.reduce((sum, step) => sum + step.beats, 0),
  };
}

const exercises = [
  basicItem({
    id: "ex-1",
    title: "Seviye 1 · Orta Do Tek Ses",
    subtitle: "Sadece sağ el C–G arası",
    levelId: "lvl-1",
    category: "exercise",
    clef: "treble",
    bpm: 72,
    systems: [makeSystem("Isınma", "treble", ["C4", "D4", "E4", "F4", "G4"])],
    practiceNotes: ["C4", "D4", "E4", "F4", "G4"],
  }),
  basicItem({
    id: "ex-2",
    title: "Seviye 2 · Sol El Temeli",
    subtitle: "Bas anahtarı, düşük register",
    levelId: "lvl-2",
    category: "exercise",
    clef: "bass",
    bpm: 68,
    systems: [makeSystem("Bas Çalışması", "bass", ["C3", "E3", "G3", "A2", "F2"])],
    practiceNotes: ["C3", "E3", "G3", "A2", "F2"],
  }),
  basicItem({
    id: "ex-3",
    title: "Seviye 3 · İki El Senkron",
    subtitle: "Basit çapraz eşleşme",
    levelId: "lvl-3",
    category: "exercise",
    clef: "grand",
    bpm: 76,
    systems: [
      makeSystem("Sağ El", "treble", ["C4", "E4", "G4", "E4"]),
      makeSystem("Sol El", "bass", ["C3", "G2", "C3", "G2"]),
    ],
    practiceNotes: ["C4", "E4", "G4", "E4"],
  }),
];

const repertoireSeed = [
  {
    title: "Ode to Joy",
    subtitle: "Beethoven · Başlangıç melodisi",
    levelId: "lvl-1",
    clef: "treble",
    bpm: 76,
    systems: [makeSystem("Melodi", "treble", ["E4", "E4", "F4", "G4", "G4", "F4", "E4", "D4"])],
    practiceNotes: ["E4", "E4", "F4", "G4", "G4", "F4", "E4", "D4"],
  },
  {
    title: "Für Elise · Intro",
    subtitle: "Beethoven · Açılış motifi",
    levelId: "lvl-2",
    clef: "treble",
    bpm: 68,
    systems: [makeSystem("Melodi", "treble", ["E5", "D#5", "E5", "D#5", "E5", "B4", "D5", "C5"])],
    practiceNotes: ["E5", "D#5", "E5", "D#5", "E5", "B4", "D5", "C5"],
  },
  {
    title: "Minuet in G",
    subtitle: "J. S. Bach · Kısa giriş",
    levelId: "lvl-3",
    clef: "grand",
    bpm: 84,
    systems: [
      makeSystem("Sağ El", "treble", ["D5", "G4", "A4", "B4", "C5", "D5"]),
      makeSystem("Sol El", "bass", ["G2", "D3", "G2", "D3", "G2", "D3"]),
    ],
    practiceNotes: ["D5", "G4", "A4", "B4", "C5", "D5"],
  },
];

const repertoire = [...repertoireSeed];

const popularTitles = [
  ["Twinkle, Twinkle, Little Star", "lvl-1"],
  ["Mary Had a Little Lamb", "lvl-1"],
  ["Jingle Bells", "lvl-1"],
  ["Happy Birthday", "lvl-1"],
  ["Silent Night", "lvl-1"],
  ["When the Saints Go Marching In", "lvl-2"],
  ["Greensleeves", "lvl-2"],
  ["Canon in D", "lvl-3"],
  ["Bach Prelude in C", "lvl-3"],
  ["Moonlight Sonata · Intro", "lvl-3"],
  ["Gymnopédie No. 1", "lvl-3"],
  ["The Entertainer", "lvl-3"],
  ["Maple Leaf Rag", "lvl-4"],
  ["Swan Lake", "lvl-4"],
  ["Clair de Lune", "lvl-4"],
  ["Turkey March", "lvl-4"],
  ["River Flows in You", "lvl-4"],
  ["Auld Lang Syne", "lvl-1"],
  ["Amazing Grace", "lvl-1"],
  ["Ode to Joy (Full)", "lvl-2"],
  ["Fur Elise (Full Study)", "lvl-3"],
  ["Jesu, Joy of Man's Desiring", "lvl-4"],
  ["The Blue Danube", "lvl-4"],
  ["Pachelbel Canon Variation", "lvl-4"],
  ["Scarborough Fair", "lvl-2"],
  ["The First Noel", "lvl-1"],
  ["O Christmas Tree", "lvl-1"],
  ["Let It Be", "lvl-2"],
  ["Imagine", "lvl-2"],
  ["Hallelujah", "lvl-3"],
  ["La Cucaracha", "lvl-1"],
  ["Frère Jacques", "lvl-1"],
  ["Für Elise · Practice Loop", "lvl-2"],
  ["Arabesque", "lvl-4"],
  ["Morning Mood", "lvl-3"],
  ["Sailor's Hornpipe", "lvl-2"],
  ["Kış Güneşi", "lvl-2"],
  ["Çanakkale İçinde", "lvl-2"],
  ["Üsküdar'a Gider İken", "lvl-2"],
  ["Long, Long Ago", "lvl-2"],
  ["Largo", "lvl-3"],
  ["The Promise", "lvl-3"],
  ["Prelude in E Minor", "lvl-4"],
  ["Chopsticks", "lvl-1"],
  ["Nocturne in E-flat", "lvl-4"],
  ["Tarantella", "lvl-4"],
  ["Eine Kleine Nachtmusik", "lvl-3"],
  ["Over the Rainbow", "lvl-2"],
  ["Old MacDonald", "lvl-1"],
  ["Für Elise · Left Hand Study", "lvl-2"],
];

function makePlaceholderPattern(seed) {
  const roots = ["C4", "D4", "E4", "G4", "A4", "C5"];
  const bass = ["C3", "G2", "A2", "F2", "D3"];
  const melody = [roots[seed % roots.length], roots[(seed + 1) % roots.length], roots[(seed + 2) % roots.length], roots[(seed + 3) % roots.length]];
  return {
    systems: [makeSystem("Taslak Melodi", seed % 2 === 0 ? "treble" : "bass", melody)],
    practiceNotes: melody,
    clef: seed % 2 === 0 ? "treble" : "bass",
  };
}

popularTitles.forEach(([title, levelId], index) => {
  const pattern = makePlaceholderPattern(index + 1);
  repertoire.push(
    basicItem({
      id: `rep-${String(index + 4).padStart(2, "0")}`,
      title,
      subtitle: "Hazırlanıyor · ilk sürümde örnek yapı",
      levelId,
      category: "repertoire",
      clef: pattern.clef,
      bpm: 72 + (index % 5) * 4,
      systems: pattern.systems,
      practiceNotes: pattern.practiceNotes,
      status: index < 3 ? "ready" : "placeholder",
    })
  );
});

const levels = [
  {
    id: "lvl-1",
    name: "Seviye 1",
    title: "Başlangıç",
    description: "Sağ el C-G, tek ses, yavaş tempo.",
    range: "MIDI 60–72",
    accent: "#3366ff",
  },
  {
    id: "lvl-2",
    name: "Seviye 2",
    title: "Temel Sol El",
    description: "Bas anahtarı ve iki elin temel koordinasyonu.",
    range: "MIDI 48–67",
    accent: "#12a150",
  },
  {
    id: "lvl-3",
    name: "Seviye 3",
    title: "Ritim ve Senkron",
    description: "İki elde ölçü içi koordinasyon ve tempo takibi.",
    range: "MIDI 45–76",
    accent: "#8b5cf6",
  },
  {
    id: "lvl-4",
    name: "Seviye 4",
    title: "Geniş Register",
    description: "Daha geniş aralık, dinamik kontrol ve akıcı geçişler.",
    range: "MIDI 40–84",
    accent: "#d69e2e",
  },
  {
    id: "lvl-5",
    name: "Seviye 5",
    title: "İleri Teknik",
    description: "Karmaşık ritim, hızlı geçiş ve iki el bağımsızlık.",
    range: "MIDI 36–96",
    accent: "#d64545",
  },
];

export const catalog = {
  levels,
  exercises,
  repertoire,
};

export function getItemById(id) {
  return catalog.exercises.concat(catalog.repertoire).find((item) => item.id === id) ?? null;
}

export function getLevelById(id) {
  return levels.find((level) => level.id === id) ?? null;
}

export function getItemsForLevel(levelId) {
  return catalog.exercises.concat(catalog.repertoire).filter((item) => item.levelId === levelId);
}

export function filterCatalog(query) {
  const q = query.trim().toLowerCase();
  const items = catalog.exercises.concat(catalog.repertoire);
  if (!q) return items;
  return items.filter((item) => `${item.title} ${item.subtitle} ${item.category}`.toLowerCase().includes(q));
}

export function getInitialSelection() {
  return catalog.exercises[0];
}

export function practiceSequenceFor(item) {
  return clone(item.practiceSequence ?? []);
}

export function renderLabelFor(item) {
  const level = getLevelById(item.levelId);
  return `${level?.name ?? item.levelId} · ${item.category === "exercise" ? "Egzersiz" : "Parça"}`;
}

export function flattenSystems(item) {
  return item.systems ?? [];
}
