<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

return new class extends Migration
{
    /**
     * Create the admin password setting once, without overwriting a password
     * that an administrator may have changed later.
     *
     * Set DEFAULT_ADMIN_PASSWORD in the deployment environment for the first
     * deployment. The password is never committed to source control.
     */
    public function up(): void
    {
        $exists = DB::table('admin_settings')
            ->where('key', 'admin_password')
            ->exists();

        if ($exists) {
            return;
        }

        $password = (string) env('DEFAULT_ADMIN_PASSWORD', '');

        if ($password === '') {
            return;
        }

        DB::table('admin_settings')->insert([
            'key' => 'admin_password',
            'value' => Hash::make($password),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    public function down(): void
    {
        // Intentionally a no-op. Rolling back a deployment must not remove
        // the administrator's password or lock the admin panel.
    }
};
