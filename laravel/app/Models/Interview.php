<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Interview extends Model
{
    use HasFactory;

    protected $fillable = [
        'student_id',
        'student_name',
        'room_id',
        'avg_stress',
        'psychological_report',
        'telemetry_logs',
    ];

    protected $casts = [
        'telemetry_logs' => 'array',
        'avg_stress' => 'float',
    ];

    // Riwayat percakapan lama
    public function chatHistories()
    {
        return $this->hasMany(ChatHistory::class, 'room_id', 'room_id');
    }

    // Jawaban selama interview
    public function answers(): HasMany
    {
        return $this->hasMany(InterviewAnswer::class, 'interview_id');
    }

    // Rekaman telemetry
    public function telemetryLogs(): HasMany
    {
        return $this->hasMany(TelemetryLog::class, 'interview_id');
    }

    // Hasil akhir interview
    public function result(): HasOne
    {
        return $this->hasOne(InterviewResult::class, 'interview_id');
    }

    // Student
    // Akan aktif setelah kolom student_id ditambahkan ke interviews.
    public function student(): BelongsTo
    {
        return $this->belongsTo(User::class, 'student_id');
    }
}
