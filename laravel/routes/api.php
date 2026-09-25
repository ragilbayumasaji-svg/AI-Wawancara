<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\InterviewApiController;
use App\Http\Controllers\Api\TeacherDashboardController;
use Illuminate\Support\Facades\Route;

Route::post('/ai-chat', [InterviewApiController::class, 'chat']);
Route::get('/history', [InterviewApiController::class, 'history']);
Route::post('/tts', [InterviewApiController::class, 'tts']);
Route::post('/interview/start', [InterviewApiController::class, 'start']);
Route::post('/interview/finish', [InterviewApiController::class, 'finish']);

Route::middleware('web')->group(function () {
    Route::post('/auth/login', [AuthController::class, 'login']);
    Route::get('/auth/me', [AuthController::class, 'me']);
    Route::post('/auth/logout', [AuthController::class, 'logout']);

    Route::middleware('teacher.admin')->group(function () {
        Route::get('/teacher/dashboard', [TeacherDashboardController::class, 'index']);
        Route::get('/teacher/interviews', [TeacherDashboardController::class, 'interviews']);
        Route::get('/teacher/interviews/{id}', [TeacherDashboardController::class, 'show']);
    });
});
