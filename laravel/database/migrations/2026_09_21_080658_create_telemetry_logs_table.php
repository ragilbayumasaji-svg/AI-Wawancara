<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('telemetry_logs', function (Blueprint $table) {
            $table->id();

            $table->foreignId('interview_id')
                ->constrained('interviews')
                ->cascadeOnDelete();

            // Waktu pengambilan sample telemetry
            $table->timestamp('recorded_at')->useCurrent();

            // Waktu relatif sejak wawancara dimulai
            $table->unsignedInteger('elapsed_seconds')->nullable();

            // Data observasional dari sistem
            $table->string('expression')->nullable();
            $table->string('gaze')->nullable();

            // Indikator numerik dari sistem, bukan diagnosis psikologis
            $table->decimal('stress_level', 5, 2)->nullable();

            // Analisis audio
            $table->decimal('audio_energy', 8, 5)->nullable();
            $table->string('volume_label')->nullable();

            $table->timestamps();

            $table->index(['interview_id', 'recorded_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('telemetry_logs');
    }
};
