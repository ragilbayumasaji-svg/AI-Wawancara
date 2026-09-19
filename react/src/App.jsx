import { useMemo, useRef, useState } from 'react';
import CandidateForm from './components/CandidateForm';
import TelemetryPanel from './components/TelemetryPanel';
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

  const stepRef = useRef(0);
  const isProcessingRef = useRef(false);

  const [chatHistory, setChatHistory] = useState([]);
  const [aiState, setAiState] = useState('idle');
  const [aiEmotion, setAiEmotion] = useState('neutral');
  const [textToSpeak, setTextToSpeak] = useState(null);

  // Telemetri Visual Wajah & Audio
  const [liveTelemetry, setLiveTelemetry] = useState({ stress: 0, gaze: 'Depan', expression: 'Netral / Santai' });
  const [audioTelemetry, setAudioTelemetry] = useState({ energy: 0, volumeLabel: 'Normal / Stabil' });

  const telemetrySamplesRef = useRef([]);
  const webcamRef = useRef(null);

  function handleTelemetryUpdate(data) {
    setLiveTelemetry(data);
    if (stage === 'interview') {
      telemetrySamplesRef.current.push({
        stress: data.stress || 0,
        expression: data.expression || 'Netral / Santai',
        energy: audioTelemetry.energy || 0,
        volumeLabel: audioTelemetry.volumeLabel || 'Normal / Stabil',
        timestamp: Date.now()
      });
    }
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
    stepRef.current = 0;
    const opening = `Halo ${studentName}! ${INITIAL_QUESTIONS[0]}`;
    setChatHistory([{ role: 'assistant', content: opening }]);
    setTextToSpeak(opening);
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

  async function handleAnswerSubmit(answerText) {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;

    const updatedHistory = [...chatHistory, { role: 'user', content: answerText }];
    setChatHistory(updatedHistory);
    setAiState('thinking');

    const nextStep = stepRef.current + 1;

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('API Timeout')), 3000)
    );

    try {
      const history = updatedHistory.map(({ role, content }) => ({ role, content }));
      
      const fetchPromise = sendChatMessage({
        promptText: answerText,
        history,
        roomId,
        studentName,
        ekspresi: liveTelemetry.expression,
        stresLevel: Math.round(liveTelemetry.stress),
        nadaSuara: audioTelemetry.volumeLabel,
        energiSuara: audioTelemetry.energy,
      });

      const response = await Promise.race([fetchPromise, timeoutPromise]);
      const rawFeedback = response?.result || 'Terima kasih atas jawabanmu!';
      
      const { emotion, cleanText } = parseAiResponse(rawFeedback);
      setAiEmotion(emotion);

      if (nextStep < INITIAL_QUESTIONS.length) {
        stepRef.current = nextStep;
        const nextQ = INITIAL_QUESTIONS[nextStep];
        const fullReply = `${cleanText}\n\n${nextQ}`;

        setChatHistory((prev) => [...prev, { role: 'assistant', content: fullReply }]);
        setTextToSpeak(fullReply);
      } else {
        const finalReply = `${cleanText}\n\nTerima kasih, seluruh pertanyaan wawancara telah selesai!`;
        const finalHistory = [...updatedHistory, { role: 'assistant', content: finalReply }];
        setChatHistory(finalHistory);
        setTextToSpeak(finalReply);
        setTimeout(() => finishSession(finalHistory), 3000);
      }
    } catch (err) {
      if (nextStep < INITIAL_QUESTIONS.length) {
        stepRef.current = nextStep;
        const fallback = `Terima kasih! Jawabanmu sudah tersimpan.\n\n${INITIAL_QUESTIONS[nextStep]}`;
        setChatHistory((prev) => [...prev, { role: 'assistant', content: fallback }]);
        setTextToSpeak(fallback);
      } else {
        const finalFallback = "Terima kasih! Seluruh pertanyaan wawancara telah selesai.";
        const finalHistory = [...updatedHistory, { role: 'assistant', content: finalFallback }];
        setChatHistory(finalHistory);
        setTextToSpeak(finalFallback);
        setTimeout(() => finishSession(finalHistory), 3000);
      }
    } finally {
      isProcessingRef.current = false;
      setAiState('idle');
    }
  }

  function handleSpeakEnd() {
    setAiState('idle');
    setAiEmotion('neutral');
  }

  async function finishSession(latestHistory = chatHistory) {
    webcamRef.current?.stop();
    setStage('finished');
    const samples = telemetrySamplesRef.current;
    
    let avgStress = 15;
    let avgEnergy = 0;
    let dominantExpression = 'Netral / Santai';
    let dominantTone = 'Normal / Stabil';

    if (samples.length > 0) {
      const totalStress = samples.reduce((acc, s) => acc + (s.stress || 0), 0);
      avgStress = Math.round(totalStress / samples.length);

      const totalEnergy = samples.reduce((acc, s) => acc + (s.energy || 0), 0);
      avgEnergy = Math.round(totalEnergy / samples.length);

      // Hitung Modus Ekspresi Wajah
      const exprCounts = {};
      samples.forEach(s => {
        if (s.expression) exprCounts[s.expression] = (exprCounts[s.expression] || 0) + 1;
      });
      dominantExpression = Object.keys(exprCounts).reduce((a, b) => exprCounts[a] > exprCounts[b] ? a : b, 'Netral / Santai');

      // Hitung Modus Nada Suara Meyda
      const toneCounts = {};
      samples.forEach(s => {
        if (s.volumeLabel) toneCounts[s.volumeLabel] = (toneCounts[s.volumeLabel] || 0) + 1;
      });
      dominantTone = Object.keys(toneCounts).reduce((a, b) => toneCounts[a] > toneCounts[b] ? a : b, 'Normal / Stabil');
    }

    const newRecord = {
      id: Date.now(),
      roomId,
      studentName: studentName || 'Siswa Tanpa Nama',
      avgStress,
      avgEnergy,
      dominantExpression,
      dominantTone,
      date: new Date().toLocaleString('id-ID'),
      chatHistory: latestHistory,
      samplesCount: samples.length
    };

    try {
      const existing = JSON.parse(localStorage.getItem('interview_results') || '[]');
      localStorage.setItem('interview_results', JSON.stringify([newRecord, ...existing]));
    } catch (e) {
      console.error('Gagal simpan lokal:', e);
    }

    try {
      await finishInterview({ roomId, studentName, avgStress, psychologicalReport: null, telemetryLogs: samples });
    } catch (err) {}
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
              <TelemetryPanel
                ref={webcamRef}
                active={stage === 'interview'}
                voiceTelemetry={audioTelemetry}
                onTelemetryChange={handleTelemetryUpdate}
                onReady={handleCameraReady}
                onError={handleCameraError}
              />
            </div>

            <div className="lg:col-span-7 flex flex-col space-y-3 h-full overflow-hidden">
              <AiAvatar aiState={aiState} emotion={aiEmotion} />

              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm flex-1 flex flex-col overflow-hidden">
                <ChatContainer studentName={studentName} chatHistory={chatHistory} aiState={aiState} bare />
                <VoiceController
                  disabled={aiState === 'thinking'}
                  onSubmit={handleAnswerSubmit}
                  textToSpeak={textToSpeak}
                  onSpeakStart={() => setAiState('speaking')}
                  onSpeakEnd={handleSpeakEnd}
                  onAudioTelemetry={setAudioTelemetry}
                  emotion={aiEmotion}
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
              Terima kasih <span className="font-semibold text-gray-800">{studentName}</span>. Seluruh jawaban, ekspresi wajah, dan indikator nada suaramu telah berhasil dicatat.
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
