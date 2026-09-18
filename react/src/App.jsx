import { useMemo, useRef, useState } from 'react';
import CandidateForm from './components/CandidateForm';
import WebcamTelemetry from './components/WebcamTelemetry';
import ChatContainer from './components/ChatContainer';
import VoiceController from './components/VoiceController';
import AiAvatar from './components/AiAvatar';
import AdminDashboard from './components/AdminDashboard';
import { sendChatMessage, finishInterview } from './api/interviewApi';

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
  const [stage, setStage] = useState('candidate');
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraError, setCameraError] = useState(null);

  const [currentStep, setCurrentStep] = useState(0);
  const [chatHistory, setChatHistory] = useState([]);
  const [aiState, setAiState] = useState('idle');
  const [textToSpeak, setTextToSpeak] = useState(null);

  const [liveTelemetry, setLiveTelemetry] = useState({ stress: 0, gaze: 'Depan', expression: 'Neutral / Santai' });
  const telemetrySamplesRef = useRef([]);
  const webcamRef = useRef(null);

  function handleTelemetryUpdate(data) {
    setLiveTelemetry(data);
    if (stage === 'interview') telemetrySamplesRef.current.push(data);
  }

  async function handleStartInterview(name) {
    setCameraLoading(true);
    setCameraError(null);
    setStudentName(name);
    setStage('interview');

    if ('speechSynthesis' in window) {
      const unlockUtterance = new SpeechSynthesisUtterance('');
      window.speechSynthesis.speak(unlockUtterance);
    }
  }

  function handleCameraReady() {
    setCameraLoading(false);
    setCurrentStep(0);
    const opening = `Halo ${studentName}! ${INITIAL_QUESTIONS[0]}`;
    setChatHistory([{ role: 'assistant', content: opening }]);
    setTextToSpeak(opening);
  }

  function handleCameraError() {
    setCameraLoading(false);
    setCameraError('Izinkan akses kamera & mikrofon terlebih dahulu, lalu coba lagi.');
    setStage('candidate');
  }

  async function handleAnswerSubmit(answerText) {
    setChatHistory((prev) => [...prev, { role: 'user', content: answerText }]);
    setAiState('thinking');

    const nextStep = currentStep + 1;

    try {
      const history = chatHistory.map(({ role, content }) => ({ role, content }));
      const response = await sendChatMessage({
        promptText: answerText,
        history,
        roomId,
        studentName,
        ekspresi: liveTelemetry.expression,
        stresLevel: Math.round(liveTelemetry.stress),
      });

      const aiFeedback = response?.result || 'Terima kasih atas jawabanmu!';

      if (nextStep < INITIAL_QUESTIONS.length) {
        setCurrentStep(nextStep);
        const nextQ = INITIAL_QUESTIONS[nextStep];
        const fullReply = `${aiFeedback}\n\n${nextQ}`;

        setChatHistory((prev) => [...prev, { role: 'assistant', content: fullReply }]);
        setTextToSpeak(fullReply);
      } else {
        const finalReply = `${aiFeedback}\n\nTerima kasih, seluruh pertanyaan wawancara telah selesai!`;
        setChatHistory((prev) => [...prev, { role: 'assistant', content: finalReply }]);
        setTextToSpeak(finalReply);
        setTimeout(() => finishSession(), 4000);
      }
    } catch (err) {
      if (nextStep < INITIAL_QUESTIONS.length) {
        setCurrentStep(nextStep);
        const fallback = `Terima kasih! Jawabanmu sudah tersimpan.\n\n${INITIAL_QUESTIONS[nextStep]}`;
        setChatHistory((prev) => [...prev, { role: 'assistant', content: fallback }]);
        setTextToSpeak(fallback);
      } else {
        finishSession();
      }
    }
  }

  function handleSpeakEnd() {
    setAiState('idle');
  }

  async function finishSession() {
    webcamRef.current?.stop();
    setStage('finished');
    const samples = telemetrySamplesRef.current;
    const avgStress = samples.length ? samples.reduce((sum, s) => sum + (s.stress || 0), 0) / samples.length : null;

    try {
      await finishInterview({ roomId, studentName, avgStress, psychologicalReport: null, telemetryLogs: samples });
    } catch (err) {
      console.warn('Gagal menyimpan rekap:', err.message);
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

            <button
              onClick={() => setStage(stage === 'admin' ? 'candidate' : 'admin')}
              className="px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white text-xs font-semibold transition flex items-center space-x-1.5"
            >
              <span>{stage === 'admin' ? '👤 Mode Siswa' : '📊 Dashboard Guru'}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-3 relative flex flex-col overflow-hidden">
        {stage === 'admin' && <AdminDashboard onBack={() => setStage('candidate')} />}

        {stage === 'candidate' && (
          <>
            <CandidateForm onSubmit={handleStartInterview} isLoading={cameraLoading} />
            {cameraError && <p className="text-center text-rose-600 text-sm mt-4">{cameraError}</p>}
          </>
        )}

        {stage === 'interview' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-[85vh] w-full">
            <div className="lg:col-span-5 flex flex-col space-y-3 h-full">
              <WebcamTelemetry
                ref={webcamRef}
                active={stage === 'interview'}
                onTelemetryUpdate={handleTelemetryUpdate}
                onReady={handleCameraReady}
                onError={handleCameraError}
              />

              <div className="grid grid-cols-2 gap-3 flex-shrink-0">
                <div className="bg-white rounded-xl p-3 flex flex-col items-center justify-center border border-gray-200 shadow-sm">
                  <span className="text-[10px] uppercase text-gray-500">Tingkat Stres</span>
                  <span className={`text-xl font-bold font-mono ${liveTelemetry.stress > 50 ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {Math.round(liveTelemetry.stress || 0)}%
                  </span>
                </div>
                <div className="bg-white rounded-xl p-3 flex flex-col items-center justify-center border border-gray-200 shadow-sm">
                  <span className="text-[10px] uppercase text-gray-500">Ekspresi Wajah</span>
                  <span className="text-xs font-semibold text-maroon-600 capitalize text-center">
                    {liveTelemetry.expression || 'Netral'}
                  </span>
                </div>
              </div>
            </div>

            <div className="lg:col-span-7 flex flex-col space-y-3 h-full overflow-hidden">
              <AiAvatar aiState={aiState} />

              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm flex-1 flex flex-col overflow-hidden">
                <ChatContainer studentName={studentName} chatHistory={chatHistory} aiState={aiState} bare />
                <VoiceController
                  disabled={aiState === 'thinking' || aiState === 'speaking'}
                  onSubmit={handleAnswerSubmit}
                  textToSpeak={textToSpeak}
                  onSpeakStart={() => setAiState('speaking')}
                  onSpeakEnd={handleSpeakEnd}
                />
              </div>
            </div>
          </div>
        )}

        {stage === 'finished' && (
          <div className="max-w-md mx-auto text-center bg-white p-8 rounded-2xl border border-gray-200 shadow-sm m-auto">
            <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-200 text-2xl">
              🎉
            </div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Wawancara Selesai!</h2>
            <p className="text-gray-500 text-sm mb-6">
              Terima kasih <span className="font-semibold text-gray-800">{studentName}</span>. Seluruh jawaban dan telemetri ekspresimu telah berhasil dicatat oleh sistem PPDB.
            </p>
            <div className="flex justify-center space-x-3">
              <button
                onClick={() => window.location.reload()}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-5 py-2.5 rounded-xl text-sm font-semibold transition"
              >
                Ulangi Sesi
              </button>
              <button
                onClick={() => setStage('admin')}
                className="bg-maroon-600 hover:bg-maroon-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition"
              >
                Buka Dashboard Admin
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
