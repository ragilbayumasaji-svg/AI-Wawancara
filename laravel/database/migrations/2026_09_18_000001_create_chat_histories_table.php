<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('chat_histories', function (Blueprint $table) {
            $table->id();
            $table->string('room_id')->index();
            $table->string('student_name')->nullable();
            $table->text('user_input');
            $table->text('ai_response')->nullable();
            $table->string('ekspresi')->nullable();
            $table->unsignedTinyInteger('stres_level')->nullable();
            $table->timestamp('timestamp')->useCurrent();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('chat_histories');
    }
};
