// Satu elemen <audio> yang dipakai ulang untuk semua suara AI.
//
// Kenapa: browser (terutama Safari) hanya mengizinkan play() pada elemen yang
// pernah "dibuka" oleh gestur pengguna. Audio TTS baru siap beberapa detik
// setelah siswa menekan "Mulai Wawancara", jadi kita buka elemennya saat klik
// dengan audio senyap, lalu pakai elemen yang sama untuk semua TTS.

let sharedAudio = null;

// WAV senyap ±0.1 detik (44 byte header + data), base64.
const SILENT_WAV =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

export function getSharedAudio() {
  if (!sharedAudio) {
    sharedAudio = new Audio();
    sharedAudio.preload = 'auto';
  }
  return sharedAudio;
}

// Panggil SINKRON di dalam event handler klik.
export function unlockAudio() {
  try {
    const audio = getSharedAudio();
    audio.src = SILENT_WAV;
    const p = audio.play();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch {
    // Tidak fatal: TTS akan menampilkan tombol "Putar suara" bila diblokir.
  }
}
