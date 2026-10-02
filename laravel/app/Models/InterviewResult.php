<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class InterviewResult extends Model
{
    use HasFactory;

    protected $fillable = [
        'interview_id',
        'student_id',
        'summary',
        'strengths',
        'areas_to_improve',
        'avg_stress',
        'expression_summary',
        'audio_summary',
        'teacher_notes',
    ];

    protected $casts = [
        'strengths' => 'array',
        'areas_to_improve' => 'array',
        'avg_stress' => 'float',
        'expression_summary' => 'array',
        'audio_summary' => 'array',
    ];

    public function interview(): BelongsTo
    {
        return $this->belongsTo(Interview::class);
    }

    public function student(): BelongsTo
    {
        return $this->belongsTo(User::class, 'student_id');
    }
}
