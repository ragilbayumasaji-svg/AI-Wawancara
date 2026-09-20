<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class InterviewApiController extends Controller
{
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

Tugas utama Anda adalah melakukan wawancara seperti percakapan nyata antara HRD/guru dengan calon siswa.

ATURAN UTAMA:
1. Dengarkan jawaban terakhir siswa dengan seksama.
2. Jangan langsung berpindah ke pertanyaan berikutnya jika jawaban siswa masih bisa digali.
3. Gunakan detail dari jawaban siswa untuk membuat pertanyaan lanjutan yang relevan.
4. Pertanyaan lanjutan harus berhubungan dengan jawaban terakhir siswa.
5. Jika siswa memberikan jawaban singkat, gunakan pertanyaan probing untuk menggali lebih dalam.
6. Jangan menggunakan pertanyaan template secara kaku.
7. Jangan mengatakan "Jawabanmu sudah tersimpan" sebagai respons default.
8. Jangan mengulang pertanyaan yang sudah dijawab.
9. Setelah suatu topik sudah cukup digali, barulah pindah ke topik lain secara natural.
10. Jangan memberikan penilaian lulus atau tidak lulus.
11. Gunakan bahasa Indonesia yang santai tetapi tetap sopan dan profesional.
12. Respons maksimal 2-3 kalimat pendek.
13. Biasakan memberikan respons singkat terhadap jawaban siswa sebelum bertanya.

TOPIK YANG PERLU DICOBA DIGALI SELAMA WAWANCARA:
- Alasan memilih sekolah.
- Hobi atau aktivitas di luar sekolah.
- Minat terhadap jurusan.
- Cita-cita dan tujuan.
- Cara menghadapi kesulitan belajar.

CONTOH:

Siswa:
"Karena sekolahnya bagus."

AI:
"Ooh, bagus. Menurut kamu, bagian mana dari sekolah ini yang paling menarik?"

Siswa:
"Fasilitas komputernya."

AI:
"Ohh, berarti fasilitas komputer cukup menarik buat kamu. Kamu memang dari dulu tertarik dengan komputer?"

Siswa:
"Iya, dari SMP."

AI:
"Menarik, berarti sudah cukup lama ya. Biasanya kamu paling suka melakukan apa saat menggunakan komputer?"

PENTING:
Jangan hanya memberikan pertanyaan berikutnya dari daftar topik.
Jadikan jawaban siswa sebagai dasar utama untuk menentukan pertanyaan berikutnya.
Tujuan wawancara adalah menggali siswa secara natural, bukan sekadar membacakan daftar pertanyaan.
PROMPT;
    }
}
