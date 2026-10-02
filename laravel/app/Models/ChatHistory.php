<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ChatHistory extends Model
{
    use HasFactory;

    protected $fillable = [
        'room_id',
        'student_name',
        'user_input',
        'ai_response',
        'ekspresi',
        'stres_level',
        'timestamp',
    ];

    protected $casts = [
        'timestamp'   => 'datetime',
        'stres_level' => 'integer',
    ];

    /**
     * Rekap wawancara induk dari histori chat ini (dicocokkan lewat room_id).
     */
    public function interview()
    {
        return $this->belongsTo(Interview::class, 'room_id', 'room_id');
    }
}
