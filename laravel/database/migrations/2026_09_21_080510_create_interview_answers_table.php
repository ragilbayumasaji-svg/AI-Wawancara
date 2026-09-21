<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('interview_answers', function (Blueprint $table) {
            $table->id();

            $table->foreignId('interview_id')
                ->constrained('interviews')
                ->cascadeOnDelete();

            $table->foreignId('question_id')
                ->nullable()
                ->constrained('interview_questions')
                ->nullOnDelete();

            $table->unsignedInteger('sequence');

            // Snapshot pertanyaan saat wawancara berlangsung
            $table->text('question_text');

            $table->text('user_answer');
            $table->text('ai_response')->nullable();

            $table->timestamps();

            $table->index(['interview_id', 'sequence']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('interview_answers');
    }
};
