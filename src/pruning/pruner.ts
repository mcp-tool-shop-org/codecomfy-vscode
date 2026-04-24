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
    const ageCutoff = new Date(now.getTime() - maxAgeDays * MS_PER_DAY);

    let toPrune: RunEntry[];
    let remaining: RunEntry[];
    if (runEntries.length <= maxRuns) {
        // Still check age policy even when count is within limit
        toPrune = runEntries.filter((r) => r.createdAt < ageCutoff);
        remaining = runEntries.filter((r) => r.createdAt >= ageCutoff);
    } else {
        // Sort newest-first
        runEntries.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        const kept = runEntries.slice(0, maxRuns);
        const excess = runEntries.slice(maxRuns);
        // Apply age filter as well: only prune if older than maxAgeDays
        toPrune = excess.filter((r) => r.createdAt < ageCutoff);
        const spared = excess.filter((r) => r.createdAt >= ageCutoff);
        remaining = kept.concat(spared);
    }

    if (toPrune.length === 0) {
        return result;
    }

    // Opening summary line — retention policy in human terms.
    log.info(
        `Pruning ${path.join(CODECOMFY_DIR, RUNS_DIR).replace(/\\/g, '/')} — retention: keep ${maxRuns} runs, ${maxAgeDays} days`,
    );

    return pruneSelected(toPrune, workspacePath, log, result, remaining);
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
    remaining: RunEntry[] = [],
): PruneResult {
    const prunedRunIds = new Set<string>();
    const now = Date.now();
    let totalBytesFreed = 0;

    for (const entry of toPrune) {
        // Best-effort size + artifact-count calc BEFORE deletion (skip on error).
        let sizeBytes: number | undefined;
        let artifactCount: number | undefined;
        try {
            const stats = dirSizeAndArtifactCount(entry.dirPath);
            sizeBytes = stats.bytes;
            artifactCount = stats.artifactCount;
        } catch {
            // Size calc is cosmetic — never block pruning on it.
        }

        try {
            fs.rmSync(entry.dirPath, { recursive: true, force: true });
            prunedRunIds.add(entry.runId);
            result.prunedRuns++;
            if (typeof sizeBytes === 'number') {
                totalBytesFreed += sizeBytes;
            }
            const ageDays = Math.max(
                0,
                Math.floor((now - entry.createdAt.getTime()) / MS_PER_DAY),
            );
            const sizeStr = typeof sizeBytes === 'number' ? `, ${formatBytes(sizeBytes)}` : '';
            const artStr = typeof artifactCount === 'number'
                ? `, ${artifactCount} artifact${artifactCount === 1 ? '' : 's'}`
                : '';
            log.info(`Pruned run ${entry.runId} (${ageDays} day${ageDays === 1 ? '' : 's'}${sizeStr}${artStr})`);
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

    // ── Closing summary ──────────────────────────────────────────────────
    if (result.prunedRuns > 0) {
        const oldestKept = remaining
            .map((r) => r.createdAt.getTime())
            .filter((t) => t > 0)
            .reduce<number | undefined>((acc, t) => (acc === undefined || t < acc ? t : acc), undefined);
        const oldestStr = typeof oldestKept === 'number'
            ? new Date(oldestKept).toISOString().slice(0, 10)
            : 'none';
        const freedStr = totalBytesFreed > 0 ? `, freed ~${formatBytes(totalBytesFreed)}` : '';
        log.info(
            `Pruning done: removed ${result.prunedRuns} run${result.prunedRuns === 1 ? '' : 's'}${freedStr}, oldest kept: ${oldestStr}`,
        );
    }

    return result;
}

/**
 * Best-effort directory size + artifact count.
 * Counts files under `outputs/` and `frames/` as artifacts if present;
 * otherwise counts all regular files.
 */
function dirSizeAndArtifactCount(dirPath: string): { bytes: number; artifactCount: number } {
    let bytes = 0;
    let artifactCount = 0;
    const walk = (p: string): void => {
        let entries: fs.Dirent[];
        try {
            entries = fs.readdirSync(p, { withFileTypes: true });
        } catch {
            return;
        }
        for (const ent of entries) {
            const full = path.join(p, ent.name);
            if (ent.isDirectory()) {
                walk(full);
            } else if (ent.isFile()) {
                try {
                    const st = fs.statSync(full);
                    bytes += st.size;
                    // Count images/videos/frames as artifacts
                    if (/\.(png|jpg|jpeg|webp|mp4|gif|mov)$/i.test(ent.name)) {
                        artifactCount++;
                    }
                } catch {
                    // Skip unreadable file
                }
            }
        }
    };
    walk(dirPath);
    return { bytes, artifactCount };
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
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
