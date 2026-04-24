/**
 * Tests for ComfyServerEngine — constructor, workflow building, HTTP calls,
 * polling, and output collection.
 *
 * `buildWorkflow` / prompt-injection contract is pure, deterministic logic and
 * accessed via `(engine as any)`.
 *
 * `isAvailable`, `submitPrompt`, `pollForCompletion`, `collectImages`, and
 * `collectFrames` all hit the network or filesystem. The fetch global is
 * replaced with a per-test stub via `stubFetch()`; `downloadToFile` is
 * overridden on the instance so the image-collection tests assert the
 * orchestration contract (sanitisation, per-node iteration, artifact shape)
 * rather than re-testing the stream plumbing.
 */

import * as assert from 'node:assert/strict';
import { ComfyServerEngine } from '../../src/engines/comfyServerEngine';
import type { Preset, JobRequest } from '../../src/types';
import { ComfyResponseError } from '../../src/engines/comfyValidation';
import { JobRouter } from '../../src/router/jobRouter';
import { Logger } from '../../src/logging/logger';
import { stubFetch, makeTempDir, registerCleanup, cleanupTempPaths } from '../helpers';

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

        // ── Adversarial prompt injection (F-863253-023) ─────────────────
        //
        // The prompt flows into `inputs.text` on a CLIPTextEncode node.
        // Because workflow building stores the prompt as a plain string
        // (not JSON-serialised into a template), injection characters
        // should be kept as literals — they cannot spawn new nodes or
        // rewrite adjacent fields.
        //
        // These tests ASSERT that contract so any future refactor that
        // accidentally introduces string templating (e.g. switching to
        // manual JSON build) would fail here.

        describe('prompt injection — adversarial inputs stay literal', () => {
            function run(prompt: string, negative?: string) {
                const workflow = {
                    '1': {
                        class_type: 'CLIPTextEncode',
                        inputs: { text: 'placeholder' },
                        _meta: { title: 'Positive Prompt' },
                    },
                    '2': {
                        class_type: 'CLIPTextEncode',
                        inputs: { text: 'placeholder' },
                        _meta: { title: 'Negative Prompt' },
                    },
                };
                const engine = new ComfyServerEngine();
                const result = buildWorkflow(engine, makePreset(workflow), makeRequest({
                    inputs: { prompt, negative_prompt: negative },
                }));
                const inner = (result as any).prompt;
                // Envelope sanity: exactly the two nodes we supplied, no extras.
                assert.deepStrictEqual(
                    Object.keys(inner).sort(),
                    ['1', '2'],
                    `workflow should contain exactly nodes 1 and 2 — got: ${Object.keys(inner)}`,
                );
                return inner;
            }

            it('treats embedded double-quotes as literal text', () => {
                const payload = 'a cat "and also" another cat';
                const inner = run(payload);
                assert.strictEqual(inner['1'].inputs.text, payload);
            });

            it('treats embedded newlines as literal text', () => {
                const payload = 'line one\nline two\r\nline three';
                const inner = run(payload);
                assert.strictEqual(inner['1'].inputs.text, payload);
            });

            it('treats a fake JSON-break payload as literal text (no new nodes spawned)', () => {
                const payload = '"}, "new_node": {"class_type": "EvilNode", "inputs": {';
                const inner = run(payload);
                assert.strictEqual(inner['1'].inputs.text, payload);
                // Crucially: no 'new_node' key appears.
                assert.ok(
                    !('new_node' in inner),
                    `injection must not introduce a new top-level node; got keys: ${Object.keys(inner)}`,
                );
            });

            it('treats ComfyUI-node-reference syntax as literal text', () => {
                // `${N}:0` is the ComfyUI wire-reference syntax used inside
                // input objects. A prompt containing it MUST NOT be dereferenced
                // — it should land in `inputs.text` verbatim.
                const payload = 'cinematic lighting ${1}:0 and "inputs": {"text": "hack"}';
                const inner = run(payload);
                assert.strictEqual(inner['1'].inputs.text, payload);
            });

            it('treats backslash + control chars as literal text', () => {
                const payload = 'tab\there\\npath C:\\Windows\\System32';
                const inner = run(payload);
                assert.strictEqual(inner['1'].inputs.text, payload);
            });

            it('routes injection payload in negative_prompt only to the negative node', () => {
                const negPayload = 'blurry"}, "evil": {"class_type":"X"';
                const inner = run('a cat', negPayload);
                assert.strictEqual(inner['1'].inputs.text, 'a cat');
                assert.strictEqual(inner['2'].inputs.text, negPayload);
                // Positive node must not leak the negative payload.
                assert.ok(
                    !String(inner['1'].inputs.text).includes('evil'),
                    'positive prompt must not contain negative payload',
                );
            });
        });
    });

    describe('cancel', () => {
        it('sets canceled flag', async () => {
            const engine = new ComfyServerEngine();
            await engine.cancel();
            assert.strictEqual((engine as any).canceled, true);
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // HTTP and filesystem surface (F-507217-002)
    //
    // These tests stub `globalThis.fetch` and patch `sleep` / `downloadToFile`
    // on the instance under test so the entire behavioural contract of the
    // previously-uncovered public methods runs in-process without real I/O.
    // ────────────────────────────────────────────────────────────────────────

    /**
     * Make a Response-shaped object the engine code is willing to consume.
     * The engine checks `.ok`, `.status`, `.text()`, `.json()`, `.body`.
     */
    function fakeResponse(init: {
        ok?: boolean;
        status?: number;
        json?: () => Promise<unknown>;
        jsonValue?: unknown;
        text?: string;
        body?: unknown;
    }): any {
        const ok = init.ok ?? ((init.status ?? 200) >= 200 && (init.status ?? 200) < 300);
        return {
            ok,
            status: init.status ?? (ok ? 200 : 500),
            text: async () => init.text ?? '',
            json: init.json ?? (async () => {
                if ('jsonValue' in init) return init.jsonValue;
                throw new SyntaxError('Unexpected end of JSON input');
            }),
            body: init.body,
        };
    }

    // `stubFetch` has been promoted to `test/helpers.ts` — imported above.

    // ── isAvailable ─────────────────────────────────────────────────────────

    describe('isAvailable', () => {
        it('returns true when the server responds 200 on /system_stats', async () => {
            const fetchStub = stubFetch(async () =>
                fakeResponse({ ok: true, status: 200, jsonValue: {} }),
            );
            try {
                const engine = new ComfyServerEngine('http://host:8188');
                const available = await engine.isAvailable();
                assert.strictEqual(available, true);
                assert.strictEqual(fetchStub.calls.length, 1);
                assert.ok(
                    fetchStub.calls[0].url.endsWith('/system_stats'),
                    `expected /system_stats hit, got ${fetchStub.calls[0].url}`,
                );
            } finally {
                fetchStub.restore();
            }
        });

        it('returns false when fetch throws (network error)', async () => {
            const fetchStub = stubFetch(async () => {
                throw new Error('ECONNREFUSED');
            });
            try {
                const engine = new ComfyServerEngine();
                const available = await engine.isAvailable();
                assert.strictEqual(available, false);
            } finally {
                fetchStub.restore();
            }
        });

        it('returns false on non-200 status', async () => {
            const fetchStub = stubFetch(async () =>
                fakeResponse({ ok: false, status: 503 }),
            );
            try {
                const engine = new ComfyServerEngine();
                const available = await engine.isAvailable();
                assert.strictEqual(available, false);
            } finally {
                fetchStub.restore();
            }
        });

        it('returns false when fetch rejects with AbortError (timeout)', async () => {
            const fetchStub = stubFetch(async () => {
                const err = new Error('The operation was aborted');
                (err as any).name = 'AbortError';
                throw err;
            });
            try {
                const engine = new ComfyServerEngine();
                const available = await engine.isAvailable();
                assert.strictEqual(available, false);
            } finally {
                fetchStub.restore();
            }
        });
    });

    // ── submitPrompt (private) ──────────────────────────────────────────────

    describe('submitPrompt', () => {
        async function callSubmit(engine: ComfyServerEngine, workflow: Record<string, unknown>): Promise<any> {
            return (engine as any).submitPrompt(workflow);
        }

        it('returns the validated prompt_id on success', async () => {
            const fetchStub = stubFetch(async () =>
                fakeResponse({
                    ok: true,
                    status: 200,
                    jsonValue: { prompt_id: 'pid-1', number: 1, node_errors: {} },
                }),
            );
            try {
                const engine = new ComfyServerEngine();
                const result = await callSubmit(engine, { prompt: {} });
                assert.ok(result);
                assert.strictEqual(result.prompt_id, 'pid-1');
                // Envelope: POST with JSON Content-Type
                const init = fetchStub.calls[0].init as RequestInit | undefined;
                assert.strictEqual(init?.method, 'POST');
                assert.ok(
                    fetchStub.calls[0].url.endsWith('/prompt'),
                    `expected /prompt endpoint, got ${fetchStub.calls[0].url}`,
                );
            } finally {
                fetchStub.restore();
            }
        });

        it('throws a wrapped server error on non-OK status (includes HTTP code)', async () => {
            const fetchStub = stubFetch(async () =>
                fakeResponse({ ok: false, status: 500, text: 'internal boom' }),
            );
            try {
                const engine = new ComfyServerEngine();
                await assert.rejects(
                    () => callSubmit(engine, { prompt: {} }),
                    (err: Error) =>
                        /ComfyUI error \(HTTP 500\)/.test(err.message) &&
                        /internal boom/.test(err.message),
                    'error should carry HTTP status and response text',
                );
            } finally {
                fetchStub.restore();
            }
        });

        it('throws a [API]-tagged error when the response shape is invalid (ComfyResponseError path)', async () => {
            const fetchStub = stubFetch(async () =>
                fakeResponse({
                    ok: true,
                    status: 200,
                    // Missing prompt_id → validatePromptResponse throws ComfyResponseError
                    jsonValue: { number: 0 },
                }),
            );
            try {
                const engine = new ComfyServerEngine();
                await assert.rejects(
                    () => callSubmit(engine, { prompt: {} }),
                    (err: Error) => /ComfyUI prompt response invalid/.test(err.message),
                    'malformed JSON shape must surface the validation message',
                );
            } finally {
                fetchStub.restore();
            }
        });

        it('throws a wrapped error when response.json() rejects (malformed body)', async () => {
            const fetchStub = stubFetch(async () =>
                fakeResponse({
                    ok: true,
                    status: 200,
                    json: async () => {
                        throw new SyntaxError('Unexpected token <');
                    },
                }),
            );
            try {
                const engine = new ComfyServerEngine();
                await assert.rejects(
                    () => callSubmit(engine, { prompt: {} }),
                    (err: Error) => /Failed to submit prompt/.test(err.message),
                );
            } finally {
                fetchStub.restore();
            }
        });

        it('throws a wrapped error when fetch itself rejects (transport error)', async () => {
            const fetchStub = stubFetch(async () => {
                throw new Error('ECONNREFUSED 127.0.0.1:8188');
            });
            try {
                const engine = new ComfyServerEngine();
                await assert.rejects(
                    () => callSubmit(engine, { prompt: {} }),
                    (err: Error) =>
                        /Failed to submit prompt/.test(err.message) &&
                        /ECONNREFUSED/.test(err.message),
                );
            } finally {
                fetchStub.restore();
            }
        });
    });

    // ── pollForCompletion (private) ─────────────────────────────────────────

    describe('pollForCompletion', () => {
        /** Replace sleep() so tests run instantly; capture the delays requested. */
        function stubSleep(engine: ComfyServerEngine): number[] {
            const delays: number[] = [];
            (engine as any).sleep = (ms: number) => {
                delays.push(ms);
                return Promise.resolve();
            };
            return delays;
        }

        async function callPoll(
            engine: ComfyServerEngine,
            promptId: string,
            timeoutMs = 300000,
        ): Promise<any> {
            return (engine as any).pollForCompletion(promptId, timeoutMs);
        }

        it('returns the completed history entry once status.completed is true', async () => {
            const historyBody = {
                'pid-1': {
                    status: { status_str: 'success', completed: true },
                    outputs: {
                        '9': { images: [{ filename: 'a.png', subfolder: '', type: 'output' }] },
                    },
                },
            };
            const fetchStub = stubFetch(async () =>
                fakeResponse({ ok: true, status: 200, jsonValue: historyBody }),
            );
            try {
                const engine = new ComfyServerEngine();
                stubSleep(engine);
                const entry = await callPoll(engine, 'pid-1');
                assert.ok(entry);
                assert.strictEqual(entry.status.completed, true);
                assert.ok(entry.outputs['9'].images);
            } finally {
                fetchStub.restore();
            }
        });

        it('returns null when canceled before the first poll', async () => {
            const engine = new ComfyServerEngine();
            (engine as any).canceled = true;
            const fetchStub = stubFetch(async () => {
                throw new Error('should not be called');
            });
            try {
                stubSleep(engine);
                const result = await callPoll(engine, 'pid-1');
                assert.strictEqual(result, null);
                assert.strictEqual(fetchStub.calls.length, 0);
            } finally {
                fetchStub.restore();
            }
        });

        it('returns null when timeoutMs elapses without completion', async () => {
            // Always-incomplete history — polling loop should eventually
            // exit when Date.now() - startTime >= timeoutMs.
            const historyBody = {
                'pid-2': {
                    status: { status_str: 'running', completed: false },
                    outputs: {},
                },
            };
            const fetchStub = stubFetch(async () =>
                fakeResponse({ ok: true, status: 200, jsonValue: historyBody }),
            );
            try {
                const engine = new ComfyServerEngine();
                // sleep() that actually advances nothing but yields the loop.
                // The while-loop uses Date.now() so we fake the clock too.
                const originalNow = Date.now;
                let fakeClock = 0;
                Date.now = () => fakeClock;
                (engine as any).sleep = (_ms: number) => {
                    fakeClock += 5000; // simulate waiting 5s per iteration
                    return Promise.resolve();
                };
                try {
                    const result = await callPoll(engine, 'pid-2', 1000); // 1s budget
                    assert.strictEqual(result, null, 'timeout must resolve to null');
                    // With a 1s budget and 5s per fake iteration, we should
                    // have polled at most twice before bailing.
                    assert.ok(
                        fetchStub.calls.length <= 2,
                        `expected ≤2 polls on timeout, got ${fetchStub.calls.length}`,
                    );
                } finally {
                    Date.now = originalNow;
                }
            } finally {
                fetchStub.restore();
            }
        });

        it('continues polling on 404 (entry not yet in history) and honours backoff', async () => {
            // First two fetches return 404 (job not yet registered).
            // Third returns the completed entry.
            const completed = {
                'pid-3': {
                    status: { status_str: 'success', completed: true },
                    outputs: {},
                },
            };
            let call = 0;
            const fetchStub = stubFetch(async () => {
                call++;
                if (call <= 2) return fakeResponse({ ok: false, status: 404 });
                return fakeResponse({ ok: true, status: 200, jsonValue: completed });
            });
            try {
                const engine = new ComfyServerEngine();
                const delays = stubSleep(engine);
                const result = await callPoll(engine, 'pid-3');
                assert.ok(result, 'should eventually return the completed entry');
                assert.strictEqual(result.status.completed, true);
                // Backoff should have fired after each non-OK poll — at
                // least the two 404s each produce a sleep() call.
                assert.ok(
                    delays.length >= 2,
                    `expected ≥2 backoff sleeps, got ${delays.length}`,
                );
                // Default BackoffTimer grows monotonically (up to jitter ±20%).
                // Assert a loose bound: second delay is not tiny compared to first.
                if (delays.length >= 2) {
                    assert.ok(
                        delays[1] > 0,
                        'second backoff delay must be positive',
                    );
                }
            } finally {
                fetchStub.restore();
            }
        });

        it('throws when a ComfyResponseError (bad shape) is emitted mid-poll', async () => {
            // History response returns the promptId but with an invalid status
            // (non-boolean `completed`) → validateHistoryEntry → ComfyResponseError.
            const fetchStub = stubFetch(async () =>
                fakeResponse({
                    ok: true,
                    status: 200,
                    jsonValue: {
                        'pid-4': {
                            status: { status_str: 'running', completed: 'maybe' },
                            outputs: {},
                        },
                    },
                }),
            );
            try {
                const engine = new ComfyServerEngine();
                stubSleep(engine);
                await assert.rejects(
                    () => callPoll(engine, 'pid-4', 30000),
                    (err: Error) => /ComfyUI history response invalid/.test(err.message),
                );
            } finally {
                fetchStub.restore();
            }
        });

        it('respects cancellation set mid-poll between fetches', async () => {
            // Server returns incomplete history; cancellation flips to true
            // after the first fetch, so the next loop iteration exits early.
            let call = 0;
            const engine = new ComfyServerEngine();
            const fetchStub = stubFetch(async () => {
                call++;
                // Flip the flag after the first successful fetch.
                (engine as any).canceled = true;
                return fakeResponse({
                    ok: true,
                    status: 200,
                    jsonValue: {
                        'pid-5': {
                            status: { status_str: 'running', completed: false },
                            outputs: {},
                        },
                    },
                });
            });
            try {
                stubSleep(engine);
                const result = await callPoll(engine, 'pid-5');
                assert.strictEqual(result, null, 'cancelled poll must yield null');
                assert.ok(call >= 1, 'at least one fetch should have happened');
            } finally {
                fetchStub.restore();
            }
        });
    });

    // ── collectImages (private) ─────────────────────────────────────────────

    describe('collectImages', () => {
        async function callCollect(engine: ComfyServerEngine, history: any, request: JobRequest): Promise<any> {
            return (engine as any).collectImages(history, request);
        }

        /** Replace the engine's filesystem writer so tests touch no disk. */
        function stubDownload(
            engine: ComfyServerEngine,
            impl: (filename: string, subfolder: string, type: string, destPath: string) => Promise<number | null>,
        ): void {
            (engine as any).downloadToFile = impl;
        }

        /** Replace fs.mkdirSync with a no-op to avoid creating real folders. */
        function stubMkdir(engine: ComfyServerEngine): void {
            // collectImages reaches out to imported `fs.mkdirSync` at the module
            // level — monkey-patching require('fs') achieves the same thing.
            const fs = require('fs');
            const original = fs.mkdirSync;
            fs.mkdirSync = () => '/tmp/fake';
            // Stash so the tests can restore cleanly in afterEach.
            (engine as any).__restoreMkdir = () => {
                fs.mkdirSync = original;
            };
        }

        it('downloads one artifact per image entry across every output node', async () => {
            const engine = new ComfyServerEngine();
            stubMkdir(engine);
            const history = {
                outputs: {
                    '9': { images: [
                        { filename: 'a.png', subfolder: '', type: 'output' },
                        { filename: 'b.png', subfolder: '', type: 'output' },
                    ] },
                    '10': { images: [
                        { filename: 'c.png', subfolder: '', type: 'output' },
                    ] },
                },
                status: { status_str: 'success', completed: true },
            };
            const downloadCalls: Array<{ filename: string; destPath: string }> = [];
            stubDownload(engine, async (filename, _sf, _t, destPath) => {
                downloadCalls.push({ filename, destPath });
                return 1234;
            });
            try {
                const artifacts = await callCollect(engine, history, {
                    kind: 'image',
                    preset_id: 'p',
                    inputs: { prompt: 'x', seed: 9 },
                    run_id: 'r1',
                    workspace_path: '/ws',
                    created_at: new Date().toISOString(),
                });
                assert.strictEqual(artifacts.length, 3);
                for (const a of artifacts) {
                    assert.strictEqual(a.type, 'image');
                    assert.strictEqual(a.size_bytes, 1234);
                    assert.strictEqual(a.provenance?.seed, 9);
                    assert.ok(a.path.includes('.codecomfy/outputs/'));
                    assert.ok(!a.path.includes('\\'), 'path must use forward slashes');
                }
                // downloadToFile invoked for every image
                assert.strictEqual(downloadCalls.length, 3);
            } finally {
                (engine as any).__restoreMkdir?.();
            }
        });

        it('skips images whose download returns null (partial failure tolerated)', async () => {
            const engine = new ComfyServerEngine();
            stubMkdir(engine);
            const history = {
                outputs: {
                    '9': { images: [
                        { filename: 'good.png', subfolder: '', type: 'output' },
                        { filename: 'bad.png', subfolder: '', type: 'output' },
                    ] },
                },
                status: { status_str: 'success', completed: true },
            };
            stubDownload(engine, async (filename) => (filename === 'bad.png' ? null : 999));
            try {
                const artifacts = await callCollect(engine, history, {
                    kind: 'image',
                    preset_id: 'p',
                    inputs: { prompt: 'x' },
                    run_id: 'r1',
                    workspace_path: '/ws',
                    created_at: new Date().toISOString(),
                });
                assert.strictEqual(artifacts.length, 1, 'failed download must not produce an artifact');
                assert.strictEqual(artifacts[0].size_bytes, 999);
            } finally {
                (engine as any).__restoreMkdir?.();
            }
        });

        it('rejects path-traversal filenames via sanitizeComfyFilename (no download attempted)', async () => {
            const engine = new ComfyServerEngine();
            stubMkdir(engine);
            const history = {
                outputs: {
                    '9': { images: [
                        { filename: '../../etc/shadow.png', subfolder: '', type: 'output' },
                        { filename: 'safe.png', subfolder: '', type: 'output' },
                    ] },
                },
                status: { status_str: 'success', completed: true },
            };
            const downloaded: string[] = [];
            stubDownload(engine, async (filename) => {
                downloaded.push(filename);
                return 100;
            });
            try {
                const artifacts = await callCollect(engine, history, {
                    kind: 'image',
                    preset_id: 'p',
                    inputs: { prompt: 'x' },
                    run_id: 'r1',
                    workspace_path: '/ws',
                    created_at: new Date().toISOString(),
                });
                // Only safe.png makes it through
                assert.strictEqual(artifacts.length, 1);
                assert.deepStrictEqual(downloaded, ['safe.png']);
            } finally {
                (engine as any).__restoreMkdir?.();
            }
        });

        // Sanity: sanitizer is a real import, not a stubbed stand-in.
        it('sanitizer is the real comfyValidation module (imports resolve)', () => {
            // If sanitizeComfyFilename were missing/renamed, the engine would
            // fail to import. We assert the error class for its own sanity.
            assert.strictEqual(ComfyResponseError.prototype.name, 'Error');
            // ComfyResponseError sets .name in its ctor, but the prototype
            // .name is still "Error"; instantiating proves the wiring.
            const e = new ComfyResponseError('filename', 'x', 'raw');
            assert.strictEqual(e.name, 'ComfyResponseError');
            assert.strictEqual(e.responseKind, 'filename');
        });
    });

    // ── collectFrames (private) ─────────────────────────────────────────────

    describe('collectFrames', () => {
        async function callCollect(engine: ComfyServerEngine, history: any, request: JobRequest): Promise<any> {
            return (engine as any).collectFrames(history, request);
        }

        function stubDownload(
            engine: ComfyServerEngine,
            impl: (filename: string, subfolder: string, type: string, destPath: string) => Promise<number | null>,
        ): void {
            (engine as any).downloadToFile = impl;
        }

        function stubMkdir(): () => void {
            const fs = require('fs');
            const original = fs.mkdirSync;
            fs.mkdirSync = () => '/tmp/fake-frames';
            return () => {
                fs.mkdirSync = original;
            };
        }

        it('downloads frames in sorted order and returns image-typed artifacts', async () => {
            const engine = new ComfyServerEngine();
            const restore = stubMkdir();
            const history = {
                outputs: {
                    '9': { images: [
                        { filename: 'frame_0002.png', subfolder: '', type: 'output' },
                        { filename: 'frame_0000.png', subfolder: '', type: 'output' },
                        { filename: 'frame_0001.png', subfolder: '', type: 'output' },
                    ] },
                },
                status: { status_str: 'success', completed: true },
            };
            const order: string[] = [];
            stubDownload(engine, async (filename) => {
                order.push(filename);
                return 42;
            });
            try {
                const artifacts = await callCollect(engine, history, {
                    kind: 'video',
                    preset_id: 'p',
                    inputs: { prompt: 'x', frame_count: 3 },
                    run_id: 'vid-1',
                    workspace_path: '/ws',
                    created_at: new Date().toISOString(),
                });
                // Sort order matters for ffmpeg assembly
                assert.deepStrictEqual(order, [
                    'frame_0000.png',
                    'frame_0001.png',
                    'frame_0002.png',
                ]);
                assert.strictEqual(artifacts.length, 3);
                for (const a of artifacts) {
                    assert.strictEqual(a.type, 'image'); // frames are image-typed
                    assert.strictEqual(a.size_bytes, 42);
                    assert.ok(a.path.includes('runs/vid-1/frames/'));
                }
            } finally {
                restore();
            }
        });

        it('returns an empty array when no frames are present in history.outputs', async () => {
            const engine = new ComfyServerEngine();
            const restore = stubMkdir();
            const history = {
                outputs: {
                    '9': {}, // no images key
                },
                status: { status_str: 'success', completed: true },
            };
            let called = false;
            stubDownload(engine, async () => {
                called = true;
                return 1;
            });
            try {
                const artifacts = await callCollect(engine, history, {
                    kind: 'video',
                    preset_id: 'p',
                    inputs: { prompt: 'x', frame_count: 0 },
                    run_id: 'vid-2',
                    workspace_path: '/ws',
                    created_at: new Date().toISOString(),
                });
                assert.deepStrictEqual(artifacts, []);
                assert.strictEqual(called, false, 'downloadToFile must not be invoked');
            } finally {
                restore();
            }
        });

        it('rejects path-traversal frame filenames via sanitizeComfyFilename', async () => {
            const engine = new ComfyServerEngine();
            const restore = stubMkdir();
            const history = {
                outputs: {
                    '9': { images: [
                        { filename: '..\\..\\boot.ini', subfolder: '', type: 'output' },
                        { filename: 'frame_0000.png', subfolder: '', type: 'output' },
                    ] },
                },
                status: { status_str: 'success', completed: true },
            };
            const downloaded: string[] = [];
            stubDownload(engine, async (filename) => {
                downloaded.push(filename);
                return 7;
            });
            try {
                const artifacts = await callCollect(engine, history, {
                    kind: 'video',
                    preset_id: 'p',
                    inputs: { prompt: 'x', frame_count: 2 },
                    run_id: 'vid-3',
                    workspace_path: '/ws',
                    created_at: new Date().toISOString(),
                });
                // Only the safe frame survives sanitisation
                assert.strictEqual(artifacts.length, 1);
                assert.deepStrictEqual(downloaded, ['frame_0000.png']);
                assert.ok(
                    artifacts[0].path.endsWith('frames/frame_0000.png'),
                    `expected sanitised path, got ${artifacts[0].path}`,
                );
            } finally {
                restore();
            }
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // User-perspective degradation (F-256919-031)
    //
    // Unit tests above verify `isAvailable()` returns false on network
    // failure, but the USER never sees that boolean — they see the error
    // that bubbles out of `generate()` and into the extension's output
    // channel. These tests assert the ACTUAL prose contract that lands in
    // front of the user when ComfyUI is down during a real generation.
    //
    // If engine-domain F-256918-011 lands a structured `{ok, reason}`
    // return from `isAvailable()`, this block still serves as a regression
    // gate: the prose must keep the URL + actionable phrasing regardless
    // of the internal shape change.
    // ────────────────────────────────────────────────────────────────────────

    describe('generate() — ComfyUI-down error prose (user-facing)', () => {
        after(() => { cleanupTempPaths(); });

        function makeImageRequest(): JobRequest {
            return {
                kind: 'image',
                preset_id: 'hq-image',
                inputs: { prompt: 'a beautiful sunset' },
                run_id: 'run_user_facing',
                workspace_path: '/tmp/ws',
                created_at: new Date().toISOString(),
            };
        }

        function makePresetWithWorkflow(): Preset {
            return {
                id: 'hq-image',
                name: 'HQ Image',
                kind: 'image',
                defaults: { width: 512, height: 512, steps: 20, cfg_scale: 7 },
                workflow: { '1': { class_type: 'CLIPTextEncode', inputs: { text: '' } } },
            };
        }

        it('surfaces the ComfyUI URL in the error when the server is down', async () => {
            const url = 'http://host.example:8188';
            const fetchStub = stubFetch(async () => {
                throw new Error('ECONNREFUSED');
            });
            try {
                const engine = new ComfyServerEngine(url);
                const result = await engine.generate(makeImageRequest(), makePresetWithWorkflow());
                assert.strictEqual(result.success, false);
                assert.ok(result.error, 'error prose should be set');
                assert.ok(
                    result.error!.includes(url),
                    `user-facing error must include the ComfyUI URL — got: ${result.error}`,
                );
            } finally {
                fetchStub.restore();
            }
        });

        it('includes an actionable hint (Start ComfyUI / running / setting) when the server is down', async () => {
            const fetchStub = stubFetch(async () => {
                throw new Error('ECONNREFUSED');
            });
            try {
                const engine = new ComfyServerEngine('http://127.0.0.1:8188');
                const result = await engine.generate(makeImageRequest(), makePresetWithWorkflow());
                assert.strictEqual(result.success, false);
                assert.ok(result.error, 'error prose should be set');
                const msg = result.error!;
                // The user needs to know WHAT to do next. Accept any of the
                // phrases the extension currently produces — if prose is
                // ever rewritten to drop all three, this test catches it.
                const actionable =
                    /Start ComfyUI/i.test(msg) ||
                    /running/i.test(msg) ||
                    /codecomfy\.comfyuiUrl/.test(msg) ||
                    /check your URL/i.test(msg);
                assert.ok(
                    actionable,
                    `user-facing error must include an actionable hint; got: ${msg}`,
                );
            } finally {
                fetchStub.restore();
            }
        });

        it('short-circuits before submitting a prompt when ComfyUI is unreachable', async () => {
            // /system_stats (isAvailable) fails first; we must NOT see a
            // /prompt POST afterward because generate() should bail on
            // isAvailable() returning false.
            const fetchStub = stubFetch(async () => {
                throw new Error('ECONNREFUSED');
            });
            try {
                const engine = new ComfyServerEngine();
                await engine.generate(makeImageRequest(), makePresetWithWorkflow());
                const promptHits = fetchStub.calls.filter((c) => c.url.endsWith('/prompt'));
                assert.strictEqual(
                    promptHits.length,
                    0,
                    'generate() must not POST /prompt when isAvailable() is false',
                );
            } finally {
                fetchStub.restore();
            }
        });

        it('logged error propagates through JobRouter to the output-channel logger', async () => {
            // The router logs `engine returned failure` + the error detail
            // via logger.warn. This test verifies the PROSE reaches the log
            // sink with the URL + actionable phrase — exactly what lands in
            // the output channel when the user hits "Generate" with
            // ComfyUI not running.
            const lines: string[] = [];
            const logger = new Logger({
                component: 'JobRouter',
                sink: (line: string) => lines.push(line),
            });
            const url = 'http://localhost:9999';
            const fetchStub = stubFetch(async () => {
                throw new Error('ECONNREFUSED');
            });
            try {
                const engine = new ComfyServerEngine(url);
                const ws = makeTempDir('codecomfy-userface-');
                registerCleanup(ws);
                const router = new JobRouter(ws, engine, { logger });
                await router.run(
                    { kind: 'image', preset_id: 'hq-image', inputs: { prompt: 'x' } },
                    makePresetWithWorkflow(),
                );
                // At least one logged line must contain the URL — that's
                // what shows in the user's output channel.
                const urlLogged = lines.some((l) => l.includes(url));
                assert.ok(
                    urlLogged,
                    `expected the ComfyUI URL in at least one logged line; got:\n${lines.join('\n')}`,
                );
                // And at least one line must carry an actionable hint.
                const actionableLogged = lines.some(
                    (l) =>
                        /Start ComfyUI/i.test(l) ||
                        /codecomfy\.comfyuiUrl/.test(l) ||
                        /running/i.test(l),
                );
                assert.ok(
                    actionableLogged,
                    `expected actionable hint in logs; got:\n${lines.join('\n')}`,
                );
            } finally {
                fetchStub.restore();
            }
        });
    });
});
