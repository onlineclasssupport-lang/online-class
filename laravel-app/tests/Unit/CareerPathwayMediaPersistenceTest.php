<?php

namespace Tests\Unit;

use App\Models\CareerPathway;
use Tests\TestCase;

class CareerPathwayMediaPersistenceTest extends TestCase
{
    public function test_signed_document_url_is_not_persisted_when_content_item_id_exists(): void
    {
        $pathway = new CareerPathway();
        $pathway->curriculum_modules = [[
            'documents' => [[
                'title' => 'Architecture PDF',
                'content_item_id' => 42,
                'file_url' => 'https://example.test/api/stream/42?expires=999&signature=temporary',
            ]],
        ]];

        $modules = $pathway->curriculum_modules;

        $this->assertSame(42, $modules[0]['documents'][0]['content_item_id']);
        $this->assertArrayNotHasKey('file_url', $modules[0]['documents'][0]);
    }

    public function test_legacy_signed_document_url_is_converted_to_content_item_id(): void
    {
        $pathway = new CareerPathway();
        $pathway->curriculum_modules = [[
            'documents' => [[
                'title' => 'Legacy PDF',
                'file_url' => 'https://example.test/api/stream/77?expires=999&signature=temporary',
            ]],
        ]];

        $document = $pathway->curriculum_modules[0]['documents'][0];

        $this->assertSame(77, $document['content_item_id']);
        $this->assertArrayNotHasKey('file_url', $document);
    }

    public function test_non_stream_document_url_is_preserved(): void
    {
        $externalUrl = 'https://example.com/public-handbook.pdf';

        $pathway = new CareerPathway();
        $pathway->curriculum_modules = [[
            'documents' => [[
                'title' => 'External PDF',
                'file_url' => $externalUrl,
            ]],
        ]];

        $document = $pathway->curriculum_modules[0]['documents'][0];

        $this->assertSame($externalUrl, $document['file_url']);
        $this->assertArrayNotHasKey('content_item_id', $document);
    }
}
