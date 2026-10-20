<?php

namespace Database\Seeders;

use App\Models\AdminSetting;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class AdminSettingSeeder extends Seeder
{
    /**
     * Initialize the admin password only when an explicit deployment secret
     * has been configured. Never create a known/default production password.
     */
    public function run(): void
    {
        $password = (string) env('DEFAULT_ADMIN_PASSWORD', '');

        if ($password === '') {
            $this->command?->warn(
                'Admin password was not seeded. Set DEFAULT_ADMIN_PASSWORD securely and rerun the seeder.'
            );
            return;
        }

        AdminSetting::firstOrCreate(
            ['key' => 'admin_password'],
            ['value' => Hash::make($password)]
        );
    }
}
