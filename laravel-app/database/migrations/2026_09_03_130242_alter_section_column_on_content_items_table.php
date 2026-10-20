<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * MySQL uses a native ENUM in the initial migration, but PostgreSQL's
     * Laravel grammar represents enum columns as VARCHAR. This migration
     * intentionally removes the MySQL-only ENUM restriction on MySQL while
     * remaining a safe no-op on PostgreSQL, where the column already accepts
     * arbitrary section names.
     */
    public function up(): void
    {
        if (DB::getDriverName() === 'mysql') {
            DB::statement("ALTER TABLE content_items MODIFY section VARCHAR(50) NOT NULL");
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'mysql') {
            DB::statement("ALTER TABLE content_items MODIFY section ENUM('lecture_material', 'online_class', 'suggestion', 'proxy_support', 'registration') NOT NULL");
        }
    }
};
