import { useState } from 'react';

/**
 * Form persiapan: nama calon siswa + persetujuan kamera/mic.
 */
export default function CandidateForm({ onSubmit, isLoading }) {
  const [studentName, setStudentName] = useState('');
  const [agree, setAgree] = useState(false);

  const canSubmit = agree && studentName.trim().length > 0 && !isLoading;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit(studentName.trim());
  };

  return (
    <div className="max-w-md mx-auto w-full m-auto">
      <form
        onSubmit={handleSubmit}
        className="bg-white p-8 rounded-2xl border border-gray-200 shadow-[0_4px_18px_rgba(0,0,0,0.08)] relative overflow-hidden"
      >
        <div className="absolute top-0 left-0 w-full h-1 bg-maroon-600" />

        <div className="text-center mb-6">
          <h2 className="text-2xl font-display font-bold text-[#212121] mb-2">
            Sesi Wawancara PPDB
          </h2>
          <p className="text-sm text-gray-500">
            Silakan masukkan nama untuk memulai sesi wawancara dengan Tim HRD sekolah kami.
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Nama Lengkap Calon Siswa
            </label>
            <input
              type="text"
              value={studentName}
              onChange={(e) => setStudentName(e.target.value)}
              placeholder="Contoh: Budi Santoso"
              className="w-full bg-gray-50 border border-gray-300 rounded-xl px-4 py-3 text-[#212121] focus:outline-none focus:ring-2 focus:ring-maroon-600 focus:border-transparent transition"
            />
          </div>

          <label className="flex items-start space-x-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={agree}
              onChange={(e) => setAgree(e.target.checked)}
              className="w-5 h-5 mt-0.5 rounded border-gray-300 text-maroon-600 focus:ring-maroon-600 cursor-pointer"
            />
            <span className="text-xs text-gray-600 leading-tight">
              Saya setuju untuk mengaktifkan kamera dan mikrofon selama sesi wawancara ini berlangsung.
            </span>
          </label>

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full bg-maroon-600 hover:bg-maroon-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition flex items-center justify-center shadow-md"
          >
            {isLoading ? (
              <span className="flex items-center">
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Menyiapkan Kamera...
              </span>
            ) : (
              'Mulai Wawancara'
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
