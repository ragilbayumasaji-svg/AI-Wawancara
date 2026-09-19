import React, { useState, useEffect } from 'react';

export default function AdminDashboard({ onBack }) {
  const [results, setResults] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    try {
      const data = JSON.parse(localStorage.getItem('interview_results') || '[]');
      setResults(data);
    } catch (e) {
      console.error('Gagal membaca data hasil wawancara:', e);
    }
  }, []);

  const handleClear = () => {
    if (window.confirm('Apakah Anda yakin ingin menghapus seluruh data hasil wawancara?')) {
      localStorage.removeItem('interview_results');
      setResults([]);
    }
  };

  const selectedCandidate = results[selectedIndex] || null;

  return (
    <div className="flex flex-col h-[85vh] bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      
      {/* Header Dashboard */}
      <div className="p-4 border-b border-gray-200 bg-slate-50 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-800">Dashboard Rekapitulasi Wawancara PPDB</h2>
          <p className="text-xs text-gray-500">Analisis Psikologis, Ekspresi Wajah, Nada Suara (Meyda), dan Transkrip Wawancara.</p>
        </div>
        <div className="flex space-x-2">
          <button
            onClick={handleClear}
            className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-lg text-xs font-semibold transition"
          >
            🗑️ Hapus Semua Data
          </button>
          <button
            onClick={onBack}
            className="px-4 py-1.5 bg-maroon-600 hover:bg-maroon-700 text-white rounded-lg text-xs font-semibold transition"
          >
            Kembali ke Wawancara
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        
        {/* Sidebar Daftar Peserta */}
        <div className="w-1/3 border-r border-gray-200 bg-gray-50/50 p-3 overflow-y-auto space-y-2">
          <h3 className="text-xs font-bold uppercase text-gray-400 tracking-wider mb-2">Daftar Calon Siswa ({results.length})</h3>
          
          {results.length === 0 ? (
            <div className="p-6 text-center text-gray-400 text-xs">Belum ada data wawancara tersimpan.</div>
          ) : (
            results.map((item, idx) => (
              <div
                key={item.id || idx}
                onClick={() => setSelectedIndex(idx)}
                className={`p-3 rounded-xl border cursor-pointer transition flex flex-col space-y-2 ${
                  selectedIndex === idx
                    ? 'bg-white border-maroon-600 shadow-md ring-1 ring-maroon-600'
                    : 'bg-white border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-gray-800">{item.studentName}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                    (item.avgStress || 15) > 40 ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
                  }`}>
                    Stres {item.avgStress || 15}%
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-gray-500">
                  <span>Room: {item.roomId}</span>
                  <span>{item.date}</span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Panel Detail Laporan Guru */}
        <div className="flex-1 p-5 overflow-y-auto space-y-5 bg-white">
          {selectedCandidate ? (
            <>
              {/* Header Nama Candidate */}
              <div className="border-b pb-3 flex justify-between items-end">
                <div>
                  <h3 className="text-xl font-bold text-gray-900">{selectedCandidate.studentName}</h3>
                  <p className="text-xs text-gray-500">Sesi Room: <span className="font-mono text-gray-700">{selectedCandidate.roomId}</span> • Tanggal: {selectedCandidate.date}</p>
                </div>
              </div>

              {/* Grid 4 Metric Cards Telemetri Multimodal */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col justify-between">
                  <span className="text-[11px] font-medium text-gray-500 uppercase">Tingkat Stres Wajah</span>
                  <div className="mt-1 flex items-baseline justify-between">
                    <span className={`text-2xl font-bold font-mono ${selectedCandidate.avgStress > 40 ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {selectedCandidate.avgStress || 15}%
                    </span>
                    <span className="text-[10px] text-gray-400">MediaPipe</span>
                  </div>
                  <div className="w-full bg-gray-200 h-1.5 rounded-full mt-2 overflow-hidden">
                    <div className={`h-full ${selectedCandidate.avgStress > 40 ? 'bg-rose-500' : 'bg-emerald-500'}`} style={{ width: `${selectedCandidate.avgStress || 15}%` }} />
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col justify-between">
                  <span className="text-[11px] font-medium text-gray-500 uppercase">Ekspresi Wajah Dominan</span>
                  <span className="text-sm font-bold text-slate-800 mt-1 capitalize">
                    😊 {selectedCandidate.dominantExpression || 'Netral / Santai'}
                  </span>
                  <span className="text-[10px] text-emerald-600 font-semibold mt-2">Kondisi Stabil</span>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col justify-between">
                  <span className="text-[11px] font-medium text-gray-500 uppercase">Nada Suara Dominan</span>
                  <span className="text-sm font-bold text-maroon-700 mt-1 capitalize">
                    🎙️ {selectedCandidate.dominantTone || 'Normal / Stabil'}
                  </span>
                  <span className="text-[10px] text-gray-400 mt-2">Sensor Meyda.js</span>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col justify-between">
                  <span className="text-[11px] font-medium text-gray-500 uppercase">Energi Suara Rata-Rata</span>
                  <div className="mt-1 flex items-baseline justify-between">
                    <span className="text-2xl font-bold font-mono text-cyan-700">
                      {selectedCandidate.avgEnergy || 25}%
                    </span>
                    <span className="text-[10px] text-gray-400">RMS Volume</span>
                  </div>
                  <div className="w-full bg-gray-200 h-1.5 rounded-full mt-2 overflow-hidden">
                    <div className="h-full bg-cyan-500" style={{ width: `${selectedCandidate.avgEnergy || 25}%` }} />
                  </div>
                </div>
              </div>

              {/* Ringkasan Kesimpulan Psikologis untuk Guru */}
              <div className="bg-maroon-50/60 border border-maroon-200 rounded-xl p-4">
                <h4 className="text-xs font-bold text-maroon-900 uppercase tracking-wide mb-1 flex items-center space-x-1">
                  <span>💡</span>
                  <span>Catatan Observasi AI & Guru (Non-Verbal)</span>
                </h4>
                <p className="text-xs text-maroon-950 leading-relaxed">
                  Siswa <strong>{selectedCandidate.studentName}</strong> menunjukkan tingkat ketenangan yang cukup baik dengan rata-rata stres wajah sebesar <strong>{selectedCandidate.avgStress || 15}%</strong>. 
                  Selama sesi, ekspresi wajah yang paling sering muncul adalah <strong>{selectedCandidate.dominantExpression || 'Netral / Santai'}</strong> dengan nada bicara <strong>{selectedCandidate.dominantTone || 'Normal / Stabil'}</strong>. 
                  Siswa menyampaikan jawaban dengan artikulasi jelas dan energi suara rata-rata sebesar {selectedCandidate.avgEnergy || 25}%.
                </p>
              </div>

              {/* Transkrip Percakapan */}
              <div>
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Transkrip Percakapan Wawancara</h4>
                <div className="space-y-3">
                  {selectedCandidate.chatHistory && selectedCandidate.chatHistory.map((msg, i) => (
                    <div
                      key={i}
                      className={`p-3 rounded-xl text-xs leading-relaxed max-w-2xl ${
                        msg.role === 'assistant'
                          ? 'bg-gray-100 text-gray-800 mr-auto border border-gray-200'
                          : 'bg-maroon-600 text-white ml-auto font-medium shadow-sm'
                      }`}
                    >
                      <div className="font-bold text-[10px] mb-1 opacity-75">
                        {msg.role === 'assistant' ? 'Peewee (AI HRD)' : selectedCandidate.studentName}
                      </div>
                      <p className="whitespace-pre-line">{msg.content}</p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="h-full flex items-center justify-center text-gray-400 text-xs">
              Pilih peserta di sebelah kiri untuk melihat rekap detail.
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
