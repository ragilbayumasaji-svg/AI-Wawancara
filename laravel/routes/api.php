<?php

use App\Http\Controllers\Api\InterviewApiController;
use Illuminate\Support\Facades\Route;

Route::post('/ai-chat', [InterviewApiController::class, 'chat']);
Route::get('/history', [InterviewApiController::class, 'history']);
Route::post('/tts', [InterviewApiController::class, 'tts']);
Route::post('/interview/finish', [InterviewApiController::class, 'finish']);
