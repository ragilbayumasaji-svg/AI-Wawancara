import React, { useEffect, useMemo, useState } from 'react';
import {
  fetchTeacherInterviews,
  fetchTeacherInterviewDetail,
} from '../api/interviewApi';

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

const normalize = (text) => String(text || '').trim().replace(/\s+/g, ' ');

function parseInterview(chatHistory = []) {
  const topics = [];
  let currentTopic = null;

  const isMainQuestion = (text) => INITIAL_QUESTIONS.some((q) => normalize(q) === normalize(text));
  const isClosing = (text) => {
    const lower = String(text || '').toLowerCase();
    return lower.includes('terima kasih') && (lower.includes('selesai') || lower.includes('berakhir'));
  };

  chatHistory.forEach((msg) => {
    if (msg.role === 'assistant') {
      if (isMainQuestion(msg.content)) {
        const index = INITIAL_QUESTIONS.findIndex((q) => normalize(q) === normalize(msg.content));
        currentTopic = {
          title: TOPIC_TITLES[index] || 'Topik Tambahan',
          mainQuestion: msg.content,
          mainAnswer: null,
          followUps: [],
        };
        topics.push(currentTopic);
      } else if (currentTopic && !isClosing(msg.content)) {
        currentTopic.followUps.push({ question: msg.content, answer: null });
      }
    }

    if (msg.role === 'user' && currentTopic) {
      if (currentTopic.followUps.length > 0) {
        const last = currentTopic.followUps[currentTopic.followUps.length - 1];
        if (!last.answer) last.answer = msg.content;
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

function formatDuration(seconds) {
  if (!Number.isFinite(Number(seconds)) || Number(seconds) < 0) return 'Belum ada data';
  const total = Math.round(Number(seconds));
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function downsample(items, max = 80) {
  if (items.length <= max) return items;
  const step = (items.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => items[Math.round(i * step)]);
}

function StatCard({ icon, label, value, sub }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
          <p className="mt-1 text-xl font-black text-slate-800">{value}</p>
          {sub && <p className="mt-1 text-[11px] text-slate-500">{sub}</p>}
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-lg">{icon}</div>
      </div>
    </div>
  );
}

function SectionCard({ title, icon, children, className = '' }) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
      <div className="mb-4 flex items-center gap-2">
        <span className="text-lg">{icon}</span>
        <h2 className="text-sm font-black uppercase tracking-wide text-slate-700">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function EmptyState({ text }) {
  return (
    <div className="flex min-h-[170px] items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-5 text-center text-xs text-slate-500">
      {text}
    </div>
  );
}

function LineChart({ data, valueKey, label, maxValue = null, formatter = (v) => v }) {
  const points = useMemo(() => downsample(data.filter((item) => numberOrNull(item[valueKey]) !== null)), [data, valueKey]);

  if (!points.length) return <EmptyState text={label} />;

  const width = 720;
  const height = 230;
  const padX = 38;
  const padY = 25;
  const values = points.map((p) => numberOrNull(p[valueKey]));
  const max = maxValue ?? Math.max(...values, 1);
  const min = Math.min(0, ...values);
  const range = Math.max(max - min, 1);

  const coords = points.map((point, index) => {
    const x = padX + (index / Math.max(points.length - 1, 1)) * (width - padX * 2);
    const y = height - padY - ((numberOrNull(point[valueKey]) - min) / range) * (height - padY * 2);
    return { ...point, x, y };
  });

  const path = coords.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const area = `${path} L ${coords[coords.length - 1].x} ${height - padY} L ${coords[0].x} ${height - padY} Z`;

  return (
    <div>
      <div className="overflow-hidden rounded-xl bg-slate-50 p-2">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-56 w-full" role="img" aria-label={label}>
          <line x1={padX} x2={width - padX} y1={height - padY} y2={height - padY} stroke="#cbd5e1" />
          <line x1={padX} x2={padX} y1={padY} y2={height - padY} stroke="#cbd5e1" />
          <path d={area} fill="#dbeafe" opacity="0.55" />
          <path d={path} fill="none" stroke="#2563eb" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          {coords.map((p, i) => (
            <circle key={`${p.timestamp}-${i}`} cx={p.x} cy={p.y} r={points.length < 35 ? 3.2 : 1.8} fill="#2563eb">
              <title>{`${formatTime(p.timestamp)} • ${formatter(numberOrNull(p[valueKey]))}`}</title>
            </circle>
          ))}
          <text x="5" y={padY + 5} fontSize="10" fill="#64748b">{formatter(max)}</text>
          <text x="10" y={height - padY + 4} fontSize="10" fill="#64748b">{formatter(min)}</text>
        </svg>
      </div>
      <div className="mt-1 flex justify-between text-[10px] font-bold text-slate-400">
        <span>{formatTime(points[0].timestamp)}</span>
        <span>{formatTime(points[points.length - 1].timestamp)}</span>
      </div>
    </div>
  );
}

function DonutChart({ entries, centerLabel = 'Ekspresi' }) {
  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  if (!total) return <EmptyState text="Belum ada data ekspresi wajah." />;

  const palette = ['#2563eb', '#16a34a', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#64748b'];
  let offset = 0;
  const gradient = entries.map(([key, count], index) => {
    const start = (offset / total) * 100;
    offset += count;
    const end = (offset / total) * 100;
    return `${palette[index % palette.length]} ${start}% ${end}%`;
  }).join(', ');

  return (
    <div className="grid grid-cols-[150px_1fr] items-center gap-4">
      <div className="relative mx-auto h-36 w-36 rounded-full" style={{ background: `conic-gradient(${gradient})` }}>
        <div className="absolute inset-5 flex flex-col items-center justify-center rounded-full bg-white shadow-inner">
          <span className="text-2xl font-black text-slate-800">{total}</span>
          <span className="text-[10px] font-bold uppercase text-slate-400">{centerLabel}</span>
        </div>
      </div>
      <div className="space-y-2">
        {entries.map(([key, count], index) => (
          <div key={key} className="flex items-center justify-between gap-3 text-xs">
            <span className="flex min-w-0 items-center gap-2 font-semibold text-slate-600">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: palette[index % palette.length] }} />
              <span className="truncate">{key}</span>
            </span>
            <span className="font-black text-slate-800">{Math.round((count / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function VolumeBars({ entries }) {
  if (!entries.length) return <EmptyState text="Belum ada data microphone." />;
  const max = Math.max(...entries.map(([, count]) => count), 1);
  return (
    <div className="space-y-4">
      {entries.map(([label, count]) => (
        <div key={label}>
          <div className="mb-1 flex justify-between text-xs font-bold text-slate-600">
            <span>{label}</span>
            <span>{count} sampel</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-indigo-500" style={{ width: `${(count / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function CombinedTimeline({ samples }) {
  const points = downsample(samples, 100);
  if (!points.length) return <EmptyState text="Belum ada telemetry untuk sesi ini." />;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
        <span>Waktu</span><span>Wajah</span><span>Suara</span>
      </div>
      <div className="max-h-72 space-y-1 overflow-y-auto rounded-xl bg-slate-50 p-2">
        {points.map((sample, index) => (
          <div key={`${sample.timestamp}-${index}`} className="grid grid-cols-3 items-center gap-2 rounded-lg bg-white px-3 py-2 text-[11px] shadow-sm">
            <div>
              <p className="font-black text-slate-700">{formatTime(sample.timestamp)}</p>
              <p className="text-slate-400">{sample.elapsedSeconds != null ? `${sample.elapsedSeconds}s` : '-'}</p>
            </div>
            <div>
              <p className="font-semibold text-slate-700">{sample.expression || 'Belum ada data'}</p>
              <p className="text-slate-400">Ketegangan: {sample.facialTension == null ? 'Belum ada data' : `${Math.round(sample.facialTension)}%`}</p>
            </div>
            <div>
              <p className="font-semibold text-slate-700">{sample.volumeLabel || 'Belum ada data'}</p>
              <p className="text-slate-400">Energi: {sample.energy == null ? 'Belum ada data' : sample.energy}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminDashboard({ onBack }) {
  const [results, setResults] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showTranscript, setShowTranscript] = useState(false);
  const [teacherNotes, setTeacherNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function loadInterviews() {
      try {
        setLoading(true);
        setError('');
        const data = await fetchTeacherInterviews();
        if (!cancelled) {
          const interviews = Array.isArray(data.interviews) ? data.interviews : [];
          setResults(interviews.map((item) => ({
            ...item,
            studentName: item.student_name || '-',
            roomId: item.room_id || '-',
            date: item.created_at,
            samplesCount: Number(item.samples_count || 0),
            chatHistory: [],
            telemetrySamples: [],
            teacherNotes: '',
          })));
          setSelectedIndex(0);
        }
      } catch (e) {
        console.error('Gagal mengambil daftar wawancara:', e);
        if (!cancelled) {
          setError(e.message || 'Gagal mengambil data wawancara.');
          setResults([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadInterviews();
    return () => { cancelled = true; };
  }, []);

  const selectedCandidate = results[selectedIndex] || null;

  useEffect(() => {
    if (!selectedCandidate?.id) return undefined;
    let cancelled = false;

    async function loadDetail() {
      try {
        setDetailLoading(true);
        setError('');
        const data = await fetchTeacherInterviewDetail(selectedCandidate.id);
        if (cancelled) return;

        const interview = data.interview || {};
        const answers = Array.isArray(data.answers) ? data.answers : [];
        const telemetry = Array.isArray(data.telemetry) ? data.telemetry : [];
        const summary = data.summary || {};
        const result = data.result || null;

        const chatHistory = [];
        answers.forEach((answer) => {
          if (answer.question_text) chatHistory.push({ role: 'assistant', content: answer.question_text });
          if (answer.user_answer) chatHistory.push({ role: 'user', content: answer.user_answer });
          if (answer.ai_response) chatHistory.push({ role: 'assistant', content: answer.ai_response });
        });

        const telemetrySamples = telemetry.map((item) => ({
          timestamp: item.recorded_at,
          elapsedSeconds: item.elapsed_seconds,
          expression: item.expression,
          gaze: item.gaze,
          facialTension: numberOrNull(item.facial_tension ?? item.stress_level),
          energy: numberOrNull(item.audio_energy),
          volumeLabel: item.volume_label,
        }));

        const updatedCandidate = {
          ...selectedCandidate,
          studentName: interview.student_name || selectedCandidate.studentName || '-',
          roomId: interview.room_id || selectedCandidate.roomId || '-',
          avgStress: numberOrNull(summary.avg_facial_tension),
          avgEnergy: numberOrNull(summary.avg_energy),
          dominantExpression: summary.dominant_expression || null,
          dominantTone: summary.dominant_volume || null,
          expressionCounts: summary.expression_counts || {},
          volumeCounts: summary.volume_counts || {},
          durationSeconds: numberOrNull(summary.duration_seconds),
          questionCount: Number(summary.question_count || answers.length || 0),
          chatHistory,
          telemetrySamples,
          samplesCount: telemetrySamples.length,
          teacherNotes: result?.teacher_notes || '',
          result,
        };

        setResults((current) => current.map((item) => item.id === selectedCandidate.id ? updatedCandidate : item));
      } catch (e) {
        console.error('Gagal mengambil detail wawancara:', e);
        if (!cancelled) setError(e.message || 'Gagal mengambil detail wawancara.');
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    }

    loadDetail();
    return () => { cancelled = true; };
  }, [selectedCandidate?.id]);

  useEffect(() => {
    setTeacherNotes(selectedCandidate?.teacherNotes || '');
    setShowTranscript(false);
  }, [selectedIndex, selectedCandidate?.id]);

  const topics = selectedCandidate ? parseInterview(selectedCandidate.chatHistory) : [];
  const samples = selectedCandidate?.telemetrySamples || [];

  const faceSamples = useMemo(() => samples.filter((s) => s.facialTension != null), [samples]);
  const audioSamples = useMemo(() => samples.filter((s) => s.energy != null), [samples]);
  const expressionEntries = useMemo(() => Object.entries(selectedCandidate?.expressionCounts || {}).sort((a, b) => b[1] - a[1]), [selectedCandidate]);
  const volumeEntries = useMemo(() => Object.entries(selectedCandidate?.volumeCounts || {}).sort((a, b) => b[1] - a[1]), [selectedCandidate]);

  const handleSaveNote = () => {
    if (!selectedCandidate) return;
    const updated = results.map((item) => item.id === selectedCandidate.id ? { ...item, teacherNotes } : item);
    localStorage.setItem('interview_results', JSON.stringify(updated));
    setResults(updated);
  };

  return (
    <div className="flex h-[85vh] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 bg-white p-4">
        <div>
          <h2 className="text-lg font-black text-slate-800">Dashboard Rekapitulasi Wawancara PPDB</h2>
          <p className="text-xs text-slate-500">Interview Analytics • percakapan dan observasi telemetry sistem.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => window.location.reload()} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-100">🔄 Muat Ulang Data</button>
          <button onClick={onBack} className="rounded-lg bg-maroon-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-maroon-700">Kembali ke Wawancara</button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="w-1/3 overflow-y-auto border-r border-slate-200 bg-slate-100/70 p-3">
          <h3 className="mb-2 text-xs font-black uppercase tracking-wider text-slate-400">Daftar Calon Siswa ({results.length})</h3>
          {loading ? (
            <div className="p-6 text-center text-xs text-slate-400">Memuat data wawancara...</div>
          ) : error && !selectedCandidate ? (
            <div className="rounded-xl bg-white p-5 text-center text-xs text-rose-600">⚠️ {error}</div>
          ) : results.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400">Belum ada data wawancara tersimpan.</div>
          ) : results.map((item, idx) => (
            <button key={item.id || idx} onClick={() => setSelectedIndex(idx)} className={`mb-2 w-full rounded-xl border p-3 text-left transition ${selectedIndex === idx ? 'border-maroon-600 bg-white shadow-md ring-1 ring-maroon-600' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-black text-sm text-slate-800">{item.studentName}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-600">{item.samplesCount} sampel</span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-slate-500"><span>Room: {item.roomId}</span><span>{item.date}</span></div>
            </button>
          ))}
        </div>

        <div className="min-w-0 flex-1 overflow-y-auto p-5">
          {!selectedCandidate ? (
            <div className="flex h-full items-center justify-center text-xs text-slate-400">Pilih peserta di sebelah kiri untuk melihat rekap detail.</div>
          ) : (
            <div className="space-y-5">
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">Interview Analytics</p>
                    <h1 className="mt-1 text-2xl font-black text-slate-900">{selectedCandidate.studentName}</h1>
                    <p className="mt-1 text-xs text-slate-500">Room {selectedCandidate.roomId} • {selectedCandidate.date}</p>
                  </div>
                  {detailLoading && <span className="rounded-full bg-blue-50 px-3 py-1 text-[11px] font-bold text-blue-600">Memuat detail…</span>}
                </div>
              </section>

              <section>
                <div className="mb-3 flex items-center gap-2"><span>📊</span><h2 className="text-sm font-black uppercase tracking-wide text-slate-700">Ringkasan Wawancara</h2></div>
                <div className="grid grid-cols-2 gap-3 xl:grid-cols-6">
                  <StatCard icon="⏱️" label="Durasi" value={formatDuration(selectedCandidate.durationSeconds)} />
                  <StatCard icon="📡" label="Telemetry" value={selectedCandidate.samplesCount || 'Belum ada data'} sub="sampel" />
                  <StatCard icon="🙂" label="Ketegangan Wajah" value={selectedCandidate.avgStress == null ? 'Belum ada data' : `${Math.round(selectedCandidate.avgStress)}%`} />
                  <StatCard icon="😊" label="Ekspresi Dominan" value={selectedCandidate.dominantExpression || 'Belum ada data'} />
                  <StatCard icon="🎙️" label="Energi Suara" value={selectedCandidate.avgEnergy == null ? 'Belum ada data' : selectedCandidate.avgEnergy} />
                  <StatCard icon="🔊" label="Volume Dominan" value={selectedCandidate.dominantTone || 'Belum ada data'} />
                </div>
              </section>

              <div className="grid gap-5 xl:grid-cols-2">
                <SectionCard title="Analisis Wajah • Ketegangan" icon="📈">
                  <LineChart data={faceSamples} valueKey="facialTension" label="Belum ada data kamera untuk wawancara ini." maxValue={100} formatter={(v) => `${Math.round(v)}%`} />
                </SectionCard>
                <SectionCard title="Analisis Wajah • Distribusi Ekspresi" icon="😊">
                  <DonutChart entries={expressionEntries} centerLabel="sampel" />
                </SectionCard>
                <SectionCard title="Analisis Suara • Energi" icon="🎙️">
                  <LineChart data={audioSamples} valueKey="energy" label="Belum ada data microphone untuk wawancara ini." maxValue={100} formatter={(v) => Math.round(v)} />
                </SectionCard>
                <SectionCard title="Analisis Suara • Distribusi Volume" icon="🔊">
                  <VolumeBars entries={volumeEntries} />
                </SectionCard>
              </div>

              <SectionCard title="Timeline Observasi Gabungan" icon="🕐">
                <CombinedTimeline samples={samples} />
              </SectionCard>

              <SectionCard title="Analisis Percakapan" icon="💬">
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <StatCard icon="❓" label="Pertanyaan" value={selectedCandidate.questionCount || 'Belum ada data'} />
                  <StatCard icon="💬" label="Pesan" value={selectedCandidate.chatHistory?.length || 'Belum ada data'} />
                  <StatCard icon="🧩" label="Topik Utama" value={topics.length || 'Belum ada data'} />
                  <StatCard icon="⏱️" label="Durasi Sesi" value={formatDuration(selectedCandidate.durationSeconds)} />
                </div>
                <p className="mt-3 text-[11px] text-slate-400">Durasi jawaban per pertanyaan tidak ditampilkan karena timestamp awal/akhir jawaban belum tersedia secara valid di database.</p>
              </SectionCard>

              <SectionCard title="Ringkasan AI Wawancara" icon="🤖">
                <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4 text-sm leading-6 text-slate-700">
                  {selectedCandidate.result?.summary || 'Belum ada ringkasan AI tersimpan untuk sesi ini.'}
                </div>
              </SectionCard>

              <SectionCard title="Topik yang Digali" icon="🧠">
                <div className="space-y-3">
                  {topics.length === 0 ? <EmptyState text="Belum ada topik percakapan yang dapat diringkas." /> : topics.map((topic, index) => (
                    <div key={index} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <h3 className="font-black text-slate-800">{index + 1}. {topic.title}</h3>
                      <p className="mt-2 text-xs font-bold text-slate-500">Pertanyaan Utama</p>
                      <p className="mt-1 text-sm italic text-slate-700">“{topic.mainQuestion}”</p>
                      <div className="mt-2 border-l-2 border-blue-500 pl-3"><p className="text-xs font-bold text-blue-700">Jawaban Siswa</p><p className="mt-1 text-sm text-slate-700">{topic.mainAnswer || 'Belum ada jawaban'}</p></div>
                      {topic.followUps.map((followUp, followUpIndex) => (
                        <div key={followUpIndex} className="ml-4 mt-3 border-t border-slate-200 pt-3"><p className="text-xs font-bold text-slate-500">Follow-up {followUpIndex + 1}</p><p className="mt-1 text-sm italic">“{followUp.question}”</p><div className="mt-2 border-l-2 border-emerald-500 pl-3"><p className="text-xs font-bold text-emerald-700">Jawaban Siswa</p><p className="mt-1 text-sm">{followUp.answer || 'Belum ada jawaban'}</p></div></div>
                      ))}
                    </div>
                  ))}
                </div>
              </SectionCard>

              <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <button onClick={() => setShowTranscript(!showTranscript)} className="flex w-full items-center justify-between bg-slate-50 p-4 text-sm font-black hover:bg-slate-100"><span>📄 Transkrip Lengkap</span><span>{showTranscript ? '▲ Tutup' : '▼ Buka'}</span></button>
                {showTranscript && <div className="space-y-3 border-t p-4">{(selectedCandidate.chatHistory || []).map((msg, index) => <div key={index} className={`max-w-[85%] rounded-xl p-3 text-sm ${msg.role === 'assistant' ? 'border bg-slate-100 text-slate-800' : 'ml-auto bg-blue-600 text-white'}`}><p className="mb-1 text-[10px] font-black uppercase opacity-70">{msg.role === 'assistant' ? 'AI HRD' : selectedCandidate.studentName}</p><p className="whitespace-pre-line">{msg.content}</p></div>)}</div>}
              </section>

              <SectionCard title="Catatan Guru" icon="👨‍🏫">
                <textarea value={teacherNotes} onChange={(event) => setTeacherNotes(event.target.value)} placeholder="Catatan internal guru..." className="min-h-[120px] w-full rounded-xl border border-slate-300 p-3 text-sm outline-none focus:border-slate-800" />
                <button onClick={handleSaveNote} className="mt-2 rounded-lg bg-black px-4 py-2 text-sm font-black text-white hover:bg-slate-800">Simpan Catatan</button>
              </SectionCard>

              <p className="pb-3 text-[10px] text-slate-400">Data kamera, microphone, dan grafik di atas merupakan observasi teknis sistem, bukan diagnosis psikologis.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
