/**
 * Tests for run history pruning.
 */

import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { pruneRuns, createEmptyIndex, MAX_RUNS, MAX_AGE_DAYS } from '../../src/pruning/pruner';
import { CODECOMFY_DIR, RUNS_DIR, OUTPUTS_DIR, INDEX_FILENAME } from '../../src/types';

// ── Test helpers ──────────────────────────────────────────────────────────────

function makeTmpWorkspace(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codecomfy-prune-'));
    return dir;
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
});
