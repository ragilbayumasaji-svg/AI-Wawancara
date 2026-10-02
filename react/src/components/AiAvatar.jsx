import { memo } from 'react';
import { EXPRESSIONS } from '../config/interviewConfig';

/**
 * Wajah AI interviewer berupa emoji ekspresif.
 *
 * Props:
 * - expression : kunci dari EXPRESSIONS (idle, thinking, speaking, listening,
 *                processing, positive, surprised, serious, encouraging, concerned)
 * - status     : teks status yang tampil di bawah avatar
 * - isSpeaking : true saat audio AI sedang diputar (animasi pulse)
 * - mode       : 'idle' | 'speaking' | 'thinking' | 'listening' — memilih animasi.
 *                Bila tidak diisi, diturunkan dari isSpeaking / expression.
 * - name       : nama yang ditampilkan
 *
 * Animasi hanya memakai transform/opacity (ringan untuk laptop sekolah)
 * dan dimatikan otomatis bila pengguna memilih "reduce motion".
 */
function AiAvatar({
  expression = 'idle',
  status = '',
  isSpeaking = false,
  mode,
  name = 'Peewee',
}) {
  const face = EXPRESSIONS[expression] || EXPRESSIONS.idle;

  const resolvedMode =
    mode ||
    (isSpeaking
      ? 'speaking'
      : expression === 'thinking' || expression === 'processing'
        ? 'thinking'
        : expression === 'listening'
          ? 'listening'
          : 'idle');

  return (
    <div className="flex flex-col items-center text-center select-none">
      <div className={`avatar-stage avatar-${resolvedMode}`}>
        <span className="avatar-ring avatar-ring-1" aria-hidden="true" />
        <span className="avatar-ring avatar-ring-2" aria-hidden="true" />

        <div className="avatar-face" role="img" aria-label={`${name} sedang ${face.label.toLowerCase()}`}>
          {/* key = emoji, supaya setiap pergantian ekspresi memicu animasi pop */}
          <span key={face.emoji} className="avatar-emoji">
            {face.emoji}
          </span>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <span className="text-base font-display font-bold text-gray-800">{name}</span>
        <span className="text-xs font-medium text-gray-400">• Pewawancara AI</span>
      </div>

      <p
        className="mt-1 min-h-[1.5rem] text-sm font-medium text-maroon-600 flex items-center gap-1.5"
        role="status"
        aria-live="polite"
      >
        {resolvedMode === 'thinking' && (
          <span className="thinking-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        )}
        <span>{status}</span>
      </p>
    </div>
  );
}

export default memo(AiAvatar);
