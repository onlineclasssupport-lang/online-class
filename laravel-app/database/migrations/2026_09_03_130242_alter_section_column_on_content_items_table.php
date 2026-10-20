<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * MySQL uses a native ENUM in the initial migration. Laravel represents
     * enums on PostgreSQL as VARCHAR plus a generated CHECK constraint. The
     * later app requirements allow new section keys, so remove that check on
     * PostgreSQL and widen the column rather than running MySQL-only MODIFY.
     */
    public function up(): void
    {
        $driver = DB::getDriverName();

        if ($driver === 'mysql') {
            DB::statement("ALTER TABLE content_items MODIFY section VARCHAR(50) NOT NULL");
            return;
        }

        if ($driver === 'pgsql') {
            DB::statement('ALTER TABLE content_items ALTER COLUMN section TYPE VARCHAR(50)');
            DB::statement('ALTER TABLE content_items DROP CONSTRAINT IF EXISTS content_items_section_check');
        }
    }

    public function down(): void
    {
        $driver = DB::getDriverName();

        if ($driver === 'mysql') {
            DB::statement("ALTER TABLE content_items MODIFY section ENUM('lecture_material', 'online_class', 'suggestion', 'proxy_support', 'registration') NOT NULL");
            return;
        }

        if ($driver === 'pgsql') {
            DB::statement("ALTER TABLE content_items ADD CONSTRAINT content_items_section_check CHECK (section IN ('lecture_material', 'online_class', 'suggestion', 'proxy_support', 'registration'))");
        }
    }
};
