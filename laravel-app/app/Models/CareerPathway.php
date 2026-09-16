<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;

class CareerPathway extends Model
{
    use HasFactory;

    protected $fillable = [
        'slug', 'title', 'badge', 'color', 'icon', 'description', 'skills',
        'duration', 'level', 'price', 'curriculum_modules', 'sort_order',
        'is_active', 'is_locked',
    ];

    protected $casts = [
        'skills' => 'array',
        'curriculum_modules' => 'array',
        'is_active' => 'boolean',
        'is_locked' => 'boolean',
        'price' => 'integer',
        'sort_order' => 'integer',
    ];

    /**
     * Managed curriculum uploads persist only the stable ContentItem ID.
     * Temporary signed URLs are generated only when a pathway is read.
     */
    public function setCurriculumModulesAttribute($value): void
    {
        if (is_string($value)) {
            $decoded = json_decode($value, true);
            if (json_last_error() === JSON_ERROR_NONE) {
                $value = $decoded;
            }
        }

        if (is_array($value)) {
            $value = $this->normalizeCurriculumModules($value);
        }

        $this->attributes['curriculum_modules'] = $value === null
            ? null
            : json_encode($value, JSON_UNESCAPED_SLASHES);
    }

    /**
     * Read-side hydration. Generated URLs are response-only and are never
     * written back to curriculum_modules or the database.
     */
    public function getCurriculumModulesAttribute($value): array
    {
        if (is_string($value)) {
            $decoded = json_decode($value, true);
            $value = json_last_error() === JSON_ERROR_NONE ? $decoded : [];
        }

        if (!is_array($value) || !$this->exists) {
            return is_array($value) ? $value : [];
        }

        return $this->hydrateCurriculumModulesForRead($value);
    }

    private function hydrateCurriculumModulesForRead(array $modules): array
    {
        foreach ($modules as $moduleIndex => $module) {
            if (!is_array($module)) {
                continue;
            }

            foreach (['documents', 'videos'] as $collection) {
                if (empty($module[$collection]) || !is_array($module[$collection])) {
                    continue;
                }

                foreach ($module[$collection] as $itemIndex => $media) {
                    if (!is_array($media)) {
                        continue;
                    }

                    $contentItemId = $this->normalizeContentItemId($media['content_item_id'] ?? null);
                    $fileUrl = (string) ($media['file_url'] ?? '');

                    if (!$contentItemId && $fileUrl !== '' && preg_match('#/api/stream/(\d+)#', $fileUrl, $matches)) {
                        $contentItemId = (int) $matches[1];
                    }

                    $contentItem = $contentItemId ? ContentItem::find($contentItemId) : null;

                    // Recover a stale/missing reference from the uploaded item
                    // title without changing the persisted pathway JSON.
                    if ((!$contentItem || !$contentItem->file_path) && !empty($media['title'])) {
                        $replacementId = ContentItem::query()
                            ->where('section', 'lecture_material')
                            ->where('title', (string) $media['title'])
                            ->whereNotNull('file_path')
                            ->latest('id')
                            ->value('id');

                        if ($replacementId) {
                            $contentItemId = (int) $replacementId;
                            $contentItem = ContentItem::find($contentItemId);
                        }
                    }

                    if (!$contentItem || !$contentItem->file_path) {
                        continue;
                    }

                    $media['content_item_id'] = $contentItem->id;
                    $media['file_url'] = URL::temporarySignedRoute(
                        'stream.item',
                        now()->addMinutes(30),
                        ['item' => $contentItem->id]
                    );

                    if (!empty($contentItem->file_name)) {
                        $media['file_name'] = $contentItem->file_name;
                    }

                    if ($collection === 'documents') {
                        $ext = strtoupper(pathinfo(
                            $contentItem->file_name ?: $contentItem->file_path,
                            PATHINFO_EXTENSION
                        ));
                        if ($ext !== '') {
                            $media['file_type'] = $ext;
                        }
                    }

                    if (empty($media['formatted_size'])) {
                        foreach (['local', 'public'] as $diskName) {
                            try {
                                $disk = Storage::disk($diskName);
                                if ($disk->exists($contentItem->file_path)) {
                                    $bytes = $disk->size($contentItem->file_path);
                                    $media['formatted_size'] = $bytes >= 1048576
                                        ? number_format($bytes / 1048576, 1) . ' MB'
                                        : number_format($bytes / 1024, 1) . ' KB';
                                    break;
                                }
                            } catch (\Throwable $e) {
                                // Try the next configured disk.
                            }
                        }
                    }

                    $modules[$moduleIndex][$collection][$itemIndex] = $media;
                }
            }
        }

        return $modules;
    }

    private function normalizeContentItemId($value): ?int
    {
        return is_numeric($value) && (int) $value > 0 ? (int) $value : null;
    }

    /**
     * Write-side invariant: never persist a temporary signed URL for managed
     * documents. Legacy /api/stream/{id} URLs are converted back to IDs.
     */
    private function normalizeCurriculumModules(array $modules): array
    {
        foreach ($modules as $moduleIndex => $module) {
            if (!is_array($module) || empty($module['documents']) || !is_array($module['documents'])) {
                continue;
            }

            foreach ($module['documents'] as $documentIndex => $document) {
                if (!is_array($document)) {
                    continue;
                }

                $contentItemId = $this->normalizeContentItemId($document['content_item_id'] ?? null);
                if (!$contentItemId && !empty($document['file_url']) && preg_match('#/api/stream/(\d+)#', (string) $document['file_url'], $matches)) {
                    $contentItemId = (int) $matches[1];
                }

                $fileUrl = (string) ($document['file_url'] ?? '');
                $isLegacyPlaceholder = str_contains($fileUrl, 'raw.githubusercontent.com/mozilla/pdf.js/') && str_contains($fileUrl, 'compressed.tracemonkey-pldi-09.pdf');

                if (!$contentItemId && $isLegacyPlaceholder && !empty($document['title'])) {
                    $contentItemId = ContentItem::query()
                        ->where('section', 'lecture_material')
                        ->where('title', (string) $document['title'])
                        ->whereNotNull('file_path')
                        ->latest('id')
                        ->value('id');
                }

                if ($contentItemId) {
                    $document['content_item_id'] = $contentItemId;
                    unset($document['file_url']);
                }

                $modules[$moduleIndex]['documents'][$documentIndex] = $document;
            }
        }

        return $modules;
    }

    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }
}
