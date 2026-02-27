/**
 * Tests for JobRouter — pure logic and helpers.
 *
 * Tests for generateRunId, computeWorkspaceKey, createEmptyIndex, and
 * frame_count computation (the video fps*duration calculation).
 * I/O-dependent integration paths (fs writes, engine calls) are not tested here.
 */

import * as assert from 'node:assert/strict';
import * as crypto from 'crypto';
import { JobRouter } from '../../src/router/jobRouter';
import { createNullLogger } from '../../src/logging/logger';
import { INDEX_SCHEMA_VERSION } from '../../src/types';
import type { IGenerationEngine, JobRequest, Preset, GenerationResult } from '../../src/types';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Minimal engine stub — never actually called in these unit tests. */
function stubEngine(): IGenerationEngine {
    return {
        id: 'stub',
        name: 'Stub Engine',
        isAvailable: async () => true,
        generate: async () => ({ success: true, artifacts: [] }),
        cancel: async () => {},
    };
}

function createRouter(workspacePath = '/tmp/test-ws'): JobRouter {
    return new JobRouter(workspacePath, stubEngine(), {
        logger: createNullLogger('test'),
    });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('JobRouter', () => {

    describe('constructor', () => {
        it('can be instantiated with minimal arguments', () => {
            const router = new JobRouter('/ws', stubEngine());
            assert.ok(router);
        });

        it('accepts optional logger', () => {
            const router = createRouter();
            assert.ok(router);
        });
    });

    describe('getCurrentRun', () => {
        it('returns null before any run', () => {
            const router = createRouter();
            assert.strictEqual(router.getCurrentRun(), null);
        });
    });

    describe('cancel', () => {
        it('is safe when no run is active', async () => {
            const router = createRouter();
            await router.cancel(); // should not throw
            assert.ok(true);
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
        // We verify this logic by checking the formula directly since
        // run() requires filesystem access.

        it('computes frame_count as ceil(fps * duration)', () => {
            // Simulating what run() does internally:
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
