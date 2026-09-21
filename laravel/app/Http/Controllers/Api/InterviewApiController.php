<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class InterviewApiController extends Controller
{
    public function start(Request $request)
    {
        $validated = $request->validate([
            'room_id' => 'required|string|max:255',
            'student_name' => 'required|string|max:255',
        ]);

        $interview = \App\Models\Interview::create([
            'student_id' => null,
            'student_name' => $validated['student_name'],
            'room_id' => $validated['room_id'],
        ]);

        return response()->json([
            'success' => true,
            'interview_id' => $interview->id,
            'room_id' => $interview->room_id,
            'student_name' => $interview->student_name,
        ], 201);
    }

    public function chat(Request $request)
    {
        $validated = $request->validate([
            'promptText' => 'required|string',
            'history' => 'nullable|array',
            'roomId' => 'nullable|string',
            'studentName' => 'nullable|string',
        ]);

        $history = $validated['history'] ?? [];

        $messages = array_merge(
            [['role' => 'system', 'content' => $this->getSystemPrompt()]],
            $history,
            [['role' => 'user', 'content' => $validated['promptText']]]
        );

        try {
            // Timeout diset ke 15 detik untuk Groq API
            $response = Http::timeout(15)
                ->withHeaders([
                    'Authorization' => 'Bearer ' . env('GROQ_API_KEY'),
                    'Content-Type' => 'application/json',
                ])
                ->post('https://api.groq.com/openai/v1/chat/completions', [
                    'model' => 'openai/gpt-oss-120b',
                    'messages' => $messages,
                    'temperature' => 0.7,
                ]);

            if ($response->successful()) {
                $aiText = $response->json('choices.0.message.content');

                return response()->json([
                    'result' => $aiText,
                    'provider' => 'groq',
                ]);
            }

            Log::error('Groq API Error: ' . $response->body());

            return response()->json([
                'result' => 'Maaf, sistem mengalami kendala koneksi ke server AI. Bisakah kamu mengulangi jawabanmu?',
                'provider' => 'fallback',
            ]);

        } catch (\Exception $e) {
            Log::error('InterviewApiController Chat Exception: ' . $e->getMessage());

            return response()->json([
                'result' => 'Maaf, terjadi gangguan jaringan saat memproses jawabanmu.',
                'provider' => 'fallback',
            ]);
        }
    }

    public function history(Request $request)
    {
        return response()->json(['history' => []]);
    }

    public function tts(Request $request)
    {
        return response()->json(['message' => 'TTS endpoint ready']);
    }

    public function finish(Request $request)
    {
        return response()->json(['success' => true, 'message' => 'Interview finished']);
    }

    private function getSystemPrompt()
    {
        return <<<'PROMPT'
Anda adalah AI interviewer untuk proses penerimaan siswa baru.

Tugas Anda adalah menjadi pewawancara yang ramah, singkat, dan terarah.

STRUKTUR WAWANCARA:
- Wawancara memiliki beberapa pertanyaan utama yang sudah ditentukan oleh sistem.
- Sistem frontend mengontrol urutan pertanyaan utama.
- Sistem frontend juga mengontrol jumlah follow-up.
- Anda TIDAK mengontrol kapan wawancara selesai.
- Anda TIDAK boleh menentukan atau memaksakan topik pertanyaan utama berikutnya.

ATURAN WAJIB:
1. Dengarkan jawaban terakhir siswa.
2. Gunakan informasi dari jawaban terakhir untuk membuat SATU pertanyaan lanjutan yang relevan.
3. Setiap respons Anda hanya boleh berisi SATU pertanyaan.
4. DILARANG memberikan dua pertanyaan atau lebih dalam satu respons.
5. DILARANG menggunakan kata penghubung yang membuat pertanyaan kedua, seperti "dan...", "atau...", "selain itu..." jika menghasilkan pertanyaan tambahan.
6. Jangan menyisipkan pertanyaan dari topik lain.
7. Jangan menanyakan beberapa hal sekaligus.
8. Jangan membuat daftar pertanyaan.
9. Jangan menggabungkan pertanyaan lanjutan dengan pertanyaan utama berikutnya.
10. Jangan mengakhiri wawancara. Sistem yang menentukan kapan wawancara selesai.
11. Jika jawaban siswa sangat singkat, tetap buat hanya SATU pertanyaan probing.
12. Jika jawaban siswa sudah cukup jelas, tetap buat hanya SATU pertanyaan lanjutan yang paling relevan.
13. Gunakan bahasa Indonesia yang natural, santai, sopan, dan mudah dipahami siswa.
14. Maksimal 1 kalimat pendek pembuka + 1 pertanyaan.
15. Jangan memberikan penilaian lulus atau tidak lulus.
16. Jangan mengatakan "jawabanmu sudah tersimpan".
17. Jangan mengulang pertanyaan yang sudah dijawab.
18. Jangan mengubah topik secara tiba-tiba.

CONTOH BENAR:

Siswa:
"Karena fasilitas komputernya bagus."

AI:
"Menarik. Fasilitas komputer apa yang paling ingin kamu gunakan?"

Siswa:
"Untuk belajar cloud computing."

AI:
"Bagian cloud computing apa yang paling ingin kamu pelajari?"

CONTOH SALAH:

"Menarik. Kamu suka komputer? Dan jurusan apa yang kamu pilih?"

SALAH karena ada dua pertanyaan.

CONTOH SALAH:

"Studio musik pasti seru! Kamu biasanya main alat musik apa, atau kamu lebih suka rekaman?"

SALAH karena memberikan pilihan pertanyaan yang terlalu banyak dalam satu giliran.

CONTOH SALAH:

"Menarik. Kamu suka gitar? Selain itu, apa cita-citamu?"

SALAH karena menggabungkan dua topik.

INGAT:
SATU RESPONS = SATU PERTANYAAN.

Jangan pernah memberikan pertanyaan kedua dalam respons yang sama.
PROMPT;
    }

}
