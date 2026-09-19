import React, { useEffect, useState } from 'react';
import { useRive, useStateMachineInput } from '@rive-app/react-canvas';

const STATE_MACHINE_NAME = 'State Machine 1';

export default function AiAvatar({ aiState = 'idle', emotion = 'neutral' }) {
  const [riveError, setRiveError] = useState(false);

  const { rive, RiveComponent } = useRive({
    src: '/avatar.riv',
    stateMachines: STATE_MACHINE_NAME,
    autoplay: true,
    onLoadError: () => setRiveError(true),
  });

  const isSpeakingInput = useStateMachineInput(rive, STATE_MACHINE_NAME, 'isSpeaking');
  const isThinkingInput = useStateMachineInput(rive, STATE_MACHINE_NAME, 'isThinking');
  const emotionTrigger = useStateMachineInput(rive, STATE_MACHINE_NAME, emotion);

  useEffect(() => {
    if (rive) {
      if (isSpeakingInput) isSpeakingInput.value = aiState === 'speaking';
      if (isThinkingInput) isThinkingInput.value = aiState === 'thinking';
      if (emotionTrigger) emotionTrigger.fire();
    }
  }, [aiState, emotion, rive, isSpeakingInput, isThinkingInput, emotionTrigger]);

  return (
    <div className="relative w-full h-48 bg-gradient-to-br from-slate-900 via-maroon-950 to-slate-950 rounded-2xl overflow-hidden border border-red-900/40 shadow-xl flex items-center justify-center">
      
      {/* Background Pulse Effect */}
      <div className={`absolute inset-0 transition-opacity duration-700 pointer-events-none ${
        aiState === 'speaking' ? 'bg-emerald-500/10' : aiState === 'thinking' ? 'bg-amber-500/10' : 'bg-transparent'
      }`} />

      {/* 1. Rive Component (Jika file avatar.riv ada) */}
      {!riveError ? (
        <div className="w-full h-full flex items-center justify-center">
          <RiveComponent className="w-full h-full object-contain" />
        </div>
      ) : null}

      {/* 2. Fallback Avatar Robot SVG (Tampil jika avatar.riv belum diunggah) */}
      {riveError && (
        <div className="flex flex-col items-center justify-center z-10 space-y-2">
          {/* Kepala Robot */}
          <div className="relative w-20 h-20 bg-slate-800 rounded-3xl border-2 border-slate-600 flex items-center justify-center shadow-lg transition-transform duration-300">
            {/* Antena */}
            <div className="absolute -top-3 w-2 h-3 bg-slate-500 rounded-full flex items-start justify-center">
              <span className={`w-2 h-2 rounded-full -mt-1 ${
                aiState === 'speaking' ? 'bg-emerald-400 animate-ping' : 'bg-blue-400'
              }`} />
            </div>

            {/* Mata Robot */}
            <div className="flex space-x-3">
              <div className={`w-4 h-4 rounded-full transition-all duration-300 ${
                aiState === 'speaking'
                  ? 'bg-emerald-400 scale-110 shadow-[0_0_10px_#34d399]'
                  : aiState === 'thinking'
                  ? 'bg-amber-400 animate-pulse'
                  : 'bg-cyan-400 shadow-[0_0_8px_#22d3ee]'
              }`} />
              <div className={`w-4 h-4 rounded-full transition-all duration-300 ${
                aiState === 'speaking'
                  ? 'bg-emerald-400 scale-110 shadow-[0_0_10px_#34d399]'
                  : aiState === 'thinking'
                  ? 'bg-amber-400 animate-pulse'
                  : 'bg-cyan-400 shadow-[0_0_8px_#22d3ee]'
              }`} />
            </div>

            {/* Mulut Robot Animatif */}
            <div className="absolute bottom-3 w-8 h-1.5 bg-slate-900 rounded-full overflow-hidden flex items-center justify-center">
              {aiState === 'speaking' ? (
                <div className="w-full h-full bg-emerald-400 animate-pulse" />
              ) : (
                <div className="w-4 h-0.5 bg-cyan-400/60 rounded-full" />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Indikator Status AI */}
      <div className="absolute top-3 left-3 flex items-center space-x-2 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full border border-white/10">
        <span
          className={`w-2.5 h-2.5 rounded-full ${
            aiState === 'speaking'
              ? 'bg-emerald-400 animate-ping'
              : aiState === 'thinking'
              ? 'bg-amber-400 animate-pulse'
              : 'bg-cyan-400'
          }`}
        />
        <span className="text-[11px] font-semibold text-white/90 capitalize">
          Peewee (AI HRD) • {aiState === 'speaking' ? 'Bicara' : aiState === 'thinking' ? 'Berpikir...' : 'Mendengar'}
        </span>
      </div>

      {/* Indikator Emosi Aktif */}
      {emotion !== 'neutral' && (
        <div className="absolute top-3 right-3 bg-maroon-600/90 backdrop-blur-md text-white text-[10px] font-bold px-2.5 py-1 rounded-full border border-white/20 capitalize flex items-center space-x-1 shadow-md">
          <span>😊</span>
          <span>{emotion}</span>
        </div>
      )}

      {/* Gelombang Suara Animasi Saat Bicara */}
      {aiState === 'speaking' && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center space-x-1 bg-black/60 backdrop-blur-md px-4 py-1.5 rounded-full border border-emerald-500/30">
          <span className="w-1 h-3 bg-emerald-400 animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-1 h-5 bg-emerald-400 animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-1 h-2 bg-emerald-400 animate-bounce" style={{ animationDelay: '300ms' }} />
          <span className="w-1 h-4 bg-emerald-400 animate-bounce" style={{ animationDelay: '450ms' }} />
        </div>
      )}
    </div>
  );
}
