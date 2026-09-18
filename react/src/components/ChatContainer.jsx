import { useEffect, useRef } from 'react';

/**
 * Tampilan percakapan Siswa <-> HRD AI, menggantikan area #chat-container
 * dan header chat di index.html lama.
 *
 * Props:
 * - studentName: string
 * - chatHistory: { role: 'user' | 'assistant', content: string }[]
 * - aiState: 'idle' | 'listening' | 'thinking' | 'speaking'
 * - bare: jika true, tidak merender wrapper kartu (dipakai saat parent sudah menyediakan kartunya sendiri)
 */
export default function ChatContainer({ studentName, chatHistory, aiState, bare = false }) {
  const scrollRef = useRef(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chatHistory, aiState]);

  const statusLabel =
    aiState === 'listening' ? 'Mendengarkan...' : aiState === 'thinking' ? 'HRD sedang mengetik...' : 'Online';

  const Wrapper = bare ? 'div' : 'div';
  const wrapperClass = bare
    ? 'flex flex-col flex-1 min-h-0'
    : 'lg:col-span-7 bg-white rounded-2xl border border-gray-200 shadow-[0_4px_18px_rgba(0,0,0,0.08)] flex flex-col h-full overflow-hidden';

  return (
    <Wrapper className={wrapperClass}>
      {/* Header Chat */}
      <div className="px-6 py-4 bg-maroon-600 border-b border-maroon-700 flex justify-between items-center z-10">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-white/15 rounded-full flex items-center justify-center border border-white/30 text-xl">
            🏫
          </div>
          <div>
            <h2 className="text-sm font-bold text-white">Tim HRD PPDB</h2>
            <p className="text-[11px] text-emerald-200 flex items-center">
              <span className="w-1.5 h-1.5 bg-emerald-300 rounded-full mr-1.5 animate-pulse" />
              <span>{statusLabel}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Area Obrolan */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4">
        <div className="flex flex-col items-start">
          <div className="max-w-[80%] rounded-2xl px-4 py-2.5 text-sm bg-gray-100 border border-gray-200 text-[#212121] rounded-bl-none">
            <p>
              Halo{studentName ? `, ${studentName}` : ''}! Terima kasih sudah meluangkan waktu untuk wawancara PPDB
              hari ini.
            </p>
          </div>
        </div>

        {chatHistory.map((msg, index) => (
          <div key={index} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
                msg.role === 'user'
                  ? 'bg-maroon-600 text-white rounded-br-none'
                  : 'bg-gray-100 border border-gray-200 text-[#212121] rounded-bl-none'
              }`}
            >
              <p>{msg.content}</p>
            </div>
            <span className="text-[10px] text-gray-400 mt-1">{msg.role === 'user' ? 'Kamu' : 'Tim HRD'}</span>
          </div>
        ))}

        {aiState === 'thinking' && (
          <div className="flex items-start">
            <div className="bg-gray-100 border border-gray-200 rounded-2xl rounded-bl-none px-4 py-3 shadow-sm">
              <div className="flex space-x-1.5">
                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0s]" />
                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0.4s]" />
              </div>
            </div>
          </div>
        )}
      </div>
    </Wrapper>
  );
}
