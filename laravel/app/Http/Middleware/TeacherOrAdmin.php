<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class TeacherOrAdmin
{
    public function handle(Request $request, Closure $next): Response
    {
        if (!$request->user()) {
            return response()->json([
                'message' => 'Unauthenticated.'
            ], 401);
        }

        if (!in_array($request->user()->role, ['teacher', 'admin'], true)) {
            return response()->json([
                'message' => 'Forbidden. Hanya guru atau admin yang dapat mengakses resource ini.'
            ], 403);
        }

        return $next($request);
    }
}
