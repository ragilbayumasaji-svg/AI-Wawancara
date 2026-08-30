require('dotenv').config();
const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware (cukup dipanggil sekali)
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

// Inisialisasi Database SQLite
const db = new sqlite3.Database('./data_wawancara.db', (err) => {
  if (err) console.error('Error DB:', err.message);
  else console.log('Database SQLite Siap!');
});

// Buat Tabel jika belum ada
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS kotak_pos (
    room_id TEXT PRIMARY KEY,
    daftar_soal TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS interviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_name TEXT NOT NULL,
    room_id TEXT NOT NULL,
    avg_stress INTEGER NOT NULL,
    telemetry_logs TEXT,
    psychological_report TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

// --- API KOTAK POS (SOAL GURU) ---
app.get('/api/kotak-pos/:roomId', (req, res) => {
  const { roomId } = req.params;
  db.get(`SELECT daftar_soal FROM kotak_pos WHERE room_id = ?`, [roomId], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.json({ daftar_soal: null });
    res.json({ daftar_soal: JSON.parse(row.daftar_soal) });
  });
});

app.post('/api/kotak-pos', (req, res) => {
  const { room_id, daftar_soal } = req.body;
  const soalJson = JSON.stringify(daftar_soal);
  db.run(
    `INSERT INTO kotak_pos (room_id, daftar_soal) VALUES (?, ?) 
     ON CONFLICT(room_id) DO UPDATE SET daftar_soal=excluded.daftar_soal`,
    [room_id, soalJson],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Soal berhasil disimpan' });
    }
  );
});

// --- API REKAP WAWANCARA ---
app.get('/api/interviews', (req, res) => {
  db.all(`SELECT * FROM interviews ORDER BY created_at DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const formatted = rows.map(r => ({
      ...r,
      telemetry_logs: JSON.parse(r.telemetry_logs || '[]')
    }));
    res.json(formatted);
  });
});

app.post('/api/interviews', (req, res) => {
  const { student_name, room_id, avg_stress, telemetry_logs, psychological_report } = req.body;
  db.run(
    `INSERT INTO interviews (student_name, room_id, avg_stress, telemetry_logs, psychological_report) 
     VALUES (?, ?, ?, ?, ?)`,
    [student_name, room_id, avg_stress, JSON.stringify(telemetry_logs), psychological_report],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Laporan berhasil disimpan', id: this.lastID });
    }
  );
});

app.delete('/api/interviews/:id', (req, res) => {
  db.run(`DELETE FROM interviews WHERE id = ?`, [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Data terhapus' });
  });
});

// --- API PROXY FOR LLM (GROQ / GEMINI) ---
app.post('/api/ai-chat', async (req, res) => {
  const { promptText } = req.body;
  
  // 1. Coba panggil Groq lebih dulu
  if (process.env.GROQ_API_KEY) {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: 'Kamu pewawancara AI konseling yang empati dan ramah.' },
            { role: 'user', content: promptText }
          ],
          max_tokens: 120
        })
      });
      if (response.ok) {
        const data = await response.json();
        return res.json({ result: data.choices[0]?.message?.content, provider: 'Groq (Llama 3.3)' });
      }
    } catch (e) {
      console.warn("Groq error, fallback to Gemini...");
    }
  }

  // 2. Fallback ke Gemini jika Groq gagal
  if (process.env.GEMINI_API_KEY) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] })
      });
      if (response.ok) {
        const data = await response.json();
        return res.json({ result: data.candidates?.[0]?.content?.parts?.[0]?.text, provider: 'Gemini 1.5 Flash' });
      }
    } catch (e) {}
  }

  // 3. Fallback jika kedua API gagal
  res.json({ result: null, provider: 'Lokal (Smart Dynamic)' });
});

// Jalankan server di baris paling bawah
app.listen(PORT, () => console.log(`Server berjalan di port ${PORT}`));