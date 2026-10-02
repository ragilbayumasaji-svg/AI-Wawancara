# AI WawancARA — Refactor ke Laravel + React

Refactor dari stack lama (Express + Alpine.js) ke **Laravel** (backend) + **React + Tailwind** (frontend).

## Struktur folder

```
ai-wawancara/
├── laravel/
│   ├── app/Http/Controllers/Api/InterviewApiController.php   # ganti server.js
│   ├── app/Models/ChatHistory.php
│   ├── app/Models/Interview.php
│   ├── database/migrations/2026_09_18_000001_create_chat_histories_table.php
│   ├── database/migrations/2026_09_18_000002_create_interviews_table.php
│   ├── routes/api.php
│   └── config/services.php.snippet   # tambahkan ke config/services.php aslimu
└── react/
    ├── src/api/interviewApi.js       # fetch helper ke endpoint Laravel
    ├── src/components/CandidateForm.jsx
    ├── src/components/WebcamTelemetry.jsx
    ├── src/components/ChatContainer.jsx
    ├── src/components/VoiceController.jsx
    ├── src/App.jsx
    ├── src/index.css
    └── tailwind.config.js
```

## Cara pasang — Laravel

1. Salin isi `laravel/app`, `laravel/database`, `laravel/routes` ke proyek Laravel-mu (asumsi Laravel 11+, jadi tidak perlu daftar route/kernel manual — cukup pastikan `routes/api.php` sudah di-load, atau `php artisan install:api` jika belum ada).
2. Tambahkan blok di `laravel/config/services.php.snippet` ke `config/services.php`, lalu isi `.env`:
   ```
   GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxxxxxx
   ```
3. Jalankan migrasi:
   ```bash
   php artisan migrate
   ```
4. Pastikan `python3 -m edge_tts` tersedia di server (sama seperti kebutuhan `server.js` lama) untuk endpoint `/api/tts`.
5. Jalankan `php artisan serve` (atau setup Nginx/Octane sesuai kebutuhan produksi).

## Cara pasang — React

1. Buat proyek Vite baru (`npm create vite@latest react -- --template react`), lalu timpa `src/` dan `tailwind.config.js` dengan file dari folder `react/` ini.
2. Install dependency:
   ```bash
   npm install
   npm install -D tailwindcss postcss autoprefixer
   ```
3. Set base URL API jika Laravel di-hosting terpisah dari React (buat `.env`):
   ```
   VITE_API_BASE_URL=http://localhost:8000/api
   ```
   Jika React di-serve dari domain/proxy yang sama dengan Laravel, biarkan default (`/api`).
4. Jalankan:
   ```bash
   npm run dev
   ```

## Perubahan penting dari versi lama

- **Persona AI**: system prompt diubah dari "Kak Rama" (konselor BK gaul) menjadi **Tim HRD/Panitia PPDB** — ramah & profesional, tetap ber-active listening (apresiasi jawaban → lanjut ke pertanyaan berikutnya), dengan topik: alasan pilih sekolah, hobi/minat, jurusan/ekskul, cita-cita, cara hadapi tantangan belajar.
- **Keamanan TTS**: `server.js` lama menjalankan `exec()` dengan string shell mentah (rawan command injection dari teks bebas). Versi Laravel memakai `Process::run([...])` dengan array argumen terpisah, jadi lebih aman.
- **Riwayat & rekap**: selain `chat_histories` (tiap giliran tanya-jawab), ditambahkan tabel `interviews` + endpoint `POST /api/interview/finish` untuk menyimpan rekap akhir sesi (rata-rata stres, log telemetri) — dipanggil otomatis saat sesi selesai di `App.jsx`.
- **MediaPipe & Web Speech API**: tetap dipakai persis seperti versi Alpine (dimuat via CDN script tag di `WebcamTelemetry.jsx`), karena keduanya library berbasis browser global yang sulit di-bundle sebagai ES module. Logika kalkulasi stres/ekspresi dari landmark wajah dipindahkan apa adanya, hanya dibungkus jadi React hook.
- **Audio TTS**: pemutaran suara AI sekarang murni lewat audio hasil Edge-TTS dari backend Laravel (`<audio>` blob), bukan `speechSynthesis` browser — sesuai suara custom `id-ID-ArdiNeural` yang sudah kamu siapkan di server lama.

## Yang mungkin masih perlu kamu sesuaikan

- Autentikasi/otorisasi endpoint API (versi lama tidak punya auth sama sekali).
- Rate limiting untuk `/api/ai-chat` dan `/api/tts` (mis. `throttle` middleware Laravel) supaya tidak jadi celah biaya Groq/CPU TTS.
- Validasi ukuran `history` yang dikirim dari frontend supaya tidak membengkak tanpa batas dalam satu sesi panjang.
