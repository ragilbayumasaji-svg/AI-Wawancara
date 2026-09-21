import React, { useState, useEffect } from 'react';

const INITIAL_QUESTIONS = [
  'Halo! Boleh cerita, apa alasan utama kamu memilih sekolah kami sebagai pilihanmu?',
  'Di luar jam pelajaran, apa hobi atau kegiatan yang paling kamu sukai?',
  'Kalau ada, jurusan atau ekstrakurikuler apa yang paling menarik minatmu di sekolah ini?',
  'Apa cita-cita atau target yang ingin kamu capai dalam beberapa tahun ke depan?',
  'Terakhir, ketika menghadapi pelajaran yang terasa sulit, biasanya bagaimana caramu menghadapinya?',
];

const TOPIC_TITLES = [
  'Alasan Memilih Sekolah',
  'Hobi / Kegiatan',
  'Minat Jurusan / Ekstrakurikuler',
  'Cita-cita / Target',
  'Cara Menghadapi Kesulitan Belajar',
];

const normalize = (text) =>
  String(text || '').trim().replace(/\s+/g, ' ');

function parseInterview(chatHistory = []) {
  const topics = [];
  let currentTopic = null;

  const isMainQuestion = (text) =>
    INITIAL_QUESTIONS.some(
      (question) => normalize(question) === normalize(text)
    );

  const isClosing = (text) => {
    const lower = String(text || '').toLowerCase();
    return lower.includes('terima kasih') &&
      (lower.includes('selesai') || lower.includes('berakhir'));
  };

  chatHistory.forEach((msg) => {
    if (msg.role === 'assistant') {
      if (isMainQuestion(msg.content)) {
        const index = INITIAL_QUESTIONS.findIndex(
          (question) => normalize(question) === normalize(msg.content)
        );

        currentTopic = {
          title: TOPIC_TITLES[index] || 'Topik Tambahan',
          mainQuestion: msg.content,
          mainAnswer: null,
          followUps: [],
        };

        topics.push(currentTopic);
      } else if (currentTopic && !isClosing(msg.content)) {
        currentTopic.followUps.push({
          question: msg.content,
          answer: null,
        });
      }
    }

    if (msg.role === 'user' && currentTopic) {
      if (currentTopic.followUps.length > 0) {
        const lastFollowUp =
          currentTopic.followUps[currentTopic.followUps.length - 1];

        if (!lastFollowUp.answer) {
          lastFollowUp.answer = msg.content;
        }
      } else if (!currentTopic.mainAnswer) {
        currentTopic.mainAnswer = msg.content;
      }
    }
  });

  return topics;
}

function formatTime(timestamp) {
  if (!timestamp) return '-';

  try {
    return new Date(timestamp).toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return '-';
  }
}

export default function AdminDashboard({ onBack }) {
  const [results, setResults] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showTranscript, setShowTranscript] = useState(false);
  const [teacherNotes, setTeacherNotes] = useState('');

  useEffect(() => {
    try {
      const data = JSON.parse(
        localStorage.getItem('interview_results') || '[]'
      );

      setResults(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Gagal membaca data hasil wawancara:', e);
      setResults([]);
    }
  }, []);

  const handleClear = () => {
    if (
      window.confirm(
        'Apakah Anda yakin ingin menghapus seluruh data hasil wawancara?'
      )
    ) {
      localStorage.removeItem('interview_results');
      setResults([]);
      setSelectedIndex(0);
    }
  };

  const selectedCandidate = results[selectedIndex] || null;

  useEffect(() => {
    setTeacherNotes(selectedCandidate?.teacherNotes || '');
    setShowTranscript(false);
  }, [selectedIndex, selectedCandidate?.id]);

  const topics = selectedCandidate
    ? parseInterview(selectedCandidate.chatHistory)
    : [];

  const samples = selectedCandidate?.telemetrySamples || [];

  const handleSaveNote = () => {
    if (!selectedCandidate) return;

    const updated = results.map((item) =>
      item.id === selectedCandidate.id
        ? { ...item, teacherNotes }
        : item
    );

    localStorage.setItem(
      'interview_results',
      JSON.stringify(updated)
    );

    setResults(updated);
  };

  return (
    <div className="flex flex-col h-[85vh] bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">

      {/* HEADER */}
      <div className="p-4 border-b border-gray-200 bg-slate-50 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-800">
            Dashboard Rekapitulasi Wawancara PPDB
          </h2>
          <p className="text-xs text-gray-500">
            Rekap jawaban, percakapan, dan observasi telemetri wawancara.
          </p>
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

        {/* DAFTAR SISWA */}
        <div className="w-1/3 border-r border-gray-200 bg-gray-50/50 p-3 overflow-y-auto space-y-2">
          <h3 className="text-xs font-bold uppercase text-gray-400 tracking-wider mb-2">
            Daftar Calon Siswa ({results.length})
          </h3>

          {results.length === 0 ? (
            <div className="p-6 text-center text-gray-400 text-xs">
              Belum ada data wawancara tersimpan.
            </div>
          ) : (
            results.map((item, idx) => (
              <div
                key={item.id || idx}
                onClick={() => setSelectedIndex(idx)}
                className={`p-3 rounded-xl border cursor-pointer transition ${
                  selectedIndex === idx
                    ? 'bg-white border-maroon-600 shadow-md ring-1 ring-maroon-600'
                    : 'bg-white border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-gray-800">
                    {item.studentName}
                  </span>

                  <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-gray-100 text-gray-600">
                    {item.samplesCount || 0} sampel
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px] text-gray-500 mt-2">
                  <span>Room: {item.roomId}</span>
                  <span>{item.date}</span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* DETAIL */}
        <div className="flex-1 p-5 overflow-y-auto space-y-6 bg-white">

          {!selectedCandidate ? (
            <div className="h-full flex items-center justify-center text-gray-400 text-xs">
              Pilih peserta di sebelah kiri untuk melihat rekap detail.
            </div>
          ) : (
            <>
              {/* IDENTITAS */}
              <section className="border-b pb-4">
                <h1 className="text-2xl font-black uppercase tracking-tight">
                  Hasil Wawancara
                </h1>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                  <div>
                    <p className="text-xs text-gray-500 font-bold uppercase">
                      Nama Siswa
                    </p>
                    <p className="font-bold text-lg">
                      {selectedCandidate.studentName}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-gray-500 font-bold uppercase">
                      Room ID
                    </p>
                    <p className="font-mono text-sm mt-1">
                      {selectedCandidate.roomId}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-gray-500 font-bold uppercase">
                      Waktu
                    </p>
                    <p className="text-sm mt-1">
                      {selectedCandidate.date}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-gray-500 font-bold uppercase">
                      Total Sampel
                    </p>
                    <p className="text-sm mt-1">
                      {selectedCandidate.samplesCount || 0}
                    </p>
                  </div>
                </div>
              </section>

              {/* RINGKASAN */}
              <section>
                <h2 className="text-sm font-bold text-gray-500 uppercase mb-3">
                  Ringkasan Wawancara
                </h2>

                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm leading-relaxed text-gray-700">
                  <p>
                    Wawancara mencakup{' '}
                    <strong>{topics.length}</strong> topik utama
                    dengan total{' '}
                    <strong>
                      {selectedCandidate.chatHistory?.length || 0}
                    </strong>{' '}
                    pesan percakapan.
                  </p>

                  <p className="mt-2">
                    Ringkasan berikut dibuat berdasarkan jawaban yang
                    tercatat dalam transkrip.
                  </p>
                </div>
              </section>

              {/* TOPIK */}
              <section>
                <h2 className="text-sm font-bold text-gray-500 uppercase mb-4 border-b pb-2">
                  Topik yang Digali
                </h2>

                <div className="space-y-4">
                  {topics.map((topic, index) => (
                    <div
                      key={index}
                      className="bg-gray-50 border border-gray-200 rounded-xl p-4"
                    >
                      <h3 className="font-bold text-gray-800 mb-3">
                        {index + 1}. {topic.title}
                      </h3>

                      <div>
                        <p className="text-xs font-bold text-gray-500">
                          Pertanyaan Utama
                        </p>

                        <p className="text-sm italic mt-1">
                          "{topic.mainQuestion}"
                        </p>

                        <div className="mt-2 pl-3 border-l-2 border-blue-500">
                          <p className="text-xs font-bold text-blue-700">
                            Jawaban Siswa
                          </p>
                          <p className="text-sm mt-1">
                            {topic.mainAnswer || '-'}
                          </p>
                        </div>
                      </div>

                      {topic.followUps.map((followUp, followUpIndex) => (
                        <div
                          key={followUpIndex}
                          className="ml-4 mt-4 pt-3 border-t border-gray-200"
                        >
                          <p className="text-xs font-bold text-gray-500">
                            Follow-up {followUpIndex + 1}
                          </p>

                          <p className="text-sm italic mt-1">
                            "{followUp.question}"
                          </p>

                          <div className="mt-2 pl-3 border-l-2 border-green-500">
                            <p className="text-xs font-bold text-green-700">
                              Jawaban Siswa
                            </p>
                            <p className="text-sm mt-1">
                              {followUp.answer || '-'}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </section>

              {/* OBSERVASI */}
              <section>
                <h2 className="text-sm font-bold text-gray-500 uppercase mb-4 border-b pb-2">
                  Observasi Non-Verbal
                </h2>

                <p className="text-xs text-gray-500 mb-3">
                  Data berikut merupakan hasil observasi telemetri sistem,
                  bukan diagnosis psikologis.
                </p>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">

                  <div className="p-3 border rounded-xl bg-gray-50">
                    <p className="text-xs font-bold text-gray-500">
                      Stress Rata-rata
                    </p>
                    <p className="text-xl font-black mt-1">
                      {selectedCandidate.avgStress ?? 0}%
                    </p>
                  </div>

                  <div className="p-3 border rounded-xl bg-gray-50">
                    <p className="text-xs font-bold text-gray-500">
                      Ekspresi Dominan
                    </p>
                    <p className="text-sm font-bold mt-2">
                      {selectedCandidate.dominantExpression || '-'}
                    </p>
                  </div>

                  <div className="p-3 border rounded-xl bg-gray-50">
                    <p className="text-xs font-bold text-gray-500">
                      Energi Rata-rata
                    </p>
                    <p className="text-xl font-black mt-1">
                      {selectedCandidate.avgEnergy ?? 0}
                    </p>
                  </div>

                  <div className="p-3 border rounded-xl bg-gray-50">
                    <p className="text-xs font-bold text-gray-500">
                      Volume Dominan
                    </p>
                    <p className="text-sm font-bold mt-2">
                      {selectedCandidate.dominantTone || '-'}
                    </p>
                  </div>

                </div>
              </section>

              {/* TIMELINE */}
              <section>
                <h2 className="text-sm font-bold text-gray-500 uppercase mb-4 border-b pb-2">
                  Timeline Observasi
                </h2>

                {samples.length === 0 ? (
                  <div className="p-4 bg-gray-50 border rounded-xl text-xs text-gray-500">
                    Belum ada data telemetry detail pada hasil wawancara ini.
                    Data timeline akan tersedia untuk wawancara yang dilakukan
                    setelah penyimpanan telemetry diaktifkan.
                  </div>
                ) : (
                  <>
                    <div className="h-32 flex items-end gap-[1px] bg-gray-100 p-2 border rounded-xl">
                      {samples.map((sample, index) => {
                        const stress = Math.max(
                          0,
                          Math.min(Number(sample.stress) || 0, 100)
                        );

                        const height = Math.max(3, stress);

                        return (
                          <div
                            key={index}
                            className="flex-1 h-full flex items-end group relative"
                          >
                            <div
                              className="w-full bg-blue-400 rounded-t"
                              style={{ height: `${height}%` }}
                            />

                            <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-black text-white text-[10px] p-2 rounded z-20 whitespace-nowrap">
                              <div>
                                Waktu: {formatTime(sample.timestamp)}
                              </div>
                              <div>
                                Stress: {sample.stress ?? 0}%
                              </div>
                              <div>
                                Ekspresi: {sample.expression || '-'}
                              </div>
                              <div>
                                Volume: {sample.volumeLabel || '-'}
                              </div>
                              <div>
                                Energi: {sample.energy ?? 0}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex justify-between text-[10px] text-gray-400 mt-1 font-bold">
                      <span>AWAL</span>
                      <span>AKHIR</span>
                    </div>
                  </>
                )}
              </section>

              {/* TRANSKRIP */}
              <section className="border rounded-xl overflow-hidden">
                <button
                  onClick={() => setShowTranscript(!showTranscript)}
                  className="w-full p-4 flex justify-between items-center text-sm font-bold bg-gray-50 hover:bg-gray-100"
                >
                  <span>📄 Transkrip Lengkap</span>
                  <span>
                    {showTranscript ? '▲ Tutup' : '▼ Buka'}
                  </span>
                </button>

                {showTranscript && (
                  <div className="p-4 space-y-3 max-h-[500px] overflow-y-auto border-t">
                    {(selectedCandidate.chatHistory || []).map(
                      (msg, index) => (
                        <div
                          key={index}
                          className={`p-3 rounded-xl text-sm max-w-[85%] ${
                            msg.role === 'assistant'
                              ? 'bg-gray-100 border text-gray-800'
                              : 'bg-blue-600 text-white ml-auto'
                          }`}
                        >
                          <p className="text-[10px] font-bold uppercase opacity-70 mb-1">
                            {msg.role === 'assistant'
                              ? 'AI HRD'
                              : selectedCandidate.studentName}
                          </p>

                          <p className="whitespace-pre-line">
                            {msg.content}
                          </p>
                        </div>
                      )
                    )}
                  </div>
                )}
              </section>

              {/* CATATAN GURU */}
              <section>
                <h2 className="text-sm font-bold text-gray-500 uppercase mb-4 border-b pb-2">
                  Catatan Guru
                </h2>

                <textarea
                  value={teacherNotes}
                  onChange={(event) =>
                    setTeacherNotes(event.target.value)
                  }
                  placeholder="Catatan internal guru..."
                  className="w-full p-3 border rounded-xl text-sm min-h-[120px] outline-none focus:border-gray-800"
                />

                <button
                  onClick={handleSaveNote}
                  className="mt-2 bg-black text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-gray-800"
                >
                  Simpan Catatan
                </button>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
