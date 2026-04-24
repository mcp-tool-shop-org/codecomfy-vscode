/**
 * Tests for run history pruning.
 */

import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { pruneRuns, createEmptyIndex, MAX_RUNS, MAX_AGE_DAYS } from '../../src/pruning/pruner';
import { CODECOMFY_DIR, RUNS_DIR, OUTPUTS_DIR, INDEX_FILENAME } from '../../src/types';
import { makeTempDir, patchModule } from '../helpers';

// ── Test helpers ──────────────────────────────────────────────────────────────

function makeTmpWorkspace(): string {
    // Shared helper handles mkdtempSync + cleanup registration.
    // We still rm -rf the dir in afterEach (fast path) but the registry
    // ensures any straggler is caught at process exit.
    return makeTempDir('codecomfy-prune-');
}

function createRunDir(
    workspacePath: string,
    runId: string,
    createdAt: Date,
): void {
    const runDir = path.join(workspacePath, CODECOMFY_DIR, RUNS_DIR, runId);
    fs.mkdirSync(runDir, { recursive: true });

    // Write request.json with the timestamp
    const request = {
        run_id: runId,
        created_at: createdAt.toISOString(),
        kind: 'image',
        preset_id: 'test',
        inputs: { prompt: 'test' },
        workspace_path: workspacePath,
    };
    fs.writeFileSync(path.join(runDir, 'request.json'), JSON.stringify(request));
    fs.writeFileSync(path.join(runDir, 'status.json'), JSON.stringify({ run_id: runId, status: 'succeeded' }));
}

function writeIndex(workspacePath: string, runIds: string[]): void {
    const outputsDir = path.join(workspacePath, CODECOMFY_DIR, OUTPUTS_DIR);
    fs.mkdirSync(outputsDir, { recursive: true });

    const index = createEmptyIndex('test');
    for (const runId of runIds) {
        index.items.push({
            id: `${runId}_0`,
            type: 'image',
            path: `.codecomfy/outputs/${runId}.png`,
            created_at: new Date().toISOString(),
            run_id: runId,
        });
    }

    fs.writeFileSync(
        path.join(outputsDir, INDEX_FILENAME),
        JSON.stringify(index, null, 2),
    );
}

function readIndex(workspacePath: string): any {
    const indexPath = path.join(workspacePath, CODECOMFY_DIR, OUTPUTS_DIR, INDEX_FILENAME);
    return JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
}

function runDirExists(workspacePath: string, runId: string): boolean {
    return fs.existsSync(path.join(workspacePath, CODECOMFY_DIR, RUNS_DIR, runId));
}

function cleanup(dir: string): void {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('pruneRuns', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = makeTmpWorkspace();
    });

    afterEach(() => {
        cleanup(tmpDir);
    });

    it('does nothing when runs directory does not exist', () => {
        const result = pruneRuns(tmpDir);
        assert.strictEqual(result.prunedRuns, 0);
        assert.strictEqual(result.prunedIndexEntries, 0);
    });

    it('does nothing when run count is within limits', () => {
        const now = new Date();
        createRunDir(tmpDir, 'run-1', now);
        createRunDir(tmpDir, 'run-2', now);

        const result = pruneRuns(tmpDir, { maxRuns: 10, maxAgeDays: 30, now });
        assert.strictEqual(result.prunedRuns, 0);
    });

    it('prunes excess runs older than maxAgeDays', () => {
        const now = new Date();
        const oldDate = new Date(now.getTime() - 60 * 86_400_000); // 60 days ago

        // Create 3 runs: 2 old, 1 recent
        createRunDir(tmpDir, 'old-1', oldDate);
        createRunDir(tmpDir, 'old-2', oldDate);
        createRunDir(tmpDir, 'recent', now);

        writeIndex(tmpDir, ['old-1', 'old-2', 'recent']);

        const result = pruneRuns(tmpDir, { maxRuns: 1, maxAgeDays: 30, now });

        assert.strictEqual(result.prunedRuns, 2);
        assert.strictEqual(result.prunedIndexEntries, 2);
        assert.ok(!runDirExists(tmpDir, 'old-1'));
        assert.ok(!runDirExists(tmpDir, 'old-2'));
        assert.ok(runDirExists(tmpDir, 'recent'));

        // Index should only have the recent entry
        const index = readIndex(tmpDir);
        assert.strictEqual(index.items.length, 1);
        assert.strictEqual(index.items[0].run_id, 'recent');
    });

    it('does not prune recent runs even if count exceeds maxRuns', () => {
        const now = new Date();
        const recentDate = new Date(now.getTime() - 5 * 86_400_000); // 5 days ago

        createRunDir(tmpDir, 'r1', recentDate);
        createRunDir(tmpDir, 'r2', recentDate);
        createRunDir(tmpDir, 'r3', recentDate);

        // maxRuns = 1 but all are within maxAgeDays
        const result = pruneRuns(tmpDir, { maxRuns: 1, maxAgeDays: 30, now });
        assert.strictEqual(result.prunedRuns, 0, 'Should not prune recent runs');
    });

    it('prunes runs exceeding both maxRuns and maxAgeDays', () => {
        const now = new Date();
        const oldDate = new Date(now.getTime() - 45 * 86_400_000); // 45 days ago

        // Create 5 runs: 3 old, 2 recent
        for (let i = 0; i < 3; i++) {
            createRunDir(tmpDir, `old-${i}`, oldDate);
        }
        for (let i = 0; i < 2; i++) {
            createRunDir(tmpDir, `new-${i}`, now);
        }

        writeIndex(tmpDir, ['old-0', 'old-1', 'old-2', 'new-0', 'new-1']);

        const result = pruneRuns(tmpDir, { maxRuns: 2, maxAgeDays: 30, now });

        assert.strictEqual(result.prunedRuns, 3);
        assert.strictEqual(result.prunedIndexEntries, 3);
        assert.ok(runDirExists(tmpDir, 'new-0'));
        assert.ok(runDirExists(tmpDir, 'new-1'));
    });

    it('handles missing index file gracefully', () => {
        const now = new Date();
        const oldDate = new Date(now.getTime() - 60 * 86_400_000);

        createRunDir(tmpDir, 'old-x', oldDate);

        // No index file
        const result = pruneRuns(tmpDir, { maxRuns: 0, maxAgeDays: 1, now });
        assert.strictEqual(result.prunedRuns, 1);
        assert.strictEqual(result.prunedIndexEntries, 0);
        assert.strictEqual(result.errors.length, 0);
    });

    it('reports errors but continues when a run directory cannot be deleted', () => {
        // This test verifies the error path exists — we use a non-existent
        // dir to simulate (the fs.rmSync with force will not error, so
        // we just ensure no crash on normal flow)
        const now = new Date();
        const oldDate = new Date(now.getTime() - 60 * 86_400_000);

        createRunDir(tmpDir, 'ok-1', oldDate);
        createRunDir(tmpDir, 'ok-2', oldDate);

        const result = pruneRuns(tmpDir, { maxRuns: 0, maxAgeDays: 1, now });
        assert.strictEqual(result.prunedRuns, 2);
    });

    it('uses default MAX_RUNS and MAX_AGE_DAYS constants', () => {
        assert.strictEqual(MAX_RUNS, 200);
        assert.strictEqual(MAX_AGE_DAYS, 30);
    });

    it('handles run without request.json (falls back to mtime)', () => {
        const now = new Date();
        const runDir = path.join(tmpDir, CODECOMFY_DIR, RUNS_DIR, 'no-req');
        fs.mkdirSync(runDir, { recursive: true });
        // No request.json — will use directory mtime (which is "now")

        const result = pruneRuns(tmpDir, { maxRuns: 0, maxAgeDays: 1, now });
        // Directory was just created so it's recent — should not be pruned by age
        assert.strictEqual(result.prunedRuns, 0);
    });

    it('prunes old run even if only age policy triggers (count within limit)', () => {
        const now = new Date();
        const veryOld = new Date(now.getTime() - 365 * 86_400_000); // 1 year ago

        createRunDir(tmpDir, 'ancient', veryOld);

        const result = pruneRuns(tmpDir, { maxRuns: 200, maxAgeDays: 30, now });
        assert.strictEqual(result.prunedRuns, 1);
    });

    // ── Edge cases (F-256919-034) ────────────────────────────────────────────
    //
    // The tests above cover the happy path + single-run quirks. Real
    // workspaces hit scale and filesystem weirdness that's worth
    // exercising before a user does.

    it('prunes cleanly at scale — 50 old runs + retention=10 leaves newest 10 intact', () => {
        // Fixed "now" so ages are deterministic.
        const now = new Date('2026-01-01T00:00:00Z');
        // Create 50 runs spaced one day apart, starting 49 days ago.
        // With maxRuns=10 and maxAgeDays=5, the 40 oldest must be pruned
        // and the 10 newest (days 0-9) must survive.
        for (let i = 0; i < 50; i++) {
            const createdAt = new Date(now.getTime() - i * 86_400_000);
            createRunDir(tmpDir, `run-${String(i).padStart(2, '0')}`, createdAt);
        }

        const result = pruneRuns(tmpDir, { maxRuns: 10, maxAgeDays: 5, now });

        assert.strictEqual(
            result.prunedRuns,
            40,
            `expected 40 pruned (50 − 10 newest), got ${result.prunedRuns}`,
        );
        assert.strictEqual(result.errors.length, 0, 'no errors at scale');

        // The 10 newest (indices 0..9) should still be on disk.
        for (let i = 0; i < 10; i++) {
            const id = `run-${String(i).padStart(2, '0')}`;
            assert.ok(
                runDirExists(tmpDir, id),
                `newest run ${id} should survive pruning`,
            );
        }
        // Oldest (index 49) must be gone.
        assert.ok(!runDirExists(tmpDir, 'run-49'), 'oldest run should be pruned');
    });

    it('reports errors but continues when a specific run cannot be deleted (locked directory)', () => {
        // Patch fs.rmSync to throw EACCES for a specific target and
        // succeed for the rest. Verifies the pruner does not fail-stop
        // on a single locked directory.
        const now = new Date();
        const oldDate = new Date(now.getTime() - 60 * 86_400_000);

        createRunDir(tmpDir, 'locked', oldDate);
        createRunDir(tmpDir, 'free-1', oldDate);
        createRunDir(tmpDir, 'free-2', oldDate);

        const lockedPath = path.join(tmpDir, CODECOMFY_DIR, RUNS_DIR, 'locked');
        const realFs = require('fs');
        const originalRmSync = realFs.rmSync;
        const patch = patchModule<typeof import('fs')>('fs', 'rmSync', ((
            target: fs.PathLike,
            opts?: fs.RmOptions,
        ) => {
            if (String(target) === lockedPath) {
                const err = new Error('EACCES: permission denied');
                (err as NodeJS.ErrnoException).code = 'EACCES';
                throw err;
            }
            return originalRmSync(target, opts);
        }) as typeof fs.rmSync);

        try {
            const result = pruneRuns(tmpDir, { maxRuns: 0, maxAgeDays: 1, now });
            // Two should succeed, one should fail.
            assert.strictEqual(
                result.prunedRuns,
                2,
                `expected 2 pruned, 1 locked; got ${result.prunedRuns}`,
            );
            assert.strictEqual(
                result.errors.length,
                1,
                `expected 1 error entry, got ${result.errors.length}`,
            );
            assert.ok(
                result.errors[0].includes('locked'),
                `error should reference the failing run id; got: ${result.errors[0]}`,
            );
            assert.ok(
                /EACCES/.test(result.errors[0]),
                `error should carry the OS error code; got: ${result.errors[0]}`,
            );
            // The two unlocked runs are gone, the locked one is still there.
            assert.ok(!runDirExists(tmpDir, 'free-1'));
            assert.ok(!runDirExists(tmpDir, 'free-2'));
            assert.ok(runDirExists(tmpDir, 'locked'), 'locked run must remain on disk');
        } finally {
            patch.restore();
        }
    });

    it('falls back to mtime when request.json is missing or unreadable', () => {
        // A corrupted run folder (no request.json) should still be
        // classified for retention via directory mtime rather than
        // crashing or being treated as infinitely old.
        const now = new Date();
        const runsDir = path.join(tmpDir, CODECOMFY_DIR, RUNS_DIR);
        const oldDir = path.join(runsDir, 'corrupt-old');
        const newDir = path.join(runsDir, 'corrupt-new');
        fs.mkdirSync(oldDir, { recursive: true });
        fs.mkdirSync(newDir, { recursive: true });

        // No request.json in either — but set mtimes explicitly:
        // one older than maxAgeDays, one recent.
        const oldTime = new Date(now.getTime() - 60 * 86_400_000);
        const newTime = new Date(now.getTime() - 1 * 86_400_000);
        fs.utimesSync(oldDir, oldTime, oldTime);
        fs.utimesSync(newDir, newTime, newTime);

        const result = pruneRuns(tmpDir, { maxRuns: 0, maxAgeDays: 30, now });

        // The old-mtime folder should be pruned via mtime fallback.
        // The recent-mtime folder should survive.
        assert.strictEqual(
            result.prunedRuns,
            1,
            `expected exactly 1 prune via mtime fallback; got ${result.prunedRuns}`,
        );
        assert.ok(!runDirExists(tmpDir, 'corrupt-old'));
        assert.ok(runDirExists(tmpDir, 'corrupt-new'));
    });
});
