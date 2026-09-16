<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Remove temporary signed stream URLs from existing career pathway
     * documents while preserving their stable ContentItem identifiers.
     *
     * This is intentionally a data migration rather than a one-off manual
     * SQL fix: deployments must repair existing rows before the new model
     * mutator starts enforcing the same invariant for future writes.
     */
    public function up(): void
    {
        DB::table('career_pathways')
            ->select(['id', 'curriculum_modules'])
            ->orderBy('id')
            ->each(function ($pathway): void {
                if ($pathway->curriculum_modules === null || $pathway->curriculum_modules === '') {
                    return;
                }

                $modules = is_string($pathway->curriculum_modules)
                    ? json_decode($pathway->curriculum_modules, true)
                    : $pathway->curriculum_modules;

                if (!is_array($modules)) {
                    return;
                }

                $changed = false;

                foreach ($modules as $moduleIndex => $module) {
                    if (!is_array($module) || empty($module['documents']) || !is_array($module['documents'])) {
                        continue;
                    }

                    foreach ($module['documents'] as $documentIndex => $document) {
                        if (!is_array($document)) {
                            continue;
                        }

                        $contentItemId = $document['content_item_id'] ?? null;
                        if (is_numeric($contentItemId) && (int) $contentItemId > 0) {
                            $contentItemId = (int) $contentItemId;
                        } else {
                            $contentItemId = null;
                        }

                        // Recover the ContentItem ID from the legacy signed URL
                        // before removing that URL from persistent storage.
                        if (!$contentItemId && !empty($document['file_url'])
                            && preg_match('#/api/stream/(\d+)#', (string) $document['file_url'], $matches)
                        ) {
                            $contentItemId = (int) $matches[1];
                        }

                        if (!$contentItemId) {
                            continue;
                        }

                        if (($document['content_item_id'] ?? null) !== $contentItemId) {
                            $document['content_item_id'] = $contentItemId;
                            $changed = true;
                        }

                        if (array_key_exists('file_url', $document)) {
                            unset($document['file_url']);
                            $changed = true;
                        }

                        $modules[$moduleIndex]['documents'][$documentIndex] = $document;
                    }
                }

                if ($changed) {
                    DB::table('career_pathways')
                        ->where('id', $pathway->id)
                        ->update([
                            'curriculum_modules' => json_encode($modules, JSON_UNESCAPED_SLASHES),
                            'updated_at' => now(),
                        ]);
                }
            });
    }

    /**
     * Do not restore expired URLs on rollback. The application can regenerate
     * current signed URLs from ContentItem IDs, so rollback must never write
     * stale security credentials back into the database.
     */
    public function down(): void
    {
        // Intentionally a no-op.
    }
};
