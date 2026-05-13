# Trainer Ataoglu

HTML5/Web MIDI piyano eğitim uygulaması. iPad Air 13" için yatay/dikey uyumlu, VexFlow notasyonlu, Tone.js ses motorlu tek sayfa uygulama.

## Özellikler

- iPad odaklı responsive düzen
- Üst bar: uygulama adı + MIDI durumu + ses açma
- Sol menü: 5 seviye + Top 50 repertuar
- Orta alan: VexFlow portre/nota çizimi
- Alt bar: Play / Pause / Stop + BPM kontrolü
- Web MIDI ayrıştırma: noteOn / noteOff / velocity
- Tone.js ile preview playback
- Demo klavye ile MIDI simülasyonu
- 5 seviye ve 50 parçalık genişleyebilir içerik iskeleti

## Çalıştırma

Yerel test için:

```bash
python3 -m http.server 4173 --bind 127.0.0.1
```

Sonra tarayıcıda aç:

```text
http://127.0.0.1:4173/
```

## Notlar

- MIDI erişimi, cihazın çalıştığı Web MIDI wrapper ortamına bağlıdır.
- İlk sürümde ilk 3 repertuar öğesi aktif içerik taşır; diğerleri genişletilebilir şablon olarak bırakıldı.
- Ses motoru için Tone.js, nota çizimi için VexFlow kullanılır.
- `vendor/` klasörü, harici bağımlılıkların statik site içinde çalışması için kopyalanmış build dosyalarını içerir.
