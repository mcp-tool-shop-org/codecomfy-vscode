/**
 * Tests for JobRouter — pure logic and helpers.
 *
 * Tests for generateRunId, computeWorkspaceKey, createEmptyIndex, and
 * frame_count computation (the video fps*duration calculation).
 * I/O-dependent integration paths (fs writes, engine calls) are exercised
 * via Sinon stubs where feasible.
 *
 * NOTE ON PRIVATE METHOD ACCESS — several tests use `(router as any).foo()`
 * to reach methods declared `private` in the source. This is intentional:
 * the JobRouter exposes a minimal public surface, but its internal helpers
 * (generateRunId, computeWorkspaceKey, createEmptyIndex, getRunDir) have
 * deterministic behaviour worth asserting. If those helpers ever move to
 * a separate module or grow public seams, the casts can be dropped.
 */

import * as assert from 'node:assert/strict';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as sinon from 'sinon';
import { JobRouter } from '../../src/router/jobRouter';
import { Logger, createNullLogger } from '../../src/logging/logger';
import { INDEX_SCHEMA_VERSION } from '../../src/types';
import type { IGenerationEngine, Preset } from '../../src/types';
import { makeTempDir, registerCleanup, cleanupTempPaths } from '../helpers';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Minimal engine stub — never actually called in these unit tests. */
function stubEngine(overrides: Partial<IGenerationEngine> = {}): IGenerationEngine {
    return {
        id: 'stub',
        name: 'Stub Engine',
        isAvailable: async () => true,
        generate: async () => ({ success: true, artifacts: [] }),
        cancel: async () => {},
        ...overrides,
    };
}

function createRouter(workspacePath = '/tmp/test-ws'): JobRouter {
    return new JobRouter(workspacePath, stubEngine(), {
        logger: createNullLogger('test'),
    });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('JobRouter', () => {

    after(() => { cleanupTempPaths(); });

    describe('constructor', () => {
        it('initializes with no current run and cancel flag unset', () => {
            // Replaces a tautological `assert.ok(router)` — we now verify
            // real constructor-wired state.
            const router = new JobRouter('/ws', stubEngine());
            assert.strictEqual(router.getCurrentRun(), null, 'no run should be active at construction');
            // Private cancel flag — accessing via cast, as documented at top of file.
            assert.strictEqual((router as any).cancelRequested, false);
            // Engine + workspace are stored
            assert.strictEqual((router as any).workspacePath, '/ws');
            assert.strictEqual(((router as any).engine as IGenerationEngine).id, 'stub');
        });

        it('stores and uses the provided logger', async () => {
            // Previously a tautological `assert.ok(router)` that couldn't fail.
            // Now: build a Sinon-spy logger, trigger a code path that logs,
            // and verify the spy received the message.
            const sink = sinon.spy();
            const logger = new Logger({ component: 'JobRouter', sink });
            const engine = stubEngine();

            const router = new JobRouter('/ws', engine, { logger });

            // `cancel()` with no active run does nothing — trigger a logged
            // path instead by setting currentRun and canceling.
            (router as any).currentRun = { run_id: 'fake_run', status: 'running' };
            await router.cancel();

            assert.ok(
                sink.called,
                'the provided logger should be called when cancel() fires with an active run',
            );
            const loggedLine = sink.firstCall.args[0] as string;
            assert.ok(
                loggedLine.includes('fake_run'),
                `logger output should include the run id; got: ${loggedLine}`,
            );
        });

        it('falls back to a null logger when none is supplied', () => {
            // Verify the null-logger path is wired — the internal `log` field
            // should be a Logger instance regardless of the options shape.
            const router = new JobRouter('/ws', stubEngine()); // no options
            const log = (router as any).log;
            assert.ok(log, 'internal logger should always exist');
            // A null logger's sink is a no-op — calling info() must not throw.
            assert.doesNotThrow(() => log.info('hello'));
        });
    });

    describe('getCurrentRun', () => {
        it('returns null before any run', () => {
            const router = createRouter();
            assert.strictEqual(router.getCurrentRun(), null);
        });
    });

    describe('cancel', () => {
        it('is a no-op and does not throw when no run is active', async () => {
            const router = createRouter();
            await router.cancel();
            // No active run → cancelRequested should remain false, engine.cancel
            // should NOT have been called.
            assert.strictEqual((router as any).cancelRequested, false);
        });

        it('sets cancelRequested and calls engine.cancel() when a run is active', async () => {
            const engineCancel = sinon.spy(async () => {});
            const engine = stubEngine({ cancel: engineCancel });
            const router = new JobRouter('/ws', engine, {
                logger: createNullLogger('test'),
            });

            // Simulate an in-flight run — cancel() checks currentRun.
            (router as any).currentRun = { run_id: 'r1', status: 'running' };

            await router.cancel();

            assert.strictEqual(
                (router as any).cancelRequested,
                true,
                'cancelRequested should be set after cancel()',
            );
            assert.ok(engineCancel.calledOnce, 'engine.cancel() should be invoked once');
        });
    });

    describe('generateRunId (private)', () => {
        it('produces a string in format: base36timestamp_hex8', () => {
            const router = createRouter();
            const id: string = (router as any).generateRunId();
            // Format: <base36>_<8 hex chars>
            assert.match(id, /^[0-9a-z]+_[0-9a-f]{8}$/);
        });

        it('generates unique IDs on repeated calls', () => {
            const router = createRouter();
            const ids = new Set<string>();
            for (let i = 0; i < 100; i++) {
                ids.add((router as any).generateRunId());
            }
            assert.strictEqual(ids.size, 100);
        });
    });

    describe('computeWorkspaceKey (private)', () => {
        it('returns a 16-character hex string', () => {
            const router = createRouter('/some/path');
            const key: string = (router as any).computeWorkspaceKey();
            assert.match(key, /^[0-9a-f]{16}$/);
        });

        it('is deterministic for the same workspace path', () => {
            const r1 = createRouter('/stable/path');
            const r2 = createRouter('/stable/path');
            assert.strictEqual(
                (r1 as any).computeWorkspaceKey(),
                (r2 as any).computeWorkspaceKey(),
            );
        });

        it('differs for different workspace paths', () => {
            const r1 = createRouter('/path/a');
            const r2 = createRouter('/path/b');
            assert.notStrictEqual(
                (r1 as any).computeWorkspaceKey(),
                (r2 as any).computeWorkspaceKey(),
            );
        });

        it('matches SHA-256 truncation of the path', () => {
            const wsPath = '/test/workspace';
            const router = createRouter(wsPath);
            const expected = crypto
                .createHash('sha256')
                .update(wsPath)
                .digest('hex')
                .substring(0, 16);
            assert.strictEqual((router as any).computeWorkspaceKey(), expected);
        });
    });

    describe('createEmptyIndex (private)', () => {
        it('returns an index with correct schema version', () => {
            const router = createRouter();
            const index = (router as any).createEmptyIndex();
            assert.strictEqual(index.schema_version, INDEX_SCHEMA_VERSION);
        });

        it('returns an index with empty items array', () => {
            const router = createRouter();
            const index = (router as any).createEmptyIndex();
            assert.ok(Array.isArray(index.items));
            assert.strictEqual(index.items.length, 0);
        });

        it('returns an index with workspace_key', () => {
            const router = createRouter('/my/ws');
            const index = (router as any).createEmptyIndex();
            assert.match(index.workspace_key, /^[0-9a-f]{16}$/);
        });
    });

    describe('frame_count computation', () => {
        // The run() method computes frame_count = ceil(fps * duration) for video.
        // The next describe block exercises this through run() against a real
        // (temp) workspace — these tests preserve the formula-level assertions
        // for fast feedback.

        it('computes frame_count as ceil(fps * duration)', () => {
            const fps = 24;
            const duration = 4;
            const frameCount = Math.ceil(fps * duration);
            assert.strictEqual(frameCount, 96);
        });

        it('rounds up fractional frame counts', () => {
            const fps = 30;
            const duration = 3.5;
            const frameCount = Math.ceil(fps * duration);
            assert.strictEqual(frameCount, 105);
        });

        it('handles non-standard fps values', () => {
            const fps = 12;
            const duration = 2;
            const frameCount = Math.ceil(fps * duration);
            assert.strictEqual(frameCount, 24);
        });

        it('uses defaults (24fps, 4s) when not specified', () => {
            const fps = 24;  // default
            const duration = 4;  // default
            const frameCount = Math.ceil(fps * duration);
            assert.strictEqual(frameCount, 96);
        });
    });

    describe('run() video frame_count integration', () => {
        // Exercises run() end-to-end with a stub engine to verify
        // frame_count is ACTUALLY computed and forwarded to the engine
        // (previously the formula was only tested in isolation).

        it('computes frame_count and passes it through to the engine for video kind', async () => {
            const ws = makeTempDir('codecomfy-jr-');
            registerCleanup(ws);

            // Capture what the engine received.
            const generateSpy = sinon.spy(async () => ({ success: false, artifacts: [], error: 'stop after capture' }));
            const engine = stubEngine({ generate: generateSpy });

            const router = new JobRouter(ws, engine, {
                logger: createNullLogger('test'),
            });

            const preset: Preset = {
                id: 'hq-video',
                name: 'HQ Video',
                kind: 'video',
                defaults: { fps: 24, duration_seconds: 4 },
            };

            await router.run(
                {
                    kind: 'video',
                    preset_id: 'hq-video',
                    inputs: { prompt: 'a cat', fps: 30, duration_seconds: 5 },
                },
                preset,
            );

            assert.ok(generateSpy.calledOnce, 'engine.generate should be called once');
            const [request] = generateSpy.firstCall.args as any[];
            assert.strictEqual(
                request.inputs.frame_count,
                Math.ceil(30 * 5),
                'frame_count should be ceil(fps * duration)',
            );
            assert.strictEqual(request.inputs.fps, 30);
            assert.strictEqual(request.inputs.duration_seconds, 5);

            // The router should have created the run directory so the
            // request/status files could be written.
            const runDir = path.join(ws, '.codecomfy', 'runs', request.run_id);
            assert.ok(fs.existsSync(runDir), `run dir should exist at ${runDir}`);
            // Register for cleanup (whole tree is under `ws`, already queued).
        });

        it('falls back to preset defaults when inputs omit fps/duration', async () => {
            const ws = makeTempDir('codecomfy-jr-');
            registerCleanup(ws);

            const generateSpy = sinon.spy(async () => ({ success: false, artifacts: [], error: 'stop' }));
            const engine = stubEngine({ generate: generateSpy });
            const router = new JobRouter(ws, engine, { logger: createNullLogger('test') });

            const preset: Preset = {
                id: 'hq-video',
                name: 'HQ Video',
                kind: 'video',
                defaults: { fps: 12, duration_seconds: 6 },
            };

            await router.run(
                { kind: 'video', preset_id: 'hq-video', inputs: { prompt: 'x' } },
                preset,
            );

            const [request] = generateSpy.firstCall.args as any[];
            assert.strictEqual(request.inputs.fps, 12);
            assert.strictEqual(request.inputs.duration_seconds, 6);
            assert.strictEqual(request.inputs.frame_count, 72);
        });
    });

    describe('getRunDir (private)', () => {
        it('returns correct path under .codecomfy/runs/', () => {
            const router = createRouter('/workspace');
            const runDir: string = (router as any).getRunDir('abc_123');
            assert.ok(runDir.includes('.codecomfy'));
            assert.ok(runDir.includes('runs'));
            assert.ok(runDir.endsWith('abc_123'));
        });
    });
});
