<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('interview_results', function (Blueprint $table) {
            $table->id();

            $table->foreignId('interview_id')
                ->unique()
                ->constrained('interviews')
                ->cascadeOnDelete();

            $table->foreignId('student_id')
                ->nullable()
                ->constrained('users')
                ->nullOnDelete();

            // Ringkasan hasil wawancara
            $table->longText('summary')->nullable();

            // Rekap observasi dari proses wawancara
            $table->json('strengths')->nullable();
            $table->json('areas_to_improve')->nullable();

            // Ringkasan telemetry
            $table->decimal('avg_stress', 5, 2)->nullable();
            $table->json('expression_summary')->nullable();
            $table->json('audio_summary')->nullable();

            // Catatan tambahan dari guru
            $table->text('teacher_notes')->nullable();

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('interview_results');
    }
};
