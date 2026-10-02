<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class InterviewAnswer extends Model
{
    use HasFactory;

    protected $fillable = [
        'interview_id',
        'question_id',
        'sequence',
        'question_text',
        'user_answer',
        'ai_response',
    ];

    protected $casts = [
        'sequence' => 'integer',
    ];

    public function interview(): BelongsTo
    {
        return $this->belongsTo(Interview::class);
    }

    public function question(): BelongsTo
    {
        return $this->belongsTo(InterviewQuestion::class, 'question_id');
    }
}
