import React, { useEffect, useState } from 'react';

export default function VoiceController({ disabled, onSubmit, textToSpeak, onSpeakStart, onSpeakEnd }) {
  const [inputText, setInputText] = useState('');
  const [isListening, setIsListening] = useState(false);

  // Fitur Text-To-Speech (AI Berbicara)
  useEffect(() => {
    if (!textToSpeak || !('speechSynthesis' in window)) return;

    window.speechSynthesis.cancel(); // Hentikan suara sebelumnya jika ada

    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.lang = 'id-ID';
    utterance.rate = 1.0;

    utterance.onstart = () => {
      if (onSpeakStart) onSpeakStart();
    };

    utterance.onend = () => {
      if (onSpeakEnd) onSpeakEnd();
    };

    utterance.onerror = () => {
      if (onSpeakEnd) onSpeakEnd();
    };

    window.speechSynthesis.speak(utterance);
  }, [textToSpeak]);

  // Fitur Speech-To-Text (Mikrofon Siswa)
  const handleMicToggle = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Browser Anda tidak mendukung fitur dikte suara. Gunakan ketik teks.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'id-ID';
    recognition.interimResults = false;

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setInputText(transcript);
    };

    recognition.start();
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!inputText.trim() || disabled) return;
    onSubmit(inputText.trim());
    setInputText('');
  };

  return (
    <form onSubmit={handleSubmit} className="p-3 border-t border-gray-200 bg-gray-50 flex items-center space-x-2">
      <button
        type="button"
        onClick={handleMicToggle}
        disabled={disabled}
        className={`p-2.5 rounded-xl transition ${
          isListening ? 'bg-rose-600 text-white animate-pulse' : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-100'
        }`}
        title="Bicara lewat Mikrofon"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
        </svg>
      </button>

      <input
        type="text"
        value={inputText}
        onChange={(e) => setInputText(e.target.value)}
        disabled={disabled}
        placeholder={disabled ? 'Tunggu AI selesai berbicara...' : 'Ketik jawabanmu di sini (atau pakai mic)...'}
        className="flex-1 bg-white border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-maroon-600"
      />

      <button
        type="submit"
        disabled={disabled || !inputText.trim()}
        className="bg-maroon-600 hover:bg-maroon-700 disabled:opacity-50 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition"
      >
        Kirim
      </button>
    </form>
  );
}
