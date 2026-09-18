import { useState, useEffect } from 'react';

export default function AdminDashboard({ onBack }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState(null);

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/interviews');
      if (res.ok) {
        const data = await res.json();
        setReports(data || []);
      }
    } catch (err) {
      console.error('Gagal mengambil data rekap:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto w-full p-4 flex flex-col space-y-6">
      {/* Header Dashboard */}
      <div className="flex items-center justify-between bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Dashboard Hasil Wawancara PPDB</h2>
          <p className="text-sm text-gray-500 mt-1">
            Rekap psikometri, indikator stres, dan transkrip percakapan calon siswa.
          </p>
        </div>
        <div className="flex space-x-3">
          <button
            onClick={fetchReports}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-semibold transition flex items-center space-x-2"
          >
            <span>🔄 Refresh</span>
          </button>
          <button
            onClick={onBack}
            className="px-4 py-2 bg-maroon-600 hover:bg-maroon-700 text-white rounded-xl text-sm font-semibold transition"
          >
            Kembali ke Mode Wawancara
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-gray-200">
          <p className="text-gray-500 animate-pulse">Memuat data wawancara...</p>
        </div>
      ) : reports.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-gray-200">
          <span className="text-4xl mb-3 block">📋</span>
          <h3 className="text-lg font-bold text-gray-700">Belum Ada Data Wawancara</h3>
          <p className="text-sm text-gray-500 mt-1">
            Selesaikan minimal 1 sesi wawancara siswa untuk melihat rekap di sini.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Tabel / Daftar Siswa */}
          <div className="lg:col-span-1 bg-white rounded-2xl border border-gray-200 p-4 shadow-sm space-y-3">
            <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-2">
              Daftar Calon Siswa ({reports.length})
            </h3>
            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {reports.map((item, idx) => (
                <div
                  key={item.roomId || idx}
                  onClick={() => setSelectedSession(item)}
                  className={`p-4 rounded-xl border cursor-pointer transition ${
                    selectedSession?.roomId === item.roomId
                      ? 'border-maroon-600 bg-rose-50/50 shadow-sm'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <h4 className="font-bold text-gray-800 text-base">{item.studentName || 'Siswa'}</h4>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                        (item.avgStress || 0) > 50
                          ? 'bg-rose-100 text-rose-700'
                          : 'bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      Stres: {Math.round(item.avgStress || 0)}%
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 font-mono mt-1">ID: {item.roomId}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Rincian Hasil & Transkrip Percakapan */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 p-6 shadow-sm flex flex-col">
            {selectedSession ? (
              <div className="space-y-6">
                <div className="border-b border-gray-200 pb-4 flex justify-between items-center">
                  <div>
                    <h3 className="text-xl font-bold text-gray-800">{selectedSession.studentName}</h3>
                    <p className="text-xs text-gray-500 font-mono">Room ID: {selectedSession.roomId}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-gray-500 block">Rata-Rata Tingkat Stres</span>
                    <span className="text-2xl font-bold text-maroon-600 font-mono">
                      {Math.round(selectedSession.avgStress || 0)}%
                    </span>
                  </div>
                </div>

                {/* Transkrip Chat */}
                <div>
                  <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-3">
                    Transkrip Percakapan & Respon AI
                  </h4>
                  <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 space-y-3 max-h-[400px] overflow-y-auto">
                    {selectedSession.telemetryLogs?.length > 0 ? (
                      selectedSession.telemetryLogs.map((log, i) => (
                        <div key={i} className="text-xs text-gray-600 bg-white p-2.5 rounded-lg border border-gray-200">
                          <span className="font-semibold text-gray-800">Sampel #{i + 1}</span> | Ekspresi: <span className="font-bold">{log.expression}</span> | Stres: <span className="font-bold">{Math.round(log.stress)}%</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-gray-500 italic">Data sampel telemetri lengkap telah tersimpan di database.</p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="m-auto text-center py-16">
                <span className="text-4xl">👈</span>
                <p className="text-sm text-gray-500 mt-2">Pilih nama siswa di sebelah kiri untuk melihat rekap detail.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
