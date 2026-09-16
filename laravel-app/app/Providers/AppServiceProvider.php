<?php

namespace App\Providers;

use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Facades\URL;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        //
    }

    public function boot(): void
    {
        // Railway terminates TLS at the proxy. Protected signed URLs must be
        // generated from the public HTTPS backend domain, not the internal
        // HTTP request scheme.
        //
        // Gated on RAILWAY_PUBLIC_DOMAIN being present -- Railway only sets
        // this once a public domain exists for the service -- rather than on
        // APP_ENV. That variable only affects debug output and doesn't need
        // to be exactly "production" for this fix to matter, so keying off
        // it meant a typo'd or missing APP_ENV could silently break signed
        // video/PDF streaming links with no obvious error message.
        $publicDomain = trim((string) env('RAILWAY_PUBLIC_DOMAIN', ''));
        if ($publicDomain !== '') {
            $publicDomain = preg_replace('#^https?://#i', '', $publicDomain);
            URL::forceRootUrl('https://' . rtrim($publicDomain, '/'));
            URL::forceScheme('https');
        }
    }
}
