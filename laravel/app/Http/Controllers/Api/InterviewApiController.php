<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ChatHistory;
use App\Models\Interview;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Str;

class InterviewApiController extends Controller
{
    /**
     * Persona & aturan wawancara untuk Tim HRD / Panitia PPDB Sekolah Swasta.
     * Menggantikan SYSTEM_PROMPT "Kak Rama" di server.js lama.
     */
    private const SYSTEM_PROMPT = <<<'PROMPT'
Kamu adalah anggota Tim HRD / Panitia PPDB (Penerimaan Peserta Didik Baru) di sebuah Sekolah Swasta. Kamu sedang mewawancarai calon siswa baru.

ATURAN WAJIB:
1. Selalu CERNA jawaban calon siswa dulu (active listening) — beri apresiasi atau tanggapan singkat yang benar-benar nyambung dengan isi jawabannya sebelum melanjutkan.
2. Gaya bahasa: ramah, profesional, komunikatif, dan empatik, layaknya panitia PPDB yang hangat. Hindari nada interogasi formal yang kaku, tapi tetap sopan dan jangan terlalu informal/gaul.
3. Struktur balasan: (a) tanggapan/apresiasi singkat atas jawaban calon siswa, (b) sambung dengan satu pertanyaan lanjutan yang kontekstual.
4. Topik yang bisa digali: alasan memilih sekolah ini, hobi dan minat, ketertarikan jurusan/ekstrakurikuler, cita-cita, serta cara menyikapi tantangan belajar.
5. Maksimal 2-3 kalimat pendek per balasan. Jangan menggurui, jangan menghakimi, dan jangan membuat kesimpulan lulus/tidak lulus.
PROMPT;

    /**
     * POST /api/ai-chat
     * Menggantikan endpoint /api/ai-chat di server.js.
     */
    public function chat(Request $request)
    {
        $validated = $request->validate([
            'promptText'         => 'required|string',
            'history'            => 'array',
            'history.*.role'     => 'required_with:history|string|in:system,user,assistant',
            'history.*.content'  => 'required_with:history|string',
            'room_id'            => 'nullable|string|max:100',
            'student_name'       => 'nullable|string|max:150',
            'ekspresi'           => 'nullable|string|max:100',
            'stres_level'        => 'nullable|integer|min:0|max:100',
        ]);

        $roomId      = $validated['room_id'] ?? 'SISWA01';
        $studentName = $validated['student_name'] ?? null;
        $history     = $validated['history'] ?? [];

        $messages = array_merge(
            [['role' => 'system', 'content' => self::SYSTEM_PROMPT]],
            $history,
            [['role' => 'user', 'content' => $validated['promptText']]]
        );

        [$aiText, $provider] = $this->askGroq($messages);

        ChatHistory::create([
            'room_id'      => $roomId,
            'student_name' => $studentName,
            'user_input'   => $validated['promptText'],
            'ai_response'  => $aiText,
            'ekspresi'     => $validated['ekspresi'] ?? null,
            'stres_level'  => $validated['stres_level'] ?? null,
            'timestamp'    => now(),
        ]);

        return response()->json([
            'result'   => $aiText,
            'provider' => $provider,
        ]);
    }

    /**
     * Panggil Groq (Llama 3.3) dengan fallback jawaban lokal jika API
     * tidak dikonfigurasi atau gagal — persis seperti try/catch di server.js.
     *
     * @return array{0: string, 1: string} [teks_ai, nama_provider]
     */
    private function askGroq(array $messages): array
    {
        $apiKey = config('services.groq.api_key');

        if ($apiKey) {
            try {
                $response = Http::withToken($apiKey)
                    ->timeout(20)
                    ->post('https://api.groq.com/openai/v1/chat/completions', [
                        'model'       => 'llama-3.3-70b-versatile',
                        'messages'    => $messages,
                        'max_tokens'  => 150,
                        'temperature' => 0.8,
                    ]);

                if ($response->successful()) {
                    $text = $response->json('choices.0.message.content');
                    if (!empty($text)) {
                        return [$text, 'Groq (Llama 3.3)'];
                    }
                }
            } catch (\Throwable $e) {
                Log::warning('Groq API error, fallback ke jawaban lokal: ' . $e->getMessage());
            }
        }

        $fallback = 'Terima kasih sudah menjawab. Boleh diceritakan sedikit lebih detail lagi?';

        return [$fallback, 'Lokal'];
    }

    /**
     * GET /api/history
     * Menggantikan endpoint /api/history di server.js.
     */
    public function history(Request $request)
    {
        $request->validate([
            'room_id' => 'nullable|string|max:100',
        ]);

        $query = ChatHistory::query()->orderByDesc('timestamp');

        if ($roomId = $request->query('room_id')) {
            $query->where('room_id', $roomId);
        } else {
            $query->limit(200);
        }

        return response()->json($query->get());
    }

    /**
     * POST /api/tts
     * Menggantikan endpoint /api/tts di server.js. Menggunakan Process facade
     * (bukan shell string mentah) supaya input teks tidak rawan command injection.
     */
    public function tts(Request $request)
    {
        $validated = $request->validate([
            'text'  => 'required|string|max:2000',
            'voice' => 'nullable|string|in:id-ID-ArdiNeural,id-ID-GadisNeural',
        ]);

        $voice     = $validated['voice'] ?? 'id-ID-ArdiNeural';
        $cleanText = trim(preg_replace('/[*_~#"`\\\\]/', '', $validated['text']));

        if ($cleanText === '') {
            return response()->json(['error' => 'Teks kosong'], 422);
        }

        $tmpDir = storage_path('app/tmp');
        if (!is_dir($tmpDir)) {
            mkdir($tmpDir, 0755, true);
        }
        $tempFile = $tmpDir . '/tts_' . Str::random(16) . '.mp3';

        $result = Process::timeout(30)->run([
            'python3', '-m', 'edge_tts',
            '--voice', $voice,
            '--text', $cleanText,
            '--write-media', $tempFile,
        ]);

        if ($result->failed() || !file_exists($tempFile)) {
            Log::error('Edge-TTS error: ' . $result->errorOutput());

            return response()->json(['error' => 'Gagal generate suara TTS'], 500);
        }

        return response()
            ->download($tempFile, 'tts.mp3', ['Content-Type' => 'audio/mpeg'])
            ->deleteFileAfterSend(true);
    }

    /**
     * POST /api/interview/finish
     * Endpoint baru (opsional) untuk merekap sesi wawancara ke tabel `interviews`
     * saat sesi selesai — dipanggil dari saveResultToBackend() di frontend.
     */
    public function finish(Request $request)
    {
        $validated = $request->validate([
            'room_id'              => 'required|string|max:100',
            'student_name'         => 'required|string|max:150',
            'avg_stress'           => 'nullable|numeric|min:0|max:100',
            'psychological_report' => 'nullable|string',
            'telemetry_logs'       => 'nullable|array',
        ]);

        $interview = Interview::updateOrCreate(
            ['room_id' => $validated['room_id']],
            [
                'student_name'         => $validated['student_name'],
                'avg_stress'           => $validated['avg_stress'] ?? null,
                'psychological_report' => $validated['psychological_report'] ?? null,
                'telemetry_logs'       => $validated['telemetry_logs'] ?? [],
            ]
        );

        return response()->json($interview);
    }
}
