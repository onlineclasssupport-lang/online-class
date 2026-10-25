<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AdminSession;
use App\Models\AdminSetting;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class AdminAuthController extends Controller
{
    /**
     * POST /api/admin/login
     * Single shared password, default "1", editable from the panel.
     */
    public function login(Request $request)
    {
        $request->validate(['password' => 'required|string']);

        $setting = AdminSetting::where('key', 'admin_password')->first();

        if (! $setting || ! $this->passwordMatchesAndUpgradeIfNeeded($setting, (string) $request->password)) {
            throw ValidationException::withMessages([
                'password' => ['Incorrect admin password.'],
            ]);
        }

        $token = Str::random(64);

        AdminSession::create([
            'token' => $token,
            'expires_at' => now()->addHours(4),
        ]);

        return response()->json([
            'token' => $token,
            'expires_at' => now()->addHours(4)->toIso8601String(),
        ]);
    }

    /**
     * POST /api/admin/logout
     */
    public function logout(Request $request)
    {
        AdminSession::where('token', $request->bearerToken())->delete();

        return response()->json(['message' => 'Logged out.']);
    }

    /**
     * GET /api/admin/me
     * Lets the frontend silently verify a stored token on page load.
     */
    public function me(Request $request)
    {
        return response()->json(['authenticated' => true]);
    }

    /**
     * POST /api/admin/change-password
     * Body: current_password, new_password, new_password_confirmation
     */
    public function changePassword(Request $request)
    {
        $request->validate([
            'current_password' => 'required|string',
            'new_password' => 'required|string|min:1|confirmed',
        ]);

        $setting = AdminSetting::where('key', 'admin_password')->first();

        if (! $setting || ! $this->passwordMatchesAndUpgradeIfNeeded($setting, (string) $request->current_password)) {
            throw ValidationException::withMessages([
                'current_password' => ['Current password is incorrect.'],
            ]);
        }

        $setting->update(['value' => Hash::make($request->new_password)]);

        // Invalidate every existing session so old tokens can't linger
        // after a password change, except the one making this request.
        AdminSession::where('token', '!=', $request->bearerToken())->delete();

        return response()->json(['message' => 'Password updated successfully.']);
    }

    /**
     * Validate a stored admin password and transparently upgrade legacy plain-text
     * values to a hash. This supports manual admin_settings edits without leaving
     * a successfully used password stored in plain text.
     */
    private function passwordMatchesAndUpgradeIfNeeded(AdminSetting $setting, string $candidate): bool
    {
        $stored = (string) $setting->value;

        // PostgreSQL pgcrypto's bcrypt implementation emits $2a$ hashes.
        // password_get_info() can classify these as "unknown" on PHP builds
        // that only report $2y$, even though password_verify() supports them.
        // Verify these explicitly, then upgrade them to Laravel's standard hash.
        if (str_starts_with($stored, '$2a
    }
}
)) {
            if (! password_verify($candidate, $stored)) {
                return false;
            }

            $setting->update(['value' => Hash::make($candidate)]);

            return true;
        }

        $hashInfo = password_get_info($stored);

        // Plain-text legacy values can exist after a manual dashboard edit.
        // Compare them in constant time and immediately upgrade after success.
        if (($hashInfo['algo'] ?? null) === null) {
            if (! hash_equals($stored, $candidate)) {
                return false;
            }

            $setting->update(['value' => Hash::make($candidate)]);

            return true;
        }

        return Hash::check($candidate, $stored);
    }
}
