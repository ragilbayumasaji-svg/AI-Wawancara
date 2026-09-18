import React from 'react';

export default function AiAvatar({ aiState }) {
  const getAvatarConfig = () => {
    switch (aiState) {
      case 'thinking':
        return {
          emoji: '🤔',
          label: 'AI Sedang Berpikir...',
          color: 'from-amber-500 to-orange-600',
          badgeBg: 'bg-amber-100 text-amber-800 border-amber-300',
          animation: 'animate-pulse'
        };
      case 'speaking':
        return {
          emoji: '🗣️',
          label: 'AI Sedang Berbicara',
          color: 'from-emerald-500 to-teal-600',
          badgeBg: 'bg-emerald-100 text-emerald-800 border-emerald-300',
          animation: 'animate-bounce'
        };
      case 'listening':
        return {
          emoji: '🎙️',
          label: 'Mendengarkan Jawabanmu...',
          color: 'from-blue-500 to-indigo-600',
          badgeBg: 'bg-blue-100 text-blue-800 border-blue-300',
          animation: 'animate-ping'
        };
      default:
        return {
          emoji: '🤖',
          label: 'Tim HRD AI (Siap)',
          color: 'from-maroon-600 to-rose-700',
          badgeBg: 'bg-rose-100 text-rose-800 border-rose-300',
          animation: ''
        };
    }
  };

  const config = getAvatarConfig();

  return (
    <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-[0_4px_18px_rgba(0,0,0,0.08)] flex items-center space-x-4">
      <div className={`relative w-16 h-16 rounded-2xl bg-gradient-to-tr ${config.color} flex items-center justify-center text-3xl shadow-lg transition-all duration-300`}>
        <span>{config.emoji}</span>
        {aiState === 'speaking' && (
          <span className="absolute -bottom-1 -right-1 flex h-4 w-4">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500"></span>
          </span>
        )}
      </div>

      <div className="flex-1">
        <div className="flex items-center space-x-2">
          <h3 className="font-bold text-gray-800 text-base">Peewee (AI HRD)</h3>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${config.badgeBg}`}>
            {aiState.toUpperCase()}
          </span>
        </div>
        <p className="text-xs text-gray-500 mt-0.5">{config.label}</p>
        
        {/* Gelombang Suara Animasi Saat AI Bicara */}
        {aiState === 'speaking' && (
          <div className="flex items-center space-x-1 mt-2 h-3">
            <span className="w-1 h-3 bg-emerald-500 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
            <span className="w-1 h-3 bg-emerald-500 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
            <span className="w-1 h-3 bg-emerald-500 rounded-full animate-bounce"></span>
            <span className="w-1 h-3 bg-emerald-500 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
          </div>
        )}
      </div>
    </div>
  );
}
