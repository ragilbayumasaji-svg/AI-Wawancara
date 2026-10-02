<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TelemetryLog extends Model
{
    use HasFactory;

    protected $fillable = [
        'interview_id',
        'recorded_at',
        'elapsed_seconds',
        'expression',
        'gaze',
        'stress_level',
        'audio_energy',
        'volume_label',
    ];

    protected $casts = [
        'recorded_at' => 'datetime',
        'elapsed_seconds' => 'integer',
        'stress_level' => 'float',
        'audio_energy' => 'float',
    ];

    public function interview(): BelongsTo
    {
        return $this->belongsTo(Interview::class);
    }
}
