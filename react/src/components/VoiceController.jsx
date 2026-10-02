import { useCallback, useEffect, useRef, useState } from 'react';
import Meyda from 'meyda';
import { fetchTtsAudioUrl, fetchSttTranscript } from '../api/interviewApi';
import { getSharedAudio } from '../utils/audioPlayer';
import {
  SILENCE_TIMEOUT_MS,
  MIN_SPEECH_MS,
  MIN_ANSWER_CHARS,
  MAX_ANSWER_MS,
  NO_SPEECH_TIMEOUT_MS,
  NO_SPEECH_MAX_HINTS,
  VAD_MIN_RMS,
  VAD_NOISE_MULTIPLIER,
  LISTEN_DELAY_AFTER_TTS_MS,
  TTS_FAILED_READ_MS_PER_CHAR,
  TTS_FAILED_READ_MIN_MS,
  TTS_FAILED_READ_MAX_MS,
  AUDIO_TELEMETRY_INTERVAL_MS,
} from '../config/interviewConfig';

/**
 * STATE MACHINE PERCAKAPAN (fase yang dilaporkan lewat onPhaseChange)
 *
 *   idle ──speech baru──▶ preparing ──audio mulai──▶ speaking
 *                                                       │ audio selesai
 *                                                       ▼
 *   submitted ◀── transcribing ◀── hearing ◀── listening
 *       │              ▲                          (mic terbuka, menunggu suara)
 *       │              └── hening >= SILENCE_TIMEOUT_MS
 *       └── parent memproses (AI berpikir) ──speech baru──▶ preparing ...
 *
 *   manual : mic tidak dapat dipakai -> siswa mengetik jawaban.
 *
 * Aturan penting:
 *  - Mic HANYA aktif pada fase listening/hearing. Selama AI berbicara track mic
 *    dimatikan (enabled=false) dan SpeechRecognition di-abort, sehingga suara AI
 *    tidak masuk kembali sebagai jawaban (feedback loop).
 *  - Groq Whisper tetap menjadi transkripsi final; Web Speech API hanya untuk
 *    teks live dan cadangan.
 *
 * Props:
 *  - disabled       : true saat parent sedang memproses jawaban (AI berpikir)
 *  - speech         : { id, text, kind, listenAfter } | null. Ganti id = ucapkan teks baru.
 *  - onSubmit(text) : jawaban final siswa
 *  - onPhaseChange(phase)
 *  - onSpeakStart(), onSpeakEnd()
 *  - onAudioTelemetry(stats) : telemetri nada suara (throttled)
 */

const TICK_MS = 150;
const MIN_AUDIO_BYTES = 1000;
const BAR_PATTERN = [0.55, 0.85, 1, 0.8, 0.5];

const REC_MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
];

// null = MediaRecorder tidak ada; '' = ada tapi biarkan browser memilih format.
function pickRecorderMime() {
  if (typeof MediaRecorder === 'undefined') return null;
  return REC_MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) || '';
}

function joinText(a, b) {
  return `${a || ''} ${b || ''}`.replace(/\s+/g, ' ').trim();
}

function describeMicError(error) {
  const name = error?.name || '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
    return {
      code: 'denied',
      message: 'Mic tidak dapat digunakan. Silakan izinkan akses microphone, lalu tekan "Coba lagi".',
    };
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') {
    return {
      code: 'missing',
      message: 'Microphone tidak ditemukan. Sambungkan microphone atau ketik jawabanmu.',
    };
  }
  return {
    code: 'error',
    message: 'Microphone tidak bisa dibuka. Tutup aplikasi lain yang memakai mic, atau ketik jawabanmu.',
  };
}

export default function VoiceController({
  disabled = false,
  speech = null,
  onSubmit,
  onPhaseChange,
  onSpeakStart,
  onSpeakEnd,
  onAudioTelemetry,
}) {
  // ---------- UI state ----------
  const [phase, setPhaseState] = useState('idle');
  const [transcript, setTranscript] = useState('');
  const [submittedText, setSubmittedText] = useState('');
  const [notice, setNotice] = useState(null); // { tone: 'info' | 'warn' | 'error', text }
  const [manualMode, setManualMode] = useState(false);
  const [showTypeBox, setShowTypeBox] = useState(false);
  const [typedAnswer, setTypedAnswer] = useState('');
  const [needsTap, setNeedsTap] = useState(false);
  const [micError, setMicError] = useState(null); // { code, message }

  // ---------- refs: props terbaru (menghindari closure basi) ----------
  const phaseRef = useRef('idle');
  const disabledRef = useRef(disabled);
  const speechRef = useRef(speech);
  const onSubmitRef = useRef(onSubmit);
  const onPhaseChangeRef = useRef(onPhaseChange);
  const onSpeakStartRef = useRef(onSpeakStart);
  const onSpeakEndRef = useRef(onSpeakEnd);
  const onAudioTelemetryRef = useRef(onAudioTelemetry);

  disabledRef.current = disabled;
  speechRef.current = speech;
  onSubmitRef.current = onSubmit;
  onPhaseChangeRef.current = onPhaseChange;
  onSpeakStartRef.current = onSpeakStart;
  onSpeakEndRef.current = onSpeakEnd;
  onAudioTelemetryRef.current = onAudioTelemetry;

  // ---------- refs: mic / rekaman ----------
  // turnToken naik setiap kali giliran berganti. Semua callback async membandingkan
  // token-nya; bila berbeda berarti sudah usang dan harus berhenti.
  const turnTokenRef = useRef(0);
  const mountedRef = useRef(true);
  const streamRef = useRef(null);
  const micPromiseRef = useRef(null); // permintaan getUserMedia yang sedang berjalan
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const recorderMimeRef = useRef('');
  const recognitionRef = useRef(null);
  const recognitionDeadRef = useRef(false); // true bila Web Speech API tidak bisa dipakai
  const recognitionStartedAtRef = useRef(0);
  const audioCtxRef = useRef(null);
  const meydaRef = useRef(null);
  const tickRef = useRef(null);
  const listenTimerRef = useRef(null);

  // ---------- refs: sesi mendengarkan ----------
  const committedTextRef = useRef(''); // teks dari instance recognition sebelumnya
  const sessionTextRef = useRef(''); // teks dari instance recognition yang sedang berjalan
  const liveTextRef = useRef(''); // gabungan keduanya
  const lastRecognitionAtRef = useRef(0);
  const voiceActiveRef = useRef(false);
  const speechMsRef = useRef(0);
  const lastVoiceAtRef = useRef(0);
  const listenStartedAtRef = useRef(0);
  const noSpeechDeadlineRef = useRef(0);
  const noSpeechHintsRef = useRef(0);
  const failedAttemptsRef = useRef(0);
  const noiseFloorRef = useRef(0.005);
  const smoothedRmsRef = useRef(0);
  const lastTelemetryAtRef = useRef(0);
  const lastBarsAtRef = useRef(0);
  const barsRef = useRef(null);
  const typeInputRef = useRef(null);

  // ---------- refs: TTS ----------
  const ttsUrlRef = useRef(null);
  const ttsWatchdogRef = useRef(null);
  const ttsFinishRef = useRef(null);

  const setPhase = useCallback((next) => {
    phaseRef.current = next;
    if (mountedRef.current) setPhaseState(next);
    onPhaseChangeRef.current?.(next);
  }, []);

  // =====================================================================
  // ANALISIS AUDIO (Meyda) + deteksi suara (VAD)
  // =====================================================================
  const stopAudioAnalysis = useCallback(() => {
    try {
      meydaRef.current?.stop();
    } catch {
      /* abaikan */
    }
    meydaRef.current = null;

    const ctx = audioCtxRef.current;
    audioCtxRef.current = null;
    if (ctx && ctx.state !== 'closed') {
      ctx.close().catch(() => {});
    }
    voiceActiveRef.current = false;
    smoothedRmsRef.current = 0;

    const bars = barsRef.current?.children;
    if (bars) for (const bar of bars) bar.style.transform = 'scaleY(0.2)';
  }, []);

  const startAudioAnalysis = useCallback((stream) => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const audioContext = new AudioCtx();
      audioContext.resume?.().catch(() => {});
      audioCtxRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);

      meydaRef.current = Meyda.createMeydaAnalyzer({
        audioContext,
        source,
        bufferSize: 512,
        featureExtractors: ['rms', 'zcr'],
        callback: (features) => {
          if (!features) return;
          const rms = features.rms || 0;
          const zcr = features.zcr || 0;

          // --- VAD adaptif: noise floor menyesuaikan kebisingan ruangan ---
          const smoothed = smoothedRmsRef.current * 0.6 + rms * 0.4;
          smoothedRmsRef.current = smoothed;

          const threshold = Math.max(VAD_MIN_RMS, noiseFloorRef.current * VAD_NOISE_MULTIPLIER);
          const active = smoothed > threshold;
          voiceActiveRef.current = active;
          if (!active) {
            noiseFloorRef.current = noiseFloorRef.current * 0.98 + smoothed * 0.02;
          }

          const now = performance.now();

          // --- Indikator level mic: langsung ke DOM, tanpa setState ---
          if (now - lastBarsAtRef.current > 80) {
            lastBarsAtRef.current = now;
            const bars = barsRef.current?.children;
            if (bars) {
              const level = Math.min(1, smoothed / 0.15);
              for (let i = 0; i < bars.length; i++) {
                bars[i].style.transform = `scaleY(${(0.2 + level * 0.8 * BAR_PATTERN[i % 5]).toFixed(2)})`;
              }
            }
          }

          // --- Telemetri nada suara (logika label sama seperti sebelumnya) ---
          if (
            onAudioTelemetryRef.current &&
            now - lastTelemetryAtRef.current >= AUDIO_TELEMETRY_INTERVAL_MS
          ) {
            lastTelemetryAtRef.current = now;

            let toneLabel = 'Normal / Stabil';
            if (rms > 0.12) toneLabel = 'Antusias / Tinggi';
            else if (rms < 0.02) toneLabel = 'Pelan / Ragu-ragu';
            else if (zcr > 40) toneLabel = 'Tegang / Nyaring';

            onAudioTelemetryRef.current({
              energy: Math.round(rms * 100),
              volumeLabel: toneLabel,
              zcr: Math.round(zcr),
            });
          }
        },
      });

      meydaRef.current.start();
    } catch (error) {
      console.error('Meyda error:', error);
    }
  }, []);

  // =====================================================================
  // WEB SPEECH API (teks live)
  // =====================================================================
  const stopRecognition = useCallback(() => {
    const rec = recognitionRef.current;
    recognitionRef.current = null;
    if (!rec) return;
    rec.onresult = null;
    rec.onerror = null;
    rec.onend = null;
    try {
      rec.abort();
    } catch {
      /* abaikan */
    }
  }, []);

  const startRecognition = useCallback((token) => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition || recognitionDeadRef.current) return;

    const rec = new SpeechRecognition();
    rec.lang = 'id-ID';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    sessionTextRef.current = '';
    recognitionStartedAtRef.current = Date.now();

    rec.onresult = (event) => {
      if (token !== turnTokenRef.current) return;

      let text = '';
      for (let i = 0; i < event.results.length; i++) {
        text += `${event.results[i][0]?.transcript || ''} `;
      }
      sessionTextRef.current = text.trim();

      const combined = joinText(committedTextRef.current, sessionTextRef.current);
      liveTextRef.current = combined;
      lastRecognitionAtRef.current = Date.now();
      setTranscript(combined);
    };

    rec.onerror = (event) => {
      // 'no-speech' dan 'aborted' normal. Sisanya: matikan teks live,
      // rekaman + Groq Whisper tetap berjalan sebagai transkripsi utama.
      if (event.error === 'no-speech' || event.error === 'aborted') return;
      console.warn('SpeechRecognition error:', event.error);
      recognitionDeadRef.current = true;
    };

    rec.onend = () => {
      if (recognitionRef.current !== rec) return; // dihentikan sengaja
      committedTextRef.current = joinText(committedTextRef.current, sessionTextRef.current);
      sessionTextRef.current = '';
      recognitionRef.current = null;

      // Chrome menghentikan recognition sendiri setelah jeda panjang. Nyalakan lagi
      // selama masih mendengarkan, tapi jangan loop bila langsung mati.
      const stillListening =
        token === turnTokenRef.current &&
        (phaseRef.current === 'listening' || phaseRef.current === 'hearing');
      const livedMs = Date.now() - recognitionStartedAtRef.current;

      if (stillListening && !recognitionDeadRef.current && livedMs > 400) {
        setTimeout(() => {
          if (token === turnTokenRef.current && !recognitionRef.current) startRecognition(token);
        }, 150);
      }
    };

    recognitionRef.current = rec;
    try {
      rec.start();
    } catch (error) {
      console.warn('Gagal memulai SpeechRecognition:', error);
      recognitionRef.current = null;
    }
  }, []);

  // =====================================================================
  // MIC
  // =====================================================================
  const setMicTracksEnabled = useCallback((enabled) => {
    streamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = enabled;
    });
  }, []);

  const releaseMicStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const ensureMicStream = useCallback(() => {
    const existing = streamRef.current;
    if (existing && existing.getAudioTracks().some((t) => t.readyState === 'live')) {
      return Promise.resolve(existing);
    }

    // Satu permintaan saja pada satu waktu (StrictMode / beginListening bisa memanggil bersamaan),
    // supaya tidak ada stream ganda yang bocor dan tetap menyala.
    if (micPromiseRef.current) return micPromiseRef.current;

    const request = (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        const err = new Error('getUserMedia tidak didukung');
        err.name = 'NotFoundError';
        throw err;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });

      if (!mountedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        throw new Error('Komponen sudah dilepas');
      }

      stream.getAudioTracks().forEach((t) => {
        t.enabled = false; // mic baru dibuka saat giliran siswa
      });
      streamRef.current = stream;
      return stream;
    })();

    micPromiseRef.current = request;
    const clear = () => {
      if (micPromiseRef.current === request) micPromiseRef.current = null;
    };
    request.then(clear, clear);

    return request;
  }, []);

  // Hentikan semua aktivitas mendengarkan TANPA mengirim apa pun.
  const haltListening = useCallback(() => {
    clearInterval(tickRef.current);
    tickRef.current = null;
    clearTimeout(listenTimerRef.current);
    listenTimerRef.current = null;

    stopRecognition();
    stopAudioAnalysis();

    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.onerror = null;
      try {
        if (recorder.state !== 'inactive') recorder.stop();
      } catch {
        /* abaikan */
      }
    }
    chunksRef.current = [];

    setMicTracksEnabled(false);
  }, [stopAudioAnalysis, stopRecognition, setMicTracksEnabled]);

  // =====================================================================
  // SELESAI BICARA -> STT FINAL -> SUBMIT
  // =====================================================================
  const submitAnswer = useCallback(
    (text) => {
      const answer = text.trim();
      failedAttemptsRef.current = 0;
      noSpeechHintsRef.current = 0;

      setNotice(null);
      setSubmittedText(answer);
      setTranscript(answer);
      setTypedAnswer('');
      liveTextRef.current = '';
      committedTextRef.current = '';
      sessionTextRef.current = '';

      setPhase('submitted');
      onSubmitRef.current?.(answer);
    },
    [setPhase]
  );

  // Ref supaya fungsi-fungsi di bawah bisa memanggil beginListening tanpa dependensi melingkar.
  const beginListeningRef = useRef(null);

  const resumeAfterEmpty = useCallback((token, text) => {
    failedAttemptsRef.current += 1;
    setNotice({ tone: 'warn', text });
    if (failedAttemptsRef.current >= 2) setShowTypeBox(true);

    listenTimerRef.current = setTimeout(() => {
      if (token === turnTokenRef.current && !disabledRef.current) {
        beginListeningRef.current?.(token);
      }
    }, 500);
  }, []);

  const finalizeTurn = useCallback(
    async (token, blob, hadSpeech) => {
      const liveText = liveTextRef.current.trim();
      let finalText = '';
      let sttFailed = false;

      // Hanya kirim ke Whisper bila memang ada suara. Rekaman senyap sering
      // dihalusinasi Whisper menjadi kalimat acak.
      if (hadSpeech && blob && blob.size >= MIN_AUDIO_BYTES) {
        try {
          finalText = ((await fetchSttTranscript(blob)) || '').trim();
        } catch (error) {
          console.error('STT gagal:', error);
          sttFailed = true;
        }
      }

      if (token !== turnTokenRef.current || !mountedRef.current) return;

      // Groq = final. Bila kosong/gagal, pakai teks live Web Speech API.
      if (!finalText) finalText = liveText;

      if (finalText.length >= MIN_ANSWER_CHARS) {
        if (sttFailed) console.warn('STT Groq gagal, memakai teks live Web Speech API.');
        submitAnswer(finalText);
        return;
      }

      resumeAfterEmpty(
        token,
        sttFailed
          ? 'Suaramu belum bisa dikenali. Coba ucapkan lagi, atau ketik jawabanmu.'
          : 'Aku belum menangkap jawabanmu. Coba ucapkan sekali lagi ya.'
      );
    },
    [submitAnswer, resumeAfterEmpty]
  );

  const finishTurn = useCallback(
    (reason) => {
      if (phaseRef.current !== 'listening' && phaseRef.current !== 'hearing') return;

      const token = turnTokenRef.current;
      const hadSpeech = speechMsRef.current >= MIN_SPEECH_MS || liveTextRef.current.trim().length > 0;
      console.info('Giliran bicara selesai:', reason, { speechMs: speechMsRef.current });

      setPhase('transcribing');

      clearInterval(tickRef.current);
      tickRef.current = null;
      stopRecognition();
      stopAudioAnalysis();
      setMicTracksEnabled(false); // mic mati begitu jawaban selesai

      const recorder = recorderRef.current;
      recorderRef.current = null;

      if (recorder && recorder.state !== 'inactive') {
        recorder.onstop = () => {
          const chunks = chunksRef.current;
          chunksRef.current = [];
          const blob = chunks.length
            ? new Blob(chunks, { type: recorderMimeRef.current || chunks[0].type || 'audio/webm' })
            : null;
          finalizeTurn(token, blob, hadSpeech);
        };
        try {
          recorder.stop();
        } catch {
          finalizeTurn(token, null, hadSpeech);
        }
      } else {
        // Tanpa MediaRecorder: hanya teks live yang tersedia.
        finalizeTurn(token, null, hadSpeech);
      }
    },
    [setPhase, stopRecognition, stopAudioAnalysis, setMicTracksEnabled, finalizeTurn]
  );

  // Dipanggil tiap TICK_MS selama mendengarkan: inti turn-taking.
  const onTick = useCallback(() => {
    const phaseNow = phaseRef.current;
    if (phaseNow !== 'listening' && phaseNow !== 'hearing') return;

    const now = Date.now();
    const voiceActive = voiceActiveRef.current || now - lastRecognitionAtRef.current < 500;

    if (voiceActive) {
      lastVoiceAtRef.current = now;
      speechMsRef.current += TICK_MS;
      if (phaseNow === 'listening' && speechMsRef.current >= 300) {
        setNotice(null);
        setPhase('hearing');
      }
    }

    const spokeEnough = speechMsRef.current >= MIN_SPEECH_MS;

    // 1. Siswa sudah bicara lalu diam cukup lama -> jawaban selesai.
    if (spokeEnough && now - lastVoiceAtRef.current >= SILENCE_TIMEOUT_MS) {
      finishTurn('silence');
      return;
    }

    // 2. Batas maksimum satu jawaban.
    if (now - listenStartedAtRef.current >= MAX_ANSWER_MS) {
      finishTurn('max-duration');
      return;
    }

    // 3. Belum ada suara sama sekali -> beri petunjuk, lalu tawarkan ketik.
    if (!spokeEnough && now >= noSpeechDeadlineRef.current) {
      noSpeechHintsRef.current += 1;
      noSpeechDeadlineRef.current = now + NO_SPEECH_TIMEOUT_MS;
      setNotice({
        tone: 'info',
        text: 'Aku belum mendengar suaramu. Silakan mulai bicara, atau ketik jawabanmu.',
      });
      if (noSpeechHintsRef.current >= NO_SPEECH_MAX_HINTS) setShowTypeBox(true);
    }
  }, [finishTurn, setPhase]);

  const beginListening = useCallback(
    async (token) => {
      if (token !== turnTokenRef.current || !mountedRef.current) return;
      if (disabledRef.current) return;

      // Tidak ada dukungan apa pun -> mode ketik.
      const recorderMime = pickRecorderMime();
      const hasRecorder = recorderMime !== null;
      const hasSR = Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
      if (!hasRecorder && !hasSR) {
        setManualMode(true);
        setNotice({
          tone: 'warn',
          text: 'Browser ini belum mendukung pengenalan suara. Silakan ketik jawabanmu. Untuk suara otomatis, gunakan Chrome atau Edge.',
        });
        setPhase('manual');
        return;
      }

      let stream;
      try {
        stream = await ensureMicStream();
      } catch (error) {
        if (token !== turnTokenRef.current || !mountedRef.current) return;
        const info = describeMicError(error);
        console.error('Mic gagal dibuka:', error);
        setMicError(info);
        setManualMode(true);
        setNotice({ tone: 'error', text: info.message });
        setPhase('manual');
        return;
      }

      if (token !== turnTokenRef.current || !mountedRef.current) return;
      if (disabledRef.current) return;

      setMicError(null);
      setManualMode(false);

      // ---- reset sesi ----
      committedTextRef.current = '';
      sessionTextRef.current = '';
      liveTextRef.current = '';
      speechMsRef.current = 0;
      voiceActiveRef.current = false;
      lastRecognitionAtRef.current = 0;
      chunksRef.current = [];
      const now = Date.now();
      listenStartedAtRef.current = now;
      lastVoiceAtRef.current = now;
      noSpeechDeadlineRef.current = now + NO_SPEECH_TIMEOUT_MS;
      setTranscript('');
      setSubmittedText('');

      // ---- buka mic ----
      setMicTracksEnabled(true);
      startAudioAnalysis(stream);

      if (hasRecorder) {
        try {
          const recorder = recorderMime
            ? new MediaRecorder(stream, { mimeType: recorderMime })
            : new MediaRecorder(stream);
          recorderMimeRef.current = recorder.mimeType || recorderMime || '';
          recorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
          };
          recorder.onerror = (event) => console.error('MediaRecorder error:', event.error);
          recorder.start(250);
          recorderRef.current = recorder;
        } catch (error) {
          console.error('MediaRecorder gagal:', error);
          recorderRef.current = null;
        }
      }

      startRecognition(token);

      clearInterval(tickRef.current);
      tickRef.current = setInterval(onTick, TICK_MS);

      setPhase('listening');
    },
    [ensureMicStream, setMicTracksEnabled, startAudioAnalysis, startRecognition, onTick, setPhase]
  );

  beginListeningRef.current = beginListening;

  // =====================================================================
  // TEXT-TO-SPEECH (Edge-TTS via Laravel) -> lalu mendengarkan
  // =====================================================================
  useEffect(() => {
    const current = speechRef.current;
    if (!current?.text) return undefined;

    const token = ++turnTokenRef.current;
    const listenAfter = current.listenAfter !== false;

    // Mic HARUS mati sebelum AI bicara (cegah feedback loop).
    haltListening();
    clearTimeout(ttsWatchdogRef.current);

    setTranscript('');
    setNotice(null);
    setNeedsTap(false);
    setPhase('preparing');

    const audio = getSharedAudio();
    let ended = false;

    const cleanupAudio = () => {
      clearTimeout(ttsWatchdogRef.current);
      audio.onended = null;
      audio.onerror = null;
      audio.onplaying = null;
      audio.onloadedmetadata = null;
      if (ttsUrlRef.current) {
        URL.revokeObjectURL(ttsUrlRef.current);
        ttsUrlRef.current = null;
      }
    };

    const afterSpeech = (delayMs) => {
      if (token !== turnTokenRef.current || !mountedRef.current) return;
      onSpeakEndRef.current?.();

      if (!listenAfter) {
        setPhase('idle');
        return;
      }

      listenTimerRef.current = setTimeout(() => {
        if (token === turnTokenRef.current) beginListening(token);
      }, delayMs);
    };

    const finish = (failed) => {
      if (ended) return;
      ended = true;
      cleanupAudio();
      ttsFinishRef.current = null;

      if (token !== turnTokenRef.current) return;

      if (failed) {
        // Teks tetap tampil. Beri waktu baca sebelum mic dibuka.
        setNotice({ tone: 'info', text: 'Suara AI tidak dapat diputar. Silakan baca teks di atas.' });
        const readMs = Math.min(
          TTS_FAILED_READ_MAX_MS,
          Math.max(TTS_FAILED_READ_MIN_MS, current.text.length * TTS_FAILED_READ_MS_PER_CHAR)
        );
        afterSpeech(readMs);
      } else {
        afterSpeech(LISTEN_DELAY_AFTER_TTS_MS);
      }
    };

    ttsFinishRef.current = finish;

    (async () => {
      try {
        const url = await fetchTtsAudioUrl(current.text, 'id-ID-ArdiNeural');

        if (token !== turnTokenRef.current) {
          URL.revokeObjectURL(url);
          return;
        }
        ttsUrlRef.current = url;

        audio.onplaying = () => {
          if (token !== turnTokenRef.current) return;
          setNeedsTap(false);
          setPhase('speaking');
          onSpeakStartRef.current?.();
        };
        audio.onended = () => finish(false);
        audio.onerror = () => finish(true);
        audio.onloadedmetadata = () => {
          // Jaring pengaman "audio tidak selesai": paksa lanjut bila onended tidak pernah datang.
          const durationMs = Number.isFinite(audio.duration) ? audio.duration * 1000 : 30_000;
          clearTimeout(ttsWatchdogRef.current);
          ttsWatchdogRef.current = setTimeout(() => finish(false), durationMs + 5000);
        };
        ttsWatchdogRef.current = setTimeout(() => finish(true), 90_000);

        audio.src = url;

        try {
          await audio.play();
        } catch (error) {
          if (error?.name === 'NotAllowedError') {
            // Browser memblokir autoplay: minta satu ketukan dari siswa.
            setNeedsTap(true);
            setPhase('speaking');
            return;
          }
          throw error;
        }
      } catch (error) {
        console.error('TTS error:', error);
        finish(true);
      }
    })();

    return () => {
      // Efek dijalankan ulang (speech baru / unmount): hentikan audio yang sedang berjalan.
      ended = true;
      ttsFinishRef.current = null;
      try {
        audio.pause();
      } catch {
        /* abaikan */
      }
      cleanupAudio();
    };
    // Hanya bergantung pada id ucapan; nilai lain dibaca lewat ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speech?.id]);

  // Siswa mengetuk "Putar suara" (gestur pengguna -> autoplay diizinkan).
  const handleTapToPlay = useCallback(async () => {
    const audio = getSharedAudio();
    try {
      await audio.play();
      setNeedsTap(false);
    } catch (error) {
      console.error('Putar manual gagal:', error);
      setNeedsTap(false);
      ttsFinishRef.current?.(true);
    }
  }, []);

  // =====================================================================
  // LIFECYCLE
  // =====================================================================
  useEffect(() => {
    mountedRef.current = true;

    // Minta izin mic lebih awal (bersamaan dengan kamera) supaya dialog izin
    // tidak muncul di tengah percakapan. Track langsung dimatikan.
    ensureMicStream()
      .then(() => setMicTracksEnabled(false))
      .catch((error) => {
        if (!mountedRef.current) return;
        const info = describeMicError(error);
        setMicError(info);
        setManualMode(true);
        setNotice({ tone: 'error', text: info.message });
      });

    return () => {
      mountedRef.current = false;
      turnTokenRef.current += 1;
      haltListening();
      releaseMicStream();
      clearTimeout(ttsWatchdogRef.current);
      try {
        getSharedAudio().pause();
      } catch {
        /* abaikan */
      }
    };
  }, [ensureMicStream, haltListening, releaseMicStream, setMicTracksEnabled]);

  // Fokus ke kotak ketik saat mode ketik aktif dan giliran siswa.
  useEffect(() => {
    if ((manualMode || showTypeBox) && (phase === 'manual' || phase === 'listening' || phase === 'hearing')) {
      typeInputRef.current?.focus();
    }
  }, [manualMode, showTypeBox, phase]);

  // =====================================================================
  // AKSI SISWA
  // =====================================================================
  const handleRetryMic = useCallback(async () => {
    setMicError(null);
    setNotice(null);
    recognitionDeadRef.current = false;

    // Saat AI sedang bicara, hanya minta ulang izin mic. Mic TIDAK boleh dibuka
    // sekarang; ia akan dibuka otomatis setelah AI selesai.
    const current = phaseRef.current;
    if (current === 'preparing' || current === 'speaking') {
      try {
        await ensureMicStream();
        setMicTracksEnabled(false);
        setManualMode(false);
      } catch (error) {
        const info = describeMicError(error);
        setMicError(info);
        setManualMode(true);
        setNotice({ tone: 'error', text: info.message });
      }
      return;
    }

    await beginListening(turnTokenRef.current);
  }, [beginListening, ensureMicStream, setMicTracksEnabled]);

  const handleFinishNow = useCallback(() => finishTurn('manual-button'), [finishTurn]);

  const handleTypedSubmit = useCallback(
    (event) => {
      event.preventDefault();
      const text = typedAnswer.trim();
      if (text.length < MIN_ANSWER_CHARS || disabledRef.current) return;

      const current = phaseRef.current;
      if (current === 'preparing' || current === 'speaking' || current === 'transcribing' || current === 'submitted') {
        return;
      }

      turnTokenRef.current += 1; // batalkan giliran mendengarkan yang sedang berjalan
      haltListening();
      submitAnswer(text);
    },
    [typedAnswer, haltListening, submitAnswer]
  );

  // =====================================================================
  // RENDER
  // =====================================================================
  const isListeningPhase = phase === 'listening' || phase === 'hearing';
  const typeBoxVisible = manualMode || showTypeBox;
  const typeBoxDisabled =
    disabled || phase === 'preparing' || phase === 'speaking' || phase === 'transcribing' || phase === 'submitted';

  const noticeStyles = {
    info: 'bg-blue-50 border-blue-200 text-blue-800',
    warn: 'bg-amber-50 border-amber-200 text-amber-800',
    error: 'bg-rose-50 border-rose-200 text-rose-800',
  };

  let micLabel = 'Mic mati';
  let micTone = 'text-gray-400';
  if (phase === 'listening') {
    micLabel = 'Mendengarkan… silakan mulai bicara';
    micTone = 'text-blue-600';
  } else if (phase === 'hearing') {
    micLabel = 'Mendengarkan jawaban kamu…';
    micTone = 'text-emerald-600';
  } else if (phase === 'transcribing') {
    micLabel = 'Memproses jawaban…';
    micTone = 'text-amber-600';
  } else if (phase === 'submitted') {
    micLabel = 'Jawaban diterima';
    micTone = 'text-emerald-600';
  } else if (phase === 'preparing' || phase === 'speaking') {
    micLabel = 'Mic mati saat AI berbicara';
  } else if (phase === 'manual') {
    micLabel = 'Mode ketik';
    micTone = 'text-amber-600';
  }

  const shownText = phase === 'submitted' ? submittedText : transcript;

  return (
    <div className="w-full max-w-2xl mx-auto px-4 pb-4">
      {/* Peringatan / error yang mudah dipahami siswa */}
      {notice && (
        <div
          className={`mb-3 rounded-xl border px-4 py-2.5 text-sm flex items-start justify-between gap-3 ${noticeStyles[notice.tone]}`}
          role="alert"
        >
          <span>{notice.text}</span>
          {micError && micError.code !== 'missing' && (
            <button
              type="button"
              onClick={handleRetryMic}
              className="shrink-0 rounded-lg bg-white/70 hover:bg-white px-3 py-1 text-xs font-semibold border border-gray-300"
            >
              Coba lagi
            </button>
          )}
        </div>
      )}

      {/* Autoplay diblokir browser */}
      {needsTap && (
        <div className="mb-3 flex justify-center">
          <button
            type="button"
            onClick={handleTapToPlay}
            className="rounded-full bg-maroon-600 hover:bg-maroon-700 text-white px-5 py-2 text-sm font-semibold shadow-md"
          >
            🔊 Ketuk untuk memutar suara
          </button>
        </div>
      )}

      {/* Panel jawaban siswa */}
      <div
        className={`rounded-2xl border bg-white shadow-sm px-5 py-4 transition-colors ${
          phase === 'hearing' ? 'border-emerald-300' : isListeningPhase ? 'border-blue-200' : 'border-gray-200'
        }`}
      >
        <div className={`flex items-center justify-between text-xs font-semibold ${micTone}`}>
          <div className="flex items-center gap-2">
            {isListeningPhase ? (
              <span ref={barsRef} className="mic-bars" aria-hidden="true">
                <i />
                <i />
                <i />
                <i />
                <i />
              </span>
            ) : (
              <span aria-hidden="true">{phase === 'submitted' ? '✓' : '🎙️'}</span>
            )}
            <span>{micLabel}</span>
          </div>

          {phase === 'hearing' && (
            <button
              type="button"
              onClick={handleFinishNow}
              className="rounded-full border border-emerald-300 text-emerald-700 hover:bg-emerald-50 px-3 py-1 text-[11px] font-semibold"
            >
              Selesai menjawab
            </button>
          )}
        </div>

        <p
          className={`mt-2 min-h-[2.75rem] text-base leading-relaxed ${
            shownText ? 'text-gray-800' : 'text-gray-300'
          } ${phase === 'submitted' ? 'opacity-70' : ''}`}
        >
          {shownText
            ? `“${shownText}”`
            : isListeningPhase
              ? 'Teks jawabanmu akan muncul di sini…'
              : ' '}
        </p>

        {/* Kotak ketik: hanya muncul sebagai cadangan */}
        {typeBoxVisible && (
          <form onSubmit={handleTypedSubmit} className="mt-3 flex items-center gap-2">
            <input
              ref={typeInputRef}
              type="text"
              value={typedAnswer}
              onChange={(e) => setTypedAnswer(e.target.value)}
              disabled={typeBoxDisabled}
              placeholder={typeBoxDisabled ? 'Tunggu giliranmu…' : 'Ketik jawabanmu di sini…'}
              className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:border-maroon-600 disabled:bg-gray-50"
            />
            <button
              type="submit"
              disabled={typeBoxDisabled || typedAnswer.trim().length < MIN_ANSWER_CHARS}
              className="rounded-xl bg-maroon-600 hover:bg-maroon-700 text-white px-4 py-2.5 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Kirim
            </button>
          </form>
        )}
      </div>

      {!typeBoxVisible && (
        <div className="mt-2 text-center">
          <button
            type="button"
            onClick={() => setShowTypeBox(true)}
            className="text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2"
          >
            Ketik jawaban
          </button>
        </div>
      )}
    </div>
  );
}
