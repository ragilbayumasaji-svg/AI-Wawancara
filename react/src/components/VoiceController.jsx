import React, { useState, useEffect, useRef } from 'react';
import Meyda from 'meyda';

export default function VoiceController({ disabled, onSubmit, textToSpeak, onSpeakStart, onSpeakEnd, onAudioTelemetry, emotion = 'neutral' }) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [audioStats, setAudioStats] = useState({ volume: 'Normal / Stabil', energy: 0 });

  const recognitionRef = useRef(null);
  const audioContextRef = useRef(null);
  const meydaAnalyzerRef = useRef(null);
  const mediaStreamRef = useRef(null);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'id-ID';

      recognition.onresult = (event) => {
        let currentText = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          currentText += event.results[i][0].transcript;
        }
        setTranscript(currentText);
      };

      recognition.onerror = () => stopListening();
      recognition.onend = () => {
        setIsListening(false);
        stopAudioAnalysis();
      };

      recognitionRef.current = recognition;
    }
  }, []);

  // Text-To-Speech dengan Dinamika Nada Berdasarkan Emosi AI
  useEffect(() => {
    if (textToSpeak && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      utterance.lang = 'id-ID';

      // Mengatur Pitch & Kecepatan Suara Sesuai Emosi AI
      if (emotion === 'happy') {
        utterance.pitch = 1.3; // Lebih bernada tinggi & ceria
        utterance.rate = 1.1;  // Sedikit lebih cepat
      } else if (emotion === 'empathetic') {
        utterance.pitch = 0.85; // Suara lebih hangat & tenang
        utterance.rate = 0.9;   // Bicara perlahan
      } else if (emotion === 'curious') {
        utterance.pitch = 1.2;
        utterance.rate = 1.0;
      } else {
        utterance.pitch = 1.0;
        utterance.rate = 1.0;
      }

      utterance.onstart = () => onSpeakStart && onSpeakStart();
      utterance.onend = () => onSpeakEnd && onSpeakEnd();
      utterance.onerror = () => onSpeakEnd && onSpeakEnd();

      window.speechSynthesis.speak(utterance);
    }
  }, [textToSpeak, emotion]);

  const startAudioAnalysis = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);

      meydaAnalyzerRef.current = Meyda.createMeydaAnalyzer({
        audioContext: audioContext,
        source: source,
        bufferSize: 512,
        featureExtractors: ['rms', 'zcr'],
        callback: (features) => {
          if (!features) return;
          const rms = features.rms || 0;
          const zcr = features.zcr || 0;

          let toneLabel = 'Normal / Stabil';
          if (rms > 0.12) {
            toneLabel = 'Antusias / Tinggi';
          } else if (rms < 0.02) {
            toneLabel = 'Pelan / Ragu-ragu';
          } else if (zcr > 40) {
            toneLabel = 'Tegang / Nyaring';
          }

          const stats = {
            energy: Math.round(rms * 100),
            volumeLabel: toneLabel,
            zcr: Math.round(zcr),
          };

          setAudioStats(stats);
          if (onAudioTelemetry) {
            onAudioTelemetry(stats);
          }
        },
      });

      meydaAnalyzerRef.current.start();
    } catch (err) {}
  };

  const stopAudioAnalysis = () => {
    if (meydaAnalyzerRef.current) meydaAnalyzerRef.current.stop();
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') audioContextRef.current.close();
    if (mediaStreamRef.current) mediaStreamRef.current.getTracks().forEach((track) => track.stop());
  };

  const startListening = () => {
    if (disabled) return;
    setTranscript('');
    setIsListening(true);
    startAudioAnalysis();
    try {
      recognitionRef.current?.start();
    } catch (e) {}
  };

  const stopListening = () => {
    setIsListening(false);
    stopAudioAnalysis();
    try {
      recognitionRef.current?.stop();
    } catch (e) {}
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!transcript.trim() || disabled) return;
    stopListening();
    onSubmit(transcript);
    setTranscript('');
  };

  return (
    <div className="p-3 bg-white border-t border-gray-200">
      <form onSubmit={handleSubmit} className="flex flex-col space-y-2">
        {isListening && (
          <div className="flex items-center justify-between bg-slate-900 text-white px-3 py-1.5 rounded-xl text-[11px] animate-fadeIn">
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
              <span className="font-semibold">Mendengarkan & Menganalisis Nada Suara...</span>
            </div>
            <div className="flex items-center space-x-3 font-mono">
              <span>Energi: <strong className="text-emerald-400">{audioStats.energy}%</strong></span>
              <span>Status: <strong className="text-amber-300">{audioStats.volumeLabel}</strong></span>
            </div>
          </div>
        )}

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={isListening ? stopListening : startListening}
            disabled={disabled}
            className={`p-3 rounded-xl transition flex items-center justify-center ${
              isListening
                ? 'bg-rose-600 hover:bg-rose-700 text-white animate-pulse'
                : 'bg-maroon-600 hover:bg-maroon-700 text-white'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {isListening ? '🎙️ Stop' : '🎤 Bicara'}
          </button>

          <input
            type="text"
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder={disabled ? 'Peewee sedang merespons...' : 'Ketik jawaban atau klik tombol bicara...'}
            disabled={disabled}
            className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-maroon-600 disabled:bg-gray-50"
          />

          <button
            type="submit"
            disabled={disabled || !transcript.trim()}
            className="px-5 py-2.5 bg-maroon-600 hover:bg-maroon-700 text-white rounded-xl text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Kirim
          </button>
        </div>
      </form>
    </div>
  );
}
