// Client kecil untuk memanggil endpoint Laravel.
// Set VITE_API_BASE_URL di .env frontend jika backend Laravel di-hosting terpisah
// (mis. http://localhost:8000/api). Default: '/api' (satu domain / proxy Vite).
const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

async function parseJsonSafely(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { error: text || 'Respons tidak valid dari server.' };
  }
}

/**
 * Membuat sesi interview baru di Laravel.
 */
export async function login(email, password) {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password }),
  });

  const data = await parseJsonSafely(response);

  if (!response.ok) {
    throw new Error(data.message || data.error || 'Login gagal.');
  }

  return data.user;
}

export async function getCurrentUser() {
  const response = await fetch(`${API_BASE}/auth/me`, {
    credentials: 'include',
  });

  const data = await parseJsonSafely(response);

  if (!response.ok) {
    return null;
  }

  return data.user || null;
}

export async function logout() {
  const response = await fetch(`${API_BASE}/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  });

  const data = await parseJsonSafely(response);

  if (!response.ok) {
    throw new Error(data.message || data.error || 'Logout gagal.');
  }

  return data;
}

export async function startInterview({ roomId, studentName }) {
  const response = await fetch(`${API_BASE}/interview/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      room_id: roomId,
      student_name: studentName,
    }),
  });

  const data = await parseJsonSafely(response);

  if (!response.ok) {
    throw new Error(data.error || 'Gagal memulai sesi wawancara.');
  }

  return data;
}

/**
 * Kirim jawaban siswa ke AI HRD dan terima balasan + pertanyaan lanjutan.
 * @param {{ promptText: string, history: {role:string, content:string}[], roomId: string, studentName?: string, ekspresi?: string, stresLevel?: number }} payload
 */
export async function sendChatMessage({
  promptText,
  history = [],
  roomId,
  studentName = null,
  ekspresi = null,
  stresLevel = null,
  nadaSuara = null,
  energiSuara = null,
}) {
  const response = await fetch(`${API_BASE}/ai-chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      promptText,
      history,
      room_id: roomId,
      student_name: studentName,
      ekspresi,
      stres_level: stresLevel,
      nada_suara: nadaSuara,
      energi_suara: energiSuara,
    }),
  });

  const data = await parseJsonSafely(response);
  if (!response.ok) {
    throw new Error(data.error || 'Gagal menghubungi server AI.');
  }
  return data; // { result, provider }
}

/**
 * Ambil riwayat percakapan berdasarkan room_id.
 */
export async function fetchHistory(roomId) {
  const url = roomId
    ? `${API_BASE}/history?room_id=${encodeURIComponent(roomId)}`
    : `${API_BASE}/history`;
  const response = await fetch(url);
  const data = await parseJsonSafely(response);
  if (!response.ok) {
    throw new Error(data.error || 'Gagal mengambil riwayat percakapan.');
  }
  return data;
}

/**
 * Minta audio TTS dari Laravel (Edge-TTS) dan kembalikan sebagai Object URL
 * yang siap diputar lewat elemen <audio>.
 */
export async function fetchTtsAudioUrl(text, voice = 'id-ID-ArdiNeural') {
  const response = await fetch(`${API_BASE}/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice }),
  });

  if (!response.ok) {
    const data = await parseJsonSafely(response);
    throw new Error(data.error || 'Gagal menghasilkan audio TTS.');
  }

  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

/**
 * Simpan rekap akhir sesi wawancara.
 */
export async function finishInterview({
  roomId,
  studentName,
  avgStress,
  psychologicalReport,
  telemetryLogs,
  chatHistory,
}) {
  const response = await fetch(`${API_BASE}/interview/finish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      room_id: roomId,
      student_name: studentName,
      avg_stress: avgStress,
      psychological_report: psychologicalReport,
      telemetry_logs: telemetryLogs,
      chat_history: chatHistory,
    }),
  });

  const data = await parseJsonSafely(response);
  if (!response.ok) {
    throw new Error(data.error || 'Gagal menyimpan rekap wawancara.');
  }
  return data;
}

/**
 * Ambil statistik dashboard guru/admin.
 * Endpoint dilindungi middleware teacher.admin.
 */
export async function fetchTeacherDashboard() {
  const response = await fetch(`${API_BASE}/teacher/dashboard`, {
    credentials: 'include',
  });

  const data = await parseJsonSafely(response);

  if (!response.ok) {
    throw new Error(data.message || data.error || 'Gagal mengambil dashboard guru.');
  }

  return data;
}

/**
 * Ambil daftar seluruh sesi wawancara untuk guru/admin.
 */
export async function fetchTeacherInterviews() {
  const response = await fetch(`${API_BASE}/teacher/interviews`, {
    credentials: 'include',
  });

  const data = await parseJsonSafely(response);

  if (!response.ok) {
    throw new Error(data.message || data.error || 'Gagal mengambil daftar wawancara.');
  }

  return data;
}

/**
 * Ambil detail satu sesi wawancara:
 * identitas, hasil, jawaban, dan telemetry.
 */
export async function fetchTeacherInterviewDetail(interviewId) {
  const response = await fetch(
    `${API_BASE}/teacher/interviews/${encodeURIComponent(interviewId)}`,
    {
      credentials: 'include',
    }
  );

  const data = await parseJsonSafely(response);

  if (!response.ok) {
    throw new Error(
      data.message || data.error || 'Gagal mengambil detail wawancara.'
    );
  }

  return data;
}
