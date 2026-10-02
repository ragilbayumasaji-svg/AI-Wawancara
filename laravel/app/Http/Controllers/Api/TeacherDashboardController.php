<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Interview;
use App\Models\InterviewResult;
use App\Models\User;
use Illuminate\Http\Request;

class TeacherDashboardController extends Controller
{
    public function index(Request $request)
    {
        return response()->json([
            'user' => [
                'id' => $request->user()->id,
                'name' => $request->user()->name,
                'email' => $request->user()->email,
                'role' => $request->user()->role,
            ],

            'stats' => [
                'total_students' => User::where('role', 'student')->count(),
                'total_interviews' => Interview::count(),
                'completed_interviews' => InterviewResult::count(),
            ],
        ]);
    }

    public function show(int $id)
    {
        $interview = Interview::query()
            ->with([
                'student',
                'result',
                'answers' => function ($query) {
                    $query->orderBy('sequence');
                },
                'telemetryLogs' => function ($query) {
                    $query->orderBy('recorded_at');
                },
            ])
            ->findOrFail($id);

        return response()->json([
            'interview' => [
                'id' => $interview->id,
                'room_id' => $interview->room_id,
                'student_id' => $interview->student_id,
                'student_name' => $interview->student?->name ?? $interview->student_name,
                'student_email' => $interview->student?->email,
                'created_at' => $interview->created_at,
                'avg_stress' => $interview->avg_stress,
            ],

            'result' => $interview->result,

            'answers' => $interview->answers->map(function ($answer) {
                return [
                    'id' => $answer->id,
                    'sequence' => $answer->sequence,
                    'question_id' => $answer->question_id,
                    'question_text' => $answer->question_text,
                    'user_answer' => $answer->user_answer,
                    'ai_response' => $answer->ai_response,
                    'created_at' => $answer->created_at,
                ];
            })->values(),

            'telemetry' => $interview->telemetryLogs->map(function ($log) {
                return [
                    'id' => $log->id,
                    'recorded_at' => $log->recorded_at,
                    'elapsed_seconds' => $log->elapsed_seconds,
                    'expression' => $log->expression,
                    'gaze' => $log->gaze,
                    'stress_level' => $log->stress_level,
                    'audio_energy' => $log->audio_energy,
                    'volume_label' => $log->volume_label,
                ];
            })->values(),
        ]);
    }

    public function interviews()
    {
        $interviews = Interview::query()
            ->with(['student', 'result'])
            ->latest()
            ->get()
            ->map(function ($interview) {
                return [
                    'id' => $interview->id,
                    'room_id' => $interview->room_id,
                    'student_id' => $interview->student_id,
                    'student_name' => $interview->student?->name ?? $interview->student_name,
                    'student_email' => $interview->student?->email,
                    'avg_stress' => $interview->avg_stress,
                    'created_at' => $interview->created_at,
                    'has_result' => $interview->result !== null,
                ];
            });

        return response()->json([
            'interviews' => $interviews,
        ]);
    }
}
