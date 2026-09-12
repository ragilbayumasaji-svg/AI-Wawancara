const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { exec } = require('child_process');
const fs = require('fs');
const util = require('util');
const execPromise = util.promisify(exec);
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const SYSTEM_PROMPT = `Kamu "Kak Rama", kakak pembimbing sekolah yang gaul, empatik, dan santai.
ATURAN WAJIB:
1. Selalu CERNA jawaban siswa dulu (refleksi aktif) sebelum lanjut — tunjukkan kamu benar-benar dengar.
2. Gaya bahasa: "lu/gua/bro/dek", boleh "wkwk", santai, TIDAK BOLEH bahasa baku ala guru BK/pewawancara formal.
3. Struktur: (a) tanggapan empati/humor singkat atas isi jawaban, (b) sambung ke pertanyaan lanjutan yang nyambung.
4. Maksimal 2-3 kalimat pendek. Jangan menggurui, jangan menghakimi.`;

const db = new sqlite3.Database('./wawancara.db');

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS chat_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id TEXT NOT NULL,
    user_input TEXT NOT NULL,
    ai_response TEXT,
    ekspresi TEXT,
    stres_level INTEGER,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

// Endpoint AI Chat dengan Active Listening & History Context
app.post('/api/ai-chat', async (req, res) => {
  const { promptText, history = [], room_id = 'SISWA01', ekspresi = null, stres_level = null } = req.body;
  const messages = [{ role: 'system', content: SYSTEM_PROMPT }, ...history, { role: 'user', content: promptText }];
  
  const simpanHistory = (aiText) => {
    db.run(
      `INSERT INTO chat_history (room_id, user_input, ai_response, ekspresi, stres_level) VALUES (?, ?, ?, ?, ?)`,
      [room_id, promptText, aiText, ekspresi, stres_level]
    );
  };

  if (process.env.GROQ_API_KEY) {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages, max_tokens: 150, temperature: 0.8 })
      });
      if (response.ok) {
        const data = await response.json();
        const text = data.choices[0]?.message?.content;
        if (text) { simpanHistory(text); return res.json({ result: text, provider: 'Groq (Llama 3.3)' }); }
      }
    } catch (e) { console.warn("Groq error, fallback..."); }
  }

  const fallback = "Wah santai aja bro, gua masih di sini kok. Coba ceritain lagi ya wkwk.";
  simpanHistory(fallback);
  res.json({ result: fallback, provider: 'Lokal' });
});

// Endpoint Rekap History
app.get('/api/history', (req, res) => {
  const { room_id } = req.query;
  const sql = room_id
    ? `SELECT * FROM chat_history WHERE room_id = ? ORDER BY timestamp DESC`
    : `SELECT * FROM chat_history ORDER BY timestamp DESC LIMIT 200`;
  db.all(sql, room_id ? [room_id] : [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Endpoint Edge-TTS Audio Natural (id-ID-ArdiNeural)
app.post('/api/tts', async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: "Teks kosong" });
  
  const cleanText = text.replace(/[*_~#"`\\]/g, '').trim();
  const tempFile = path.join('/tmp', `tts_${Date.now()}.mp3`);
  
  try {
    await execPromise(`python3 -m edge_tts --voice "id-ID-ArdiNeural" --text "${cleanText}" --write-media "${tempFile}"`);
    if (fs.existsSync(tempFile)) {
      res.sendFile(tempFile, () => {
        try { fs.unlinkSync(tempFile); } catch(e){}
      });
      return;
    }
  } catch (e) {
    console.error("Edge-TTS Error:", e.message);
  }
  res.status(500).json({ error: "Gagal generate suara TTS" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server Kak Rama berjalan di port ${PORT}`));
