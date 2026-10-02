// =====================================================================
// PARAMETER WAWANCARA — ubah di sini, tidak perlu menyentuh komponen.
// =====================================================================

// --- Turn-taking (deteksi siswa selesai bicara) ----------------------
// Jeda hening setelah siswa mulai bicara sebelum jawaban dianggap selesai.
// Terlalu kecil -> siswa yang berhenti sebentar untuk berpikir langsung dipotong.
// Terlalu besar -> terasa lambat.
export const SILENCE_TIMEOUT_MS = 1800;

// Total waktu suara yang harus terdeteksi sebelum hening boleh mengakhiri giliran.
// Mencegah batuk / suara kursi dianggap sebagai jawaban.
export const MIN_SPEECH_MS = 700;

// Jawaban lebih pendek dari ini (setelah transkripsi) dianggap noise dan tidak dikirim.
export const MIN_ANSWER_CHARS = 3;

// Batas atas satu giliran bicara. Setelah ini jawaban dipaksa selesai.
export const MAX_ANSWER_MS = 120_000;

// Bila siswa tidak bersuara sama sekali selama ini, AI memberi petunjuk.
export const NO_SPEECH_TIMEOUT_MS = 12_000;

// Setelah petunjuk ini muncul sebanyak N kali, tampilkan kotak ketik sebagai cadangan.
export const NO_SPEECH_MAX_HINTS = 2;

// --- Deteksi suara (VAD berbasis RMS dari Meyda) ---------------------
// Ambang minimum RMS agar dianggap suara. Ambang sebenarnya adaptif:
// max(VAD_MIN_RMS, noiseFloor * VAD_NOISE_MULTIPLIER).
export const VAD_MIN_RMS = 0.02;
export const VAD_NOISE_MULTIPLIER = 3;

// --- Jeda kecil antar giliran ----------------------------------------
// Jeda setelah audio AI selesai sebelum mic dibuka. Memberi waktu gema ruangan mereda
// sehingga ekor suara AI tidak terekam sebagai jawaban.
export const LISTEN_DELAY_AFTER_TTS_MS = 450;

// Bila TTS gagal, teks tetap tampil. Waktu baca minimum sebelum mic dibuka.
export const TTS_FAILED_READ_MS_PER_CHAR = 45;
export const TTS_FAILED_READ_MIN_MS = 1500;
export const TTS_FAILED_READ_MAX_MS = 8000;

// --- Throttle telemetri (supaya laptop sekolah tidak berat) -----------
export const AUDIO_TELEMETRY_INTERVAL_MS = 200;
export const TELEMETRY_SAMPLE_INTERVAL_MS = 1000;

// --- Ekspresi wajah AI -----------------------------------------------
// Ekspresi hanyalah visual state, bukan deteksi emosi manusia.
export const EXPRESSIONS = {
  idle: { emoji: '🙂', label: 'Siap' },
  thinking: { emoji: '🤔', label: 'Berpikir' },
  speaking: { emoji: '😊', label: 'Berbicara' },
  listening: { emoji: '👀', label: 'Mendengarkan' },
  processing: { emoji: '🤔', label: 'Memproses' },
  positive: { emoji: '😄', label: 'Senang' },
  surprised: { emoji: '😮', label: 'Terkejut' },
  serious: { emoji: '😐', label: 'Serius' },
  encouraging: { emoji: '😎', label: 'Menyemangati' },
  concerned: { emoji: '😕', label: 'Bermasalah' },
};

// Pilih ekspresi saat AI berbicara, berdasarkan konteks kalimatnya.
// Heuristik kata kunci sederhana — bukan analisis emosi.
export function pickSpeakingExpression(text = '', kind = 'followup') {
  if (kind === 'opening') return 'idle';
  if (kind === 'closing') return 'positive';
  if (kind === 'error') return 'serious';

  const t = text.toLowerCase();
  if (/\b(wah|wow|ternyata|menarik sekali|seru sekali)\b/.test(t)) return 'surprised';
  if (/\b(keren|hebat|mantap|bagus|luar biasa|semangat)\b/.test(t)) return 'encouraging';
  if (/\b(terima kasih|selamat|senang)\b/.test(t)) return 'positive';
  return 'speaking';
}
