<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Interview extends Model
{
    use HasFactory;

    protected $fillable = [
        'student_name',
        'room_id',
        'avg_stress',
        'psychological_report',
        'telemetry_logs',
    ];

    protected $casts = [
        'telemetry_logs' => 'array',
        'avg_stress'     => 'float',
    ];

    public function chatHistories()
    {
        return $this->hasMany(ChatHistory::class, 'room_id', 'room_id');
    }
}
