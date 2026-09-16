<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Browser-facing hardening headers. This is deliberately compatible with the
 * existing React, Razorpay and embedded-course-media integration; it protects
 * framing and browser capabilities without pretending to provide DRM.
 */
class SecurityHeaders
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        $response->headers->set('X-Content-Type-Options', 'nosniff');
        $response->headers->set('Referrer-Policy', 'strict-origin-when-cross-origin');
        $response->headers->set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), display-capture=(), usb=(), serial=(), bluetooth=()');

        // Signed streams and media files must be embeddable by the frontend
        // application. A production React frontend and this Laravel API are
        // intentionally different origins, so SAMEORIGIN would make Chrome
        // block the PDF/video iframe with "This page has been blocked by Chrome".
        $isStreamRoute = $request->is('api/concepts/documents/*/stream')
            || $request->is('api/concepts/videos/*/stream')
            || $request->is('api/stream/*')
            || $request->is('api/welcome-screen/stream')
            || $request->is('api/site-settings/logo');

        if ($isStreamRoute) {
            $response->headers->remove('X-Frame-Options');

            // Allow the deployed Railway frontend, configured frontend origins,
            // and local development to embed protected signed media. The signed
            // URL still controls access/expiry; this header only controls framing.
            $frameAncestors = [
                "'self'",
                'https://*.up.railway.app',
                'http://localhost:5173',
                'http://localhost:3000',
                'http://localhost:*',
                'http://127.0.0.1:*',
            ];

            $configuredOrigins = [
                (string) env('FRONTEND_URL', ''),
                (string) env('CORS_ALLOWED_ORIGINS', ''),
                (string) env('RAILWAY_SERVICE_FRONTEND_URL', ''),
            ];

            foreach ($configuredOrigins as $origins) {
                foreach (preg_split('/[,\s]+/', trim($origins)) ?: [] as $origin) {
                    $origin = rtrim(trim($origin), '/');
                    if ($origin !== '' && preg_match('#^https?://#i', $origin)) {
                        $frameAncestors[] = $origin;
                    }
                }
            }

            $frameAncestors = array_values(array_unique($frameAncestors));
            $response->headers->set(
                'Content-Security-Policy',
                "base-uri 'self'; object-src 'none'; frame-ancestors " . implode(' ', $frameAncestors)
            );
            $response->headers->set('Cache-Control', 'private, no-store, max-age=0');
            $response->headers->set('Pragma', 'no-cache');
        } else {
            $response->headers->set('X-Frame-Options', 'SAMEORIGIN');
            $response->headers->set('Content-Security-Policy', "base-uri 'self'; object-src 'none'; frame-ancestors 'self'");
        }

        return $response;
    }
}
