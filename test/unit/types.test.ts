/**
 * Tests for type contracts and constants.
 *
 * Ensures exported constants from types/index have the expected values,
 * guarding against accidental changes that would break on-disk schema.
 */

import * as assert from 'node:assert/strict';
import {
    INDEX_SCHEMA_VERSION,
    CODECOMFY_DIR,
    OUTPUTS_DIR,
    RUNS_DIR,
    INDEX_FILENAME,
} from '../../src/types';
import type {
    OutputIndex,
    IndexedArtifact,
    ArtifactMeta,
    ArtifactProvenance,
    JobRequest,
    JobRequestInput,
    JobRun,
    Preset,
    GenerationResult,
    IGenerationEngine,
    CodeComfyConfig,
    Artifact,
} from '../../src/types';

describe('Type contracts and constants', () => {

    describe('constants', () => {
        it('INDEX_SCHEMA_VERSION is "1.0"', () => {
            assert.strictEqual(INDEX_SCHEMA_VERSION, '1.0');
        });

        it('CODECOMFY_DIR is ".codecomfy"', () => {
            assert.strictEqual(CODECOMFY_DIR, '.codecomfy');
        });

        it('OUTPUTS_DIR is "outputs"', () => {
            assert.strictEqual(OUTPUTS_DIR, 'outputs');
        });

        it('RUNS_DIR is "runs"', () => {
            assert.strictEqual(RUNS_DIR, 'runs');
        });

        it('INDEX_FILENAME is "index.json"', () => {
            assert.strictEqual(INDEX_FILENAME, 'index.json');
        });
    });

    describe('OutputIndex shape', () => {
        it('can be constructed with required fields', () => {
            const index: OutputIndex = {
                schema_version: '1.0',
                workspace_key: 'abc123',
                items: [],
            };
            assert.strictEqual(index.schema_version, '1.0');
            assert.strictEqual(index.items.length, 0);
        });
    });

    describe('IndexedArtifact shape', () => {
        it('holds image artifact with required fields', () => {
            const artifact: IndexedArtifact = {
                id: 'run1_0',
                type: 'image',
                path: '.codecomfy/outputs/image.png',
                created_at: '2025-01-01T00:00:00Z',
                run_id: 'run1',
            };
            assert.strictEqual(artifact.type, 'image');
            assert.strictEqual(artifact.meta, undefined);
            assert.strictEqual(artifact.provenance, undefined);
        });

        it('holds video artifact with optional meta', () => {
            const artifact: IndexedArtifact = {
                id: 'run2_0',
                type: 'video',
                path: '.codecomfy/outputs/video.mp4',
                created_at: '2025-01-01T00:00:00Z',
                run_id: 'run2',
                meta: {
                    duration_seconds: 4,
                    fps: 24,
                    mime_type: 'video/mp4',
                },
            };
            assert.strictEqual(artifact.type, 'video');
            assert.strictEqual(artifact.meta?.fps, 24);
        });
    });

    describe('JobRequest shape', () => {
        it('extends JobRequestInput with run_id, workspace_path, created_at', () => {
            const req: JobRequest = {
                kind: 'image',
                preset_id: 'hq-image',
                inputs: { prompt: 'a cat' },
                run_id: 'abc_123',
                workspace_path: '/ws',
                created_at: '2025-01-01T00:00:00Z',
            };
            assert.strictEqual(req.kind, 'image');
            assert.ok(req.run_id);
            assert.ok(req.workspace_path);
        });
    });

    describe('JobRun shape', () => {
        it('holds status lifecycle fields', () => {
            const run: JobRun = {
                run_id: 'r1',
                status: 'queued',
            };
            assert.strictEqual(run.status, 'queued');
            assert.strictEqual(run.started_at, undefined);
            assert.strictEqual(run.ended_at, undefined);
        });

        it('accepts all status variants', () => {
            const statuses = ['queued', 'running', 'succeeded', 'failed', 'canceled'] as const;
            for (const status of statuses) {
                const run: JobRun = { run_id: 'r', status };
                assert.strictEqual(run.status, status);
            }
        });
    });

    describe('Preset shape', () => {
        it('holds optional workflow template', () => {
            const preset: Preset = {
                id: 'hq-image',
                name: 'HQ Image',
                kind: 'image',
                defaults: { width: 1024, height: 1024 },
            };
            assert.strictEqual(preset.workflow, undefined);
        });

        it('holds workflow when present', () => {
            const preset: Preset = {
                id: 'hq-video',
                name: 'HQ Video',
                kind: 'video',
                defaults: { fps: 24 },
                workflow: { '1': { class_type: 'KSampler', inputs: {} } },
            };
            assert.ok(preset.workflow);
        });
    });

    describe('Artifact shape', () => {
        it('holds image artifact', () => {
            const art: Artifact = {
                type: 'image',
                path: '.codecomfy/outputs/img.png',
            };
            assert.strictEqual(art.type, 'image');
            assert.strictEqual(art.size_bytes, undefined);
        });

        it('holds video artifact with meta', () => {
            const art: Artifact = {
                type: 'video',
                path: '.codecomfy/outputs/vid.mp4',
                size_bytes: 1024000,
                meta: { duration_seconds: 4, fps: 24, mime_type: 'video/mp4' },
            };
            assert.strictEqual(art.size_bytes, 1024000);
            assert.strictEqual(art.meta?.fps, 24);
        });
    });

    describe('IGenerationEngine interface', () => {
        it('can be implemented minimally', () => {
            const engine: IGenerationEngine = {
                id: 'test',
                name: 'Test Engine',
                isAvailable: async () => false,
                generate: async () => ({ success: false, artifacts: [], error: 'not implemented' }),
                cancel: async () => {},
            };
            assert.strictEqual(engine.id, 'test');
        });
    });
});
