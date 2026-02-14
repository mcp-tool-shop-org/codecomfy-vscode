/**
 * Run history pruning.
 *
 * Removes old run folders and their corresponding entries from the output
 * index to prevent unbounded workspace growth.
 *
 * Retention policy (both must be satisfied to keep a run):
 *   - MAX_RUNS: keep the most recent N runs
 *   - MAX_AGE_DAYS: keep runs created within the last N days
 *
 * The pruner is safe to call repeatedly — it is idempotent.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
    CODECOMFY_DIR,
    RUNS_DIR,
    OUTPUTS_DIR,
    INDEX_FILENAME,
    OutputIndex,
    INDEX_SCHEMA_VERSION,
} from '../types';
import { Logger, createNullLogger } from '../logging/logger';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Maximum number of runs to keep. */
export const MAX_RUNS = 200;

/** Maximum age in days before a run is eligible for pruning. */
export const MAX_AGE_DAYS = 30;

const MS_PER_DAY = 86_400_000;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PruneResult {
    /** Number of run folders removed. */
    prunedRuns: number;
    /** Number of index entries removed. */
    prunedIndexEntries: number;
    /** Errors encountered (non-fatal — pruning continues past them). */
    errors: string[];
}

export interface PruneOptions {
    maxRuns?: number;
    maxAgeDays?: number;
    /** Reference time for age calculation (mainly for tests). */
    now?: Date;
    logger?: Logger;
}

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Prune old runs and their index entries from the workspace.
 */
export function pruneRuns(workspacePath: string, opts: PruneOptions = {}): PruneResult {
    const maxRuns = opts.maxRuns ?? MAX_RUNS;
    const maxAgeDays = opts.maxAgeDays ?? MAX_AGE_DAYS;
    const now = opts.now ?? new Date();
    const log = opts.logger ?? createNullLogger('Pruner');

    const result: PruneResult = { prunedRuns: 0, prunedIndexEntries: 0, errors: [] };

    const runsDir = path.join(workspacePath, CODECOMFY_DIR, RUNS_DIR);
    if (!fs.existsSync(runsDir)) {
        return result;
    }

    // ── Enumerate runs ────────────────────────────────────────────────────
    const runEntries = listRuns(runsDir);
    if (runEntries.length <= maxRuns) {
        // Still check age policy even when count is within limit
        const ageCutoff = new Date(now.getTime() - maxAgeDays * MS_PER_DAY);
        const expired = runEntries.filter((r) => r.createdAt < ageCutoff);
        if (expired.length === 0) {
            return result;
        }
        return pruneSelected(expired, workspacePath, log, result);
    }

    // Sort newest-first
    runEntries.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    // Keep the most recent maxRuns — anything past that is a candidate
    const excess = runEntries.slice(maxRuns);

    // Apply age filter as well: only prune if older than maxAgeDays
    const ageCutoff = new Date(now.getTime() - maxAgeDays * MS_PER_DAY);
    const toPrune = excess.filter((r) => r.createdAt < ageCutoff);

    if (toPrune.length === 0) {
        return result;
    }

    return pruneSelected(toPrune, workspacePath, log, result);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

interface RunEntry {
    runId: string;
    dirPath: string;
    createdAt: Date;
}

/**
 * List run directories and their creation timestamps.
 *
 * Reads `status.json` (or falls back to `request.json`) to extract a
 * timestamp.  If neither file exists, the directory mtime is used.
 */
function listRuns(runsDir: string): RunEntry[] {
    const entries: RunEntry[] = [];

    let dirs: string[];
    try {
        dirs = fs.readdirSync(runsDir).filter((name) => {
            const full = path.join(runsDir, name);
            try {
                return fs.statSync(full).isDirectory();
            } catch {
                return false;
            }
        });
    } catch {
        return entries;
    }

    for (const name of dirs) {
        const dirPath = path.join(runsDir, name);
        const createdAt = getRunTimestamp(dirPath);
        entries.push({ runId: name, dirPath, createdAt });
    }

    return entries;
}

function getRunTimestamp(dirPath: string): Date {
    // Prefer request.json created_at
    const requestPath = path.join(dirPath, 'request.json');
    try {
        if (fs.existsSync(requestPath)) {
            const content = fs.readFileSync(requestPath, 'utf-8');
            const data = JSON.parse(content);
            if (typeof data.created_at === 'string') {
                const d = new Date(data.created_at);
                if (!isNaN(d.getTime())) return d;
            }
        }
    } catch {
        // Fall through
    }

    // Fallback to directory mtime
    try {
        return fs.statSync(dirPath).mtime;
    } catch {
        return new Date(0);
    }
}

function pruneSelected(
    toPrune: RunEntry[],
    workspacePath: string,
    log: Logger,
    result: PruneResult,
): PruneResult {
    const prunedRunIds = new Set<string>();

    for (const entry of toPrune) {
        try {
            fs.rmSync(entry.dirPath, { recursive: true, force: true });
            prunedRunIds.add(entry.runId);
            result.prunedRuns++;
            log.info(`Pruned run ${entry.runId}`);
        } catch (err) {
            const msg = `Failed to prune ${entry.runId}: ${err instanceof Error ? err.message : String(err)}`;
            log.warn(msg);
            result.errors.push(msg);
        }
    }

    // ── Prune index entries ───────────────────────────────────────────────
    if (prunedRunIds.size > 0) {
        const indexResult = pruneIndexEntries(workspacePath, prunedRunIds, log);
        result.prunedIndexEntries = indexResult.prunedEntries;
        if (indexResult.error) {
            result.errors.push(indexResult.error);
        }
    }

    return result;
}

function pruneIndexEntries(
    workspacePath: string,
    prunedRunIds: Set<string>,
    log: Logger,
): { prunedEntries: number; error?: string } {
    const indexPath = path.join(workspacePath, CODECOMFY_DIR, OUTPUTS_DIR, INDEX_FILENAME);

    if (!fs.existsSync(indexPath)) {
        return { prunedEntries: 0 };
    }

    try {
        const content = fs.readFileSync(indexPath, 'utf-8');
        const index: OutputIndex = JSON.parse(content);

        const before = index.items.length;
        index.items = index.items.filter((item) => !prunedRunIds.has(item.run_id));
        const removed = before - index.items.length;

        if (removed > 0) {
            // Atomic write
            const tempPath = `${indexPath}.tmp.${Date.now()}`;
            fs.writeFileSync(tempPath, JSON.stringify(index, null, 2));
            fs.renameSync(tempPath, indexPath);
            log.info(`Pruned ${removed} index entries`);
        }

        return { prunedEntries: removed };
    } catch (err) {
        const msg = `Failed to prune index: ${err instanceof Error ? err.message : String(err)}`;
        log.warn(msg);
        return { prunedEntries: 0, error: msg };
    }
}

/**
 * Create an empty index for test helpers.
 * (Re-exported here so tests don't need to duplicate the shape.)
 */
export function createEmptyIndex(workspaceKey = 'test'): OutputIndex {
    return {
        schema_version: INDEX_SCHEMA_VERSION,
        workspace_key: workspaceKey,
        items: [],
    };
}
