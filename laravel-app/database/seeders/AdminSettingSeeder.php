<?php

namespace Database\Seeders;

use App\Models\AdminSetting;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class AdminSettingSeeder extends Seeder
{
    /**
     * Default admin panel password is "1", exactly as requested.
     * It is stored hashed and can be changed later from inside the
     * admin panel itself (Admin Panel -> Settings -> Change Password).
     *
     * Uses firstOrCreate (insert-only), not updateOrCreate, so running this
     * seeder again later -- on purpose or by habit -- never resets a
     * password that's already been changed. On Railway this row is also
     * seeded automatically by the
     * `2026_09_04_020000_seed_default_admin_password` migration; this
     * seeder is kept for local/manual use (e.g. resetting a dev database).
     */
    public function run(): void
    {
        AdminSetting::firstOrCreate(
            ['key' => 'admin_password'],
            ['value' => Hash::make('1')]
        );
    }
}
