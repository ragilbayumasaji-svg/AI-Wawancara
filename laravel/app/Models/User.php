<?php

namespace App\Models;

use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

#[Fillable(['name', 'email', 'password', 'role'])]
#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable
{
    use HasFactory, Notifiable;

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
        ];
    }

    // Interview yang dilakukan student
    public function interviews(): HasMany
    {
        return $this->hasMany(Interview::class, 'student_id');
    }

    // Pertanyaan yang dibuat teacher/admin
    public function interviewQuestions(): HasMany
    {
        return $this->hasMany(InterviewQuestion::class, 'created_by');
    }

    // Hasil interview milik student
    public function interviewResults(): HasMany
    {
        return $this->hasMany(InterviewResult::class, 'student_id');
    }
}
