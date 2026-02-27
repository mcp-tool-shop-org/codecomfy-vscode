/**
 * Tests for ComfyServerEngine — constructor and workflow building.
 *
 * The buildWorkflow method is private but contains pure, deterministic logic
 * that is critical to get right (prompt injection, seed assignment, video
 * frame count). We access it via `(engine as any)` to keep it well-covered.
 */

import * as assert from 'node:assert/strict';
import { ComfyServerEngine } from '../../src/engines/comfyServerEngine';
import type { Preset, JobRequest } from '../../src/types';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makePreset(workflow: Record<string, unknown> | undefined): Preset {
    return {
        id: 'test-preset',
        name: 'Test Preset',
        kind: 'image',
        defaults: { width: 512, height: 512, steps: 20, cfg_scale: 7 },
        workflow,
    };
}

function makeRequest(overrides: Partial<JobRequest> = {}): JobRequest {
    return {
        kind: 'image',
        preset_id: 'test-preset',
        inputs: { prompt: 'a beautiful sunset' },
        run_id: 'run_abc123',
        workspace_path: '/tmp/ws',
        created_at: new Date().toISOString(),
        ...overrides,
    };
}

function buildWorkflow(
    engine: ComfyServerEngine,
    preset: Preset,
    request: JobRequest,
): Record<string, unknown> | null {
    return (engine as any).buildWorkflow(preset, request);
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('ComfyServerEngine', () => {

    describe('constructor', () => {
        it('strips trailing slash from URL', () => {
            const engine = new ComfyServerEngine('http://localhost:8188/');
            assert.strictEqual((engine as any).serverUrl, 'http://localhost:8188');
        });

        it('keeps URL without trailing slash unchanged', () => {
            const engine = new ComfyServerEngine('http://localhost:8188');
            assert.strictEqual((engine as any).serverUrl, 'http://localhost:8188');
        });

        it('defaults URL when none provided', () => {
            const engine = new ComfyServerEngine();
            assert.strictEqual((engine as any).serverUrl, 'http://127.0.0.1:8188');
        });

        it('starts with no current prompt', () => {
            const engine = new ComfyServerEngine();
            assert.strictEqual((engine as any).currentPromptId, null);
        });
    });

    describe('buildWorkflow', () => {
        it('returns null when preset has no workflow', () => {
            const engine = new ComfyServerEngine();
            const result = buildWorkflow(engine, makePreset(undefined), makeRequest());
            assert.strictEqual(result, null);
        });

        it('deep-clones the workflow (does not mutate original)', () => {
            const workflow = {
                '1': { class_type: 'CLIPTextEncode', inputs: { text: 'original' }, _meta: { title: 'Positive' } },
            };
            const preset = makePreset(workflow);
            const engine = new ComfyServerEngine();

            buildWorkflow(engine, preset, makeRequest());

            // Original workflow should still have the original text
            assert.strictEqual(
                (workflow['1'].inputs as Record<string, unknown>).text,
                'original',
            );
        });

        it('wraps the workflow in a { prompt: ... } envelope', () => {
            const workflow = { '1': { class_type: 'SomeNode', inputs: {} } };
            const engine = new ComfyServerEngine();
            const result = buildWorkflow(engine, makePreset(workflow), makeRequest());

            assert.ok(result);
            assert.ok('prompt' in result);
        });

        // ── CLIP Text Encode ────────────────────────────────────────────────

        it('injects prompt into positive CLIPTextEncode node', () => {
            const workflow = {
                '3': {
                    class_type: 'CLIPTextEncode',
                    inputs: { text: 'placeholder' },
                    _meta: { title: 'Positive Prompt' },
                },
            };
            const engine = new ComfyServerEngine();
            const result = buildWorkflow(engine, makePreset(workflow), makeRequest({
                inputs: { prompt: 'hello world' },
            }));

            const inner = (result as any).prompt;
            assert.strictEqual(inner['3'].inputs.text, 'hello world');
        });

        it('injects negative prompt into negative CLIPTextEncode node by title', () => {
            const workflow = {
                '4': {
                    class_type: 'CLIPTextEncode',
                    inputs: { text: '' },
                    _meta: { title: 'Negative Prompt' },
                },
            };
            const engine = new ComfyServerEngine();
            const result = buildWorkflow(engine, makePreset(workflow), makeRequest({
                inputs: { prompt: 'cat', negative_prompt: 'blurry' },
            }));

            const inner = (result as any).prompt;
            assert.strictEqual(inner['4'].inputs.text, 'blurry');
        });

        it('injects negative prompt into node whose ID contains "neg"', () => {
            const workflow = {
                'neg_clip': {
                    class_type: 'CLIPTextEncode',
                    inputs: { text: '' },
                    _meta: {},
                },
            };
            const engine = new ComfyServerEngine();
            const result = buildWorkflow(engine, makePreset(workflow), makeRequest({
                inputs: { prompt: 'cat', negative_prompt: 'ugly' },
            }));

            const inner = (result as any).prompt;
            assert.strictEqual(inner['neg_clip'].inputs.text, 'ugly');
        });

        it('sets empty string when negative_prompt is undefined', () => {
            const workflow = {
                '4': {
                    class_type: 'CLIPTextEncode',
                    inputs: { text: 'old' },
                    _meta: { title: 'Negative' },
                },
            };
            const engine = new ComfyServerEngine();
            const result = buildWorkflow(engine, makePreset(workflow), makeRequest({
                inputs: { prompt: 'test' },
            }));

            const inner = (result as any).prompt;
            assert.strictEqual(inner['4'].inputs.text, '');
        });

        // ── KSampler ────────────────────────────────────────────────────────

        it('injects seed into KSampler node', () => {
            const workflow = {
                '5': { class_type: 'KSampler', inputs: { seed: 0, steps: 10, cfg: 5 } },
            };
            const engine = new ComfyServerEngine();
            const result = buildWorkflow(engine, makePreset(workflow), makeRequest({
                inputs: { prompt: 'x', seed: 42 },
            }));

            const inner = (result as any).prompt;
            assert.strictEqual(inner['5'].inputs.seed, 42);
        });

        it('injects steps into KSampler node', () => {
            const workflow = {
                '5': { class_type: 'KSampler', inputs: { seed: 0, steps: 10, cfg: 5 } },
            };
            const engine = new ComfyServerEngine();
            const result = buildWorkflow(engine, makePreset(workflow), makeRequest({
                inputs: { prompt: 'x', steps: 30 },
            }));

            const inner = (result as any).prompt;
            assert.strictEqual(inner['5'].inputs.steps, 30);
        });

        it('injects cfg_scale as cfg into KSampler node', () => {
            const workflow = {
                '5': { class_type: 'KSampler', inputs: { seed: 0, steps: 10, cfg: 5 } },
            };
            const engine = new ComfyServerEngine();
            const result = buildWorkflow(engine, makePreset(workflow), makeRequest({
                inputs: { prompt: 'x', cfg_scale: 12 },
            }));

            const inner = (result as any).prompt;
            assert.strictEqual(inner['5'].inputs.cfg, 12);
        });

        it('leaves KSampler fields unchanged when inputs are undefined', () => {
            const workflow = {
                '5': { class_type: 'KSampler', inputs: { seed: 999, steps: 50, cfg: 7 } },
            };
            const engine = new ComfyServerEngine();
            const result = buildWorkflow(engine, makePreset(workflow), makeRequest({
                inputs: { prompt: 'x' },
            }));

            const inner = (result as any).prompt;
            assert.strictEqual(inner['5'].inputs.seed, 999);
            assert.strictEqual(inner['5'].inputs.steps, 50);
            assert.strictEqual(inner['5'].inputs.cfg, 7);
        });

        // ── EmptyLatentImage ────────────────────────────────────────────────

        it('injects width and height into EmptyLatentImage', () => {
            const workflow = {
                '6': { class_type: 'EmptyLatentImage', inputs: { width: 64, height: 64, batch_size: 1 } },
            };
            const engine = new ComfyServerEngine();
            const result = buildWorkflow(engine, makePreset(workflow), makeRequest({
                inputs: { prompt: 'x', width: 1024, height: 768 },
            }));

            const inner = (result as any).prompt;
            assert.strictEqual(inner['6'].inputs.width, 1024);
            assert.strictEqual(inner['6'].inputs.height, 768);
        });

        it('injects frame_count as batch_size for video kind', () => {
            const workflow = {
                '6': { class_type: 'EmptyLatentImage', inputs: { width: 512, height: 512, batch_size: 1 } },
            };
            const engine = new ComfyServerEngine();
            const result = buildWorkflow(engine, makePreset(workflow), makeRequest({
                kind: 'video',
                inputs: { prompt: 'x', frame_count: 96 },
            }));

            const inner = (result as any).prompt;
            assert.strictEqual(inner['6'].inputs.batch_size, 96);
        });

        it('does not set batch_size for image kind even if frame_count present', () => {
            const workflow = {
                '6': { class_type: 'EmptyLatentImage', inputs: { width: 512, height: 512, batch_size: 1 } },
            };
            const engine = new ComfyServerEngine();
            const result = buildWorkflow(engine, makePreset(workflow), makeRequest({
                kind: 'image',
                inputs: { prompt: 'x', frame_count: 96 },
            }));

            const inner = (result as any).prompt;
            assert.strictEqual(inner['6'].inputs.batch_size, 1);
        });

        // ── Mixed workflow ──────────────────────────────────────────────────

        it('handles a complete workflow with multiple node types', () => {
            const workflow = {
                '1': { class_type: 'CLIPTextEncode', inputs: { text: '' }, _meta: { title: 'Positive' } },
                '2': { class_type: 'CLIPTextEncode', inputs: { text: '' }, _meta: { title: 'Negative' } },
                '3': { class_type: 'KSampler', inputs: { seed: 0, steps: 20, cfg: 7 } },
                '4': { class_type: 'EmptyLatentImage', inputs: { width: 512, height: 512, batch_size: 1 } },
                '5': { class_type: 'VAEDecode', inputs: { samples: ['3', 0] } },
            };
            const engine = new ComfyServerEngine();
            const result = buildWorkflow(engine, makePreset(workflow), makeRequest({
                inputs: {
                    prompt: 'mountain sunset',
                    negative_prompt: 'blurry',
                    seed: 12345,
                    steps: 30,
                    cfg_scale: 8,
                    width: 1024,
                    height: 768,
                },
            }));

            const inner = (result as any).prompt;
            assert.strictEqual(inner['1'].inputs.text, 'mountain sunset');
            assert.strictEqual(inner['2'].inputs.text, 'blurry');
            assert.strictEqual(inner['3'].inputs.seed, 12345);
            assert.strictEqual(inner['3'].inputs.steps, 30);
            assert.strictEqual(inner['3'].inputs.cfg, 8);
            assert.strictEqual(inner['4'].inputs.width, 1024);
            assert.strictEqual(inner['4'].inputs.height, 768);
            // VAEDecode should be untouched
            assert.deepStrictEqual(inner['5'].inputs.samples, ['3', 0]);
        });

        it('skips nodes without inputs', () => {
            const workflow = {
                '1': { class_type: 'LoadCheckpoint' },  // no inputs key
            };
            const engine = new ComfyServerEngine();
            const result = buildWorkflow(engine, makePreset(workflow), makeRequest());
            assert.ok(result); // no crash
        });
    });

    describe('cancel', () => {
        it('sets canceled flag', async () => {
            const engine = new ComfyServerEngine();
            await engine.cancel();
            assert.strictEqual((engine as any).canceled, true);
        });
    });
});
