import { useEffect, useRef, useState } from 'react';
import CandidateForm from './components/CandidateForm';
import TelemetryPanel from './components/TelemetryPanel';
import VoiceController from './components/VoiceController';
import AiAvatar from './components/AiAvatar';
import AdminDashboard from './components/AdminDashboard';
import {
  sendChatMessage,
  startInterview,
  finishInterview,
  login,
  logout,
  getCurrentUser,
} from './api/interviewApi';
import { unlockAudio } from './utils/audioPlayer';
import {
  TELEMETRY_SAMPLE_INTERVAL_MS,
  pickSpeakingExpression,
} from './config/interviewConfig';

const MAX_FOLLOW_UPS = 2;
const CHAT_TIMEOUT_MS = 25000;

// Jaring pengaman: bila audio penutup macet, sesi tetap ditutup setelah waktu ini.
const CLOSING_SAFETY_MS = 90000;

// ?debug=1 -> tampilkan kembali preview kamera + panel telemetri (untuk uji coba guru/developer).
const DEBUG_MODE = new URLSearchParams(window.location.search).has('debug');

const INITIAL_QUESTIONS = [
  'Halo! Boleh cerita, apa alasan utama kamu memilih sekolah kami sebagai pilihanmu?',
  'Di luar jam pelajaran, apa hobi atau kegiatan yang paling kamu sukai?',
  'Kalau ada, jurusan atau ekstrakurikuler apa yang paling menarik minatmu di sekolah ini?',
  'Apa cita-cita atau target yang ingin kamu capai dalam beberapa tahun ke depan?',
  'Terakhir, ketika menghadapi pelajaran yang terasa sulit, biasanya bagaimana caramu menghadapinya?',
];

function makeRoomId() {
  const params = new URLSearchParams(window.location.search);
  return params.get('room') || `SISWA-${Date.now().toString(36).toUpperCase()}`;
}

export default function App() {
  const [roomId] = useState(makeRoomId);
  const [studentName, setStudentName] = useState('');
  const [interviewId, setInterviewId] = useState(null);
  const [stage, setStage] = useState('candidate');
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraError, setCameraError] = useState(null);

  const [currentUser, setCurrentUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [showLogin, setShowLogin] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');

  // ---- Controller wawancara (ref: tidak memicu render) ----
  const stepRef = useRef(0);
  const followUpRef = useRef(0);
  const isProcessingRef = useRef(false);
  const chatHistoryRef = useRef([]); // riwayat lengkap: dikirim saat finish + cadangan konteks
  const lastAssistantRef = useRef(''); // ucapan AI terakhir = pertanyaan yang sedang dijawab siswa
  const finishingRef = useRef(false); // true setelah kalimat penutup diucapkan
  const finishedRef = useRef(false);
  const openingSpokenRef = useRef(false);
  const speechIdRef = useRef(0);
  const noticeTimerRef = useRef(null);
  const stageRef = useRef('candidate');
  const interviewIdRef = useRef(null);
  const interviewStartedAtRef = useRef(0);

  // ---- State tampilan percakapan ----
  const [speech, setSpeech] = useState(null); // { id, text, kind, listenAfter }
  const [aiThinking, setAiThinking] = useState(false);
  const [voicePhase, setVoicePhase] = useState('idle');
  const [aiNotice, setAiNotice] = useState('');
  const [questionNumber, setQuestionNumber] = useState(1);

  // ---- Telemetri wajah & audio: disimpan di ref agar App tidak re-render 30x/detik ----
  const liveTelemetryRef = useRef({ facialTension: null, gaze: 'Depan', expression: 'Netral / Santai', timestamp: null });
  const audioTelemetryRef = useRef({ energy: null, volumeLabel: null, zcr: null, active: false, timestamp: null });
  const lastSampleAtRef = useRef(0);
  const telemetrySamplesRef = useRef([]);
  const webcamRef = useRef(null);
  const [debugAudio, setDebugAudio] = useState(null); // hanya dipakai saat ?debug=1

  useEffect(() => {
    stageRef.current = stage;
  }, [stage]);

  useEffect(() => () => clearTimeout(noticeTimerRef.current), []);

  useEffect(() => {
    let cancelled = false;

    async function checkAuth() {
      try {
        const user = await getCurrentUser();

        if (!cancelled) {
          setCurrentUser(user);
        }
      } catch (error) {
        console.error('Gagal mengecek login:', error);

        if (!cancelled) {
          setCurrentUser(null);
        }
      } finally {
        if (!cancelled) {
          setAuthLoading(false);
        }
      }
    }

    checkAuth();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleTeacherLogin(event) {
    event.preventDefault();

    setLoginLoading(true);
    setLoginError('');

    try {
      const user = await login(loginEmail.trim(), loginPassword);

      if (!['teacher', 'admin'].includes(user?.role)) {
        throw new Error('Akun ini tidak memiliki akses dashboard guru.');
      }

      setCurrentUser(user);
      setShowLogin(false);
      setLoginPassword('');
      setStage('admin');
    } catch (error) {
      setLoginError(error.message || 'Login gagal.');
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleTeacherLogout() {
    try {
      await logout();
    } catch (error) {
      console.error('Logout gagal:', error);
    } finally {
      setCurrentUser(null);
      setStage('candidate');
      setShowLogin(false);
      setLoginPassword('');
    }
  }

  function handleTelemetryUpdate(data) {
    liveTelemetryRef.current = {
      ...liveTelemetryRef.current,
      facialTension: data?.facialTension ?? data?.stress ?? null,
      expression: data?.expression || liveTelemetryRef.current.expression,
      gaze: data?.gaze ?? liveTelemetryRef.current.gaze,
      timestamp: data?.timestamp || Date.now(),
    };
  }

  function handleAudioTelemetry(stats) {
    audioTelemetryRef.current = {
      ...audioTelemetryRef.current,
      ...stats,
      timestamp: Date.now(),
    };
    if (DEBUG_MODE) setDebugAudio(stats);
  }

  // Kamera dan microphone disampling secara independen setiap ~1 detik.
  // Callback kamera tidak lagi menjadi pemicu penyimpanan telemetry audio.
  useEffect(() => {
    if (stage !== 'interview') return undefined;

    const timer = setInterval(() => {
      if (!interviewStartedAtRef.current) return;

      const now = Date.now();
      if (now - lastSampleAtRef.current < TELEMETRY_SAMPLE_INTERVAL_MS - 25) return;
      lastSampleAtRef.current = now;

      const face = liveTelemetryRef.current;
      const audio = audioTelemetryRef.current;

      telemetrySamplesRef.current.push({
        facialTension: face.facialTension,
        // stress dipertahankan sebagai alias untuk kompatibilitas backend lama.
        stress: face.facialTension,
        expression: face.expression || null,
        gaze: face.gaze || null,
        energy: audio.active ? audio.energy : null,
        volumeLabel: audio.active ? audio.volumeLabel : null,
        zcr: audio.active ? audio.zcr : null,
        elapsedSeconds: Math.round((now - interviewStartedAtRef.current) / 1000),
        timestamp: now,
      });
    }, 250);

    return () => clearInterval(timer);
  }, [stage]);

  async function handleStartInterview(name) {
    // Harus sinkron di dalam event klik: membuka izin audio untuk TTS berikutnya.
    unlockAudio();

    setCameraLoading(true);
    setCameraError(null);

    try {
      const response = await startInterview({
        roomId,
        studentName: name,
      });

      if (!response?.interview_id) {
        throw new Error('Server tidak mengembalikan interview_id.');
      }

      interviewIdRef.current = response.interview_id;
      setStudentName(name);
      setInterviewId(response.interview_id);
      setStage('interview');
    } catch (error) {
      console.error('Gagal memulai interview:', error);
      setCameraLoading(false);
      setCameraError(error.message || 'Gagal memulai sesi wawancara.');
      setStage('candidate');
    }
  }

  // Ucapkan teks AI: tampil di layar + diputar TTS oleh VoiceController.
  function say(text, kind = 'followup', { listenAfter = true } = {}) {
    speechIdRef.current += 1;
    lastAssistantRef.current = text;
    chatHistoryRef.current = [...chatHistoryRef.current, { role: 'assistant', content: text }];
    setSpeech({ id: speechIdRef.current, text, kind, listenAfter });
  }

  function showAiNotice(text) {
    setAiNotice(text);
    clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setAiNotice(''), 7000);
  }

  function handleCameraReady() {
    setCameraLoading(false);

    if (openingSpokenRef.current) return;
    openingSpokenRef.current = true;

    stepRef.current = 0;
    followUpRef.current = 0;
    setQuestionNumber(1);
    interviewStartedAtRef.current = Date.now();

    say(`Halo ${studentName}! ${INITIAL_QUESTIONS[0]}`, 'opening');
  }

  function handleCameraError() {
    setCameraLoading(false);
    setCameraError('Izinkan akses kamera & mikrofon terlebih dahulu, lalu coba lagi.');
    setStage('candidate');
  }

  function parseAiResponse(rawText) {
    let emotion = 'neutral';
    let cleanText = rawText;

    if (rawText.includes('[EMOSI: Empati]') || rawText.includes('[EMOSI: Tenang]')) {
      emotion = 'empathetic';
      cleanText = rawText.replace(/\[EMOSI:.*?\]/g, '').trim();
    } else if (rawText.includes('[EMOSI: Ceria]') || rawText.includes('[EMOSI: Antusias]')) {
      emotion = 'happy';
      cleanText = rawText.replace(/\[EMOSI:.*?\]/g, '').trim();
    } else if (rawText.includes('[EMOSI: Penasaran]') || rawText.includes('[EMOSI: Bingung]')) {
      emotion = 'curious';
      cleanText = rawText.replace(/\[EMOSI:.*?\]/g, '').trim();
    }

    return { emotion, cleanText };
  }

  // Kirim ke backend dengan 1x percobaan ulang untuk gangguan jaringan sesaat.
  async function requestAiReply(payload) {
    let lastError;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS);

      try {
        return await sendChatMessage({ ...payload, signal: controller.signal });
      } catch (error) {
        lastError = error;
        if (error?.name === 'AbortError') break; // timeout: jangan menunggu dua kali
        await new Promise((resolve) => setTimeout(resolve, 800));
      } finally {
        clearTimeout(timer);
      }
    }

    throw lastError;
  }

  async function handleAnswerSubmit(answerText) {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;

    const currentQuestion = lastAssistantRef.current;
    chatHistoryRef.current = [...chatHistoryRef.current, { role: 'user', content: answerText }];
    setAiThinking(true);
    setAiNotice('');

    /*
     * CONTROLLER WAWANCARA (tidak berubah secara konsep)
     *
     * stepRef      = pertanyaan utama yang sedang dibahas.
     * followUpRef  = jumlah follow-up pada pertanyaan tersebut.
     *
     * AI boleh menggali maksimal MAX_FOLLOW_UPS kali. Setelah itu controller pindah
     * ke pertanyaan utama berikutnya (atau menutup wawancara bila sudah yang terakhir).
     * Kalimat AI-nya dibuat backend dari jawaban terakhir siswa; backend juga
     * menyimpan jawaban ke database dan membaca konteks dari database.
     */
    const questionIndex = stepRef.current;
    const followUpCount = followUpRef.current;
    const shouldAdvance = followUpCount >= MAX_FOLLOW_UPS;
    const isLastMain = questionIndex >= INITIAL_QUESTIONS.length - 1;
    const nextMain = shouldAdvance && !isLastMain ? INITIAL_QUESTIONS[questionIndex + 1] : null;
    const isFinal = shouldAdvance && isLastMain;

    try {
      const telemetry = liveTelemetryRef.current;
      const audio = audioTelemetryRef.current;

      const response = await requestAiReply({
        promptText: answerText,
        history: chatHistoryRef.current.slice(0, -1), // cadangan bila DB tidak tersedia
        roomId,
        interviewId: interviewIdRef.current,
        studentName,
        currentQuestion,
        nextQuestion: nextMain,
        isFinal,
        ekspresi: telemetry.expression,
        stresLevel: telemetry.facialTension == null ? null : Math.round(telemetry.facialTension),
        nadaSuara: audio.volumeLabel,
        energiSuara: audio.energy,
      });

      if (response?.provider === 'fallback') {
        showAiNotice('Koneksi ke AI sedang bermasalah. Kita lanjutkan dulu ya.');
      }

      const { cleanText } = parseAiResponse(response?.result || 'Terima kasih atas jawabanmu.');

      if (nextMain) {
        stepRef.current = questionIndex + 1;
        followUpRef.current = 0;
        setQuestionNumber(questionIndex + 2);
        say(cleanText, 'question');
      } else if (isFinal) {
        finishingRef.current = true;
        say(cleanText, 'closing', { listenAfter: false });
        setTimeout(() => finishSession(), CLOSING_SAFETY_MS);
      } else {
        followUpRef.current = followUpCount + 1;
        say(cleanText, 'followup');
      }
    } catch (err) {
      console.error('Gagal memproses jawaban:', err);
      showAiNotice('Koneksi ke AI sedang bermasalah. Kita lanjutkan dulu ya.');

      /*
       * Kalau AI/server gagal, controller tetap menjaga struktur wawancara
       * supaya jumlah pertanyaan tidak berubah acak.
       */
      if (nextMain) {
        stepRef.current = questionIndex + 1;
        followUpRef.current = 0;
        setQuestionNumber(questionIndex + 2);
        say(nextMain, 'question');
      } else if (isFinal) {
        finishingRef.current = true;
        say('Terima kasih! Seluruh pertanyaan wawancara telah selesai.', 'closing', {
          listenAfter: false,
        });
        setTimeout(() => finishSession(), CLOSING_SAFETY_MS);
      } else {
        followUpRef.current = followUpCount + 1;
        say('Boleh ceritakan sedikit lebih detail tentang jawabanmu tadi?', 'followup');
      }
    } finally {
      isProcessingRef.current = false;
      setAiThinking(false);
    }
  }

  // Dipanggil VoiceController setiap kali audio AI selesai (atau gagal diputar).
  function handleSpeakEnd() {
    if (!finishingRef.current) return;

    // Kalimat penutup sudah selesai diucapkan -> baru tutup sesi.
    finishingRef.current = false;
    setTimeout(() => finishSession(), 900);
  }

  async function finishSession(latestHistory = chatHistoryRef.current) {
    if (finishedRef.current) return;
    finishedRef.current = true;

    webcamRef.current?.stop();
    setStage('finished');
    const samples = telemetrySamplesRef.current;

    const faceValues = samples
      .map((sample) => Number(sample.facialTension ?? sample.stress))
      .filter((value) => Number.isFinite(value));
    const avgStress = faceValues.length > 0
      ? Math.round(faceValues.reduce((sum, value) => sum + value, 0) / faceValues.length)
      : null;

    try {
      await finishInterview({
        roomId,
        studentName,
        avgStress,
        psychologicalReport: null,
        telemetryLogs: samples,
        chatHistory: latestHistory,
      });
    } catch (err) {
      console.error('Gagal menyimpan rekap wawancara:', err);
    }
  }

  // ---------------------------------------------------------------
  // TAMPILAN AVATAR: diturunkan dari state percakapan yang sebenarnya
  // ---------------------------------------------------------------
  function getAvatarView() {
    if (cameraLoading || !speech) {
      return { expression: 'idle', status: 'Menyiapkan wawancara...', isSpeaking: false };
    }

    if (aiThinking || voicePhase === 'submitted') {
      return {
        expression: aiNotice ? 'concerned' : 'thinking',
        status: 'Menganalisis jawaban...',
        isSpeaking: false,
      };
    }

    switch (voicePhase) {
      case 'transcribing':
        return { expression: 'processing', status: 'Memproses jawaban...', isSpeaking: false };
      case 'preparing':
        return { expression: 'thinking', status: 'Sedang memikirkan pertanyaan...', isSpeaking: false };
      case 'speaking':
        return {
          expression: pickSpeakingExpression(speech.text, speech.kind),
          status:
            speech.kind === 'question'
              ? 'Baik, kita lanjut ke pertanyaan berikutnya.'
              : speech.kind === 'closing'
                ? 'Wawancara selesai.'
                : 'Sedang berbicara...',
          isSpeaking: true,
        };
      case 'listening':
        return { expression: 'listening', status: 'Mendengarkan... silakan jawab', isSpeaking: false };
      case 'hearing':
        return { expression: 'listening', status: 'Mendengarkan jawaban kamu...', isSpeaking: false };
      case 'manual':
        return { expression: 'listening', status: 'Menunggu jawabanmu...', isSpeaking: false };
      default:
        return speech.kind === 'closing'
          ? { expression: 'positive', status: 'Wawancara selesai.', isSpeaking: false }
          : { expression: 'idle', status: 'Siap', isSpeaking: false };
    }
  }

  return (
    <div className="h-screen flex flex-col bg-[#F5F5F5] text-[#212121]">
      <header className="border-b-2 border-maroon-700 bg-maroon-600 sticky top-0 z-50 shadow-md">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setStage('candidate')}>
            <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center border border-white/30">
              <span className="text-lg">🤖</span>
            </div>
            <h1 className="text-lg font-display font-bold text-white tracking-tight">AI WawancARA</h1>
          </div>

          <div className="flex items-center space-x-3">
            {stage === 'interview' && (
              <div className="px-3 py-1 rounded-full bg-white/15 border border-white/30 text-[11px] font-mono flex items-center text-white">
                <span className="w-1.5 h-1.5 bg-emerald-300 rounded-full mr-2 animate-pulse" />
                Room: <span className="ml-1 font-semibold text-white">{roomId}</span>
              </div>
            )}

            {!authLoading && ['teacher', 'admin'].includes(currentUser?.role) && (
              <>
                <button
                  onClick={() =>
                    setStage(stage === 'admin' ? 'candidate' : 'admin')
                  }
                  className="px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white text-xs font-semibold transition flex items-center space-x-1.5"
                >
                  <span>
                    {stage === 'admin'
                      ? '👤 Mode Siswa'
                      : '📊 Dashboard Guru'}
                  </span>
                </button>

                <button
                  onClick={handleTeacherLogout}
                  className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition"
                >
                  Keluar
                </button>
              </>
            )}

            {!authLoading && !currentUser && (
              <button
                onClick={() => {
                  setShowLogin(true);
                  setLoginError('');
                }}
                className="px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white text-xs font-semibold transition"
              >
                🔐 Login Guru
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-3 relative flex flex-col overflow-hidden">
        {stage === 'admin' &&
          ['teacher', 'admin'].includes(currentUser?.role) && (
            <AdminDashboard
              onBack={() => setStage('candidate')}
            />
          )}

        {stage === 'admin' &&
          !['teacher', 'admin'].includes(currentUser?.role) && (
            <div className="max-w-md mx-auto my-auto bg-white p-8 rounded-2xl border border-rose-200 shadow-sm text-center">
              <div className="text-4xl mb-3">🔒</div>
              <h2 className="text-xl font-bold text-gray-800 mb-2">
                Akses Ditolak
              </h2>
              <p className="text-sm text-gray-500 mb-5">
                Dashboard rekapitulasi hanya dapat diakses oleh guru atau admin.
              </p>
              <button
                onClick={() => setStage('candidate')}
                className="bg-maroon-600 hover:bg-maroon-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold"
              >
                Kembali
              </button>
            </div>
          )}

        {stage === 'candidate' && (
          <>
            <CandidateForm onSubmit={handleStartInterview} isLoading={cameraLoading} />
            {cameraError && <p className="text-center text-rose-600 text-sm mt-4">{cameraError}</p>}
          </>
        )}

        {stage === 'interview' && (() => {
          const avatar = getAvatarView();

          return (
            <div className="relative flex-1 min-h-0 flex flex-col w-full">
              {/*
                Kamera TETAP aktif untuk telemetri wajah, tetapi preview disembunyikan
                supaya siswa fokus pada percakapan. Tambahkan ?debug=1 untuk melihatnya.
              */}
              {DEBUG_MODE ? (
                <div className="fixed left-4 bottom-4 w-72 z-40">
                  <TelemetryPanel
                    ref={webcamRef}
                    active={stage === 'interview'}
                    voiceTelemetry={debugAudio}
                    onTelemetryChange={handleTelemetryUpdate}
                    onReady={handleCameraReady}
                    onError={handleCameraError}
                  />
                </div>
              ) : (
                <TelemetryPanel
                  ref={webcamRef}
                  hidden
                  active={stage === 'interview'}
                  onTelemetryChange={handleTelemetryUpdate}
                  onReady={handleCameraReady}
                  onError={handleCameraError}
                />
              )}

              {/* Progres wawancara + indikator kamera */}
              <div className="w-full max-w-2xl mx-auto px-4 pt-1">
                <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
                  <span className="font-semibold">
                    Pertanyaan {Math.min(questionNumber, INITIAL_QUESTIONS.length)} dari {INITIAL_QUESTIONS.length}
                  </span>
                  <span className="flex items-center gap-1.5 text-gray-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    Kamera aktif
                  </span>
                </div>
                <div className="flex gap-1.5" aria-hidden="true">
                  {INITIAL_QUESTIONS.map((_, index) => (
                    <div
                      key={index}
                      className={`h-1.5 flex-1 rounded-full transition-colors duration-500 ${
                        index < questionNumber ? 'bg-maroon-600' : 'bg-gray-200'
                      }`}
                    />
                  ))}
                </div>
              </div>

              {/* Fokus utama: avatar AI + ucapan AI */}
              <div className="flex-1 min-h-0 overflow-y-auto flex flex-col items-center justify-center gap-4 px-4 py-3 w-full max-w-2xl mx-auto">
                <AiAvatar
                  expression={avatar.expression}
                  status={avatar.status}
                  isSpeaking={avatar.isSpeaking}
                />

                {aiNotice && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-3 py-1" role="status">
                    {aiNotice}
                  </p>
                )}

                {speech?.text && (
                  <div
                    key={speech.id}
                    className="speech-fade w-full bg-white rounded-2xl border border-gray-200 shadow-sm px-6 py-4 text-center"
                  >
                    <p className="text-lg leading-relaxed text-gray-800">{speech.text}</p>
                  </div>
                )}
              </div>

              {/* Jawaban siswa: live transcript, indikator mic, cadangan ketik */}
              <VoiceController
                disabled={aiThinking}
                speech={speech}
                onSubmit={handleAnswerSubmit}
                onPhaseChange={setVoicePhase}
                onSpeakEnd={handleSpeakEnd}
                onAudioTelemetry={handleAudioTelemetry}
              />

              {/* Layar penyiapan kamera & AI */}
              {cameraLoading && (
                <div className="absolute inset-0 z-20 bg-[#F5F5F5]/95 flex flex-col items-center justify-center gap-4 text-center px-6">
                  <div className="w-12 h-12 border-4 border-maroon-600 border-t-transparent rounded-full animate-spin" />
                  <p className="text-base font-semibold text-gray-800">Menyiapkan wawancara...</p>
                  <p className="text-sm text-gray-500 max-w-sm">
                    Izinkan akses kamera dan mikrofon jika browser memintanya.
                  </p>
                </div>
              )}
            </div>
          );
        })()}

        {stage === 'finished' && (
          <div className="max-w-md mx-auto text-center bg-white p-8 rounded-2xl border border-gray-200 shadow-sm m-auto">
            <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-200 text-2xl">
              🎉
            </div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Wawancara Selesai!</h2>
            <p className="text-gray-500 text-sm mb-6">
              Terima kasih <span className="font-semibold text-gray-800">{studentName}</span>. Seluruh jawaban, ekspresi wajah, dan indikator nada suaramu telah berhasil dicatat.
            </p>
            <div className="flex justify-center space-x-3">
              <button
                onClick={() => window.location.reload()}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-5 py-2.5 rounded-xl text-sm font-semibold transition"
              >
                Ulangi Sesi
              </button>
              {['teacher', 'admin'].includes(currentUser?.role) && (
                <button
                  onClick={() => setStage('admin')}
                  className="bg-maroon-600 hover:bg-maroon-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition"
                >
                  📊 Buka Dashboard Guru
                </button>
              )}
            </div>
          </div>
        )}
        {showLogin && (
          <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4">
            <form
              onSubmit={handleTeacherLogin}
              className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-200 p-6"
            >
              <div className="flex items-start justify-between mb-5">
                <div>
                  <h2 className="text-xl font-bold text-gray-800">
                    🔐 Login Guru
                  </h2>
                  <p className="text-sm text-gray-500 mt-1">
                    Masuk untuk melihat rekapitulasi wawancara siswa.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setShowLogin(false);
                    setLoginError('');
                  }}
                  className="text-gray-400 hover:text-gray-700 text-xl"
                >
                  ×
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={loginEmail}
                    onChange={(event) => setLoginEmail(event.target.value)}
                    autoComplete="username"
                    required
                    className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-maroon-600"
                    placeholder="Email guru"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">
                    Password
                  </label>
                  <input
                    type="password"
                    value={loginPassword}
                    onChange={(event) => setLoginPassword(event.target.value)}
                    autoComplete="current-password"
                    required
                    className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-maroon-600"
                    placeholder="Password"
                  />
                </div>

                {loginError && (
                  <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-xl px-3 py-2.5 text-sm">
                    {loginError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loginLoading}
                  className="w-full bg-maroon-600 hover:bg-maroon-700 disabled:opacity-60 text-white py-2.5 rounded-xl text-sm font-semibold transition"
                >
                  {loginLoading ? 'Memproses...' : 'Masuk ke Dashboard'}
                </button>
              </div>
            </form>
          </div>
        )}

      </main>
    </div>
  );
}
