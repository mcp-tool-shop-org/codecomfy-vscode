/**
 * Tests for src/runHistoryProvider.ts — the TreeDataProvider backing the
 * Run History view.
 *
 * Contract (FT-4 / F-904558-036):
 *   - parses a valid `.codecomfy/outputs/index.json` into TreeItems
 *   - missing file → single "No runs yet" empty-state node (no crash)
 *   - corrupt JSON → empty-state node explaining the index is unreadable
 *   - each run item's click command wires to `codecomfy.rerunJob` with the
 *     runId in `arguments[0]`
 *   - dispose() is idempotent and safe even when no watcher was attached
 *
 * The TreeView framework surface is covered by the stub in
 * `test/stubs/vscode.ts`; no real VS Code runtime is needed.
 */

import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { RunHistoryProvider } from '../../src/runHistoryProvider';
import {
    CODECOMFY_DIR,
    OUTPUTS_DIR,
    INDEX_FILENAME,
    INDEX_SCHEMA_VERSION,
    OutputIndex,
} from '../../src/types';
import { makeTempDir, registerCleanup, cleanupTempPaths } from '../helpers';

after(() => {
    cleanupTempPaths();
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function writeIndex(workspace: string, index: OutputIndex | string): string {
    const outputsDir = path.join(workspace, CODECOMFY_DIR, OUTPUTS_DIR);
    fs.mkdirSync(outputsDir, { recursive: true });
    const indexPath = path.join(outputsDir, INDEX_FILENAME);
    fs.writeFileSync(
        indexPath,
        typeof index === 'string' ? index : JSON.stringify(index),
        'utf-8',
    );
    return indexPath;
}

function makeEmptyOutputIndex(workspace: string): OutputIndex {
    return {
        schema_version: INDEX_SCHEMA_VERSION,
        workspace_key: '0'.repeat(16),
        items: [],
    };
}

function makeIndexWithOneImage(workspace: string): OutputIndex {
    return {
        schema_version: INDEX_SCHEMA_VERSION,
        workspace_key: '0'.repeat(16),
        items: [
            {
                id: 'art1',
                type: 'image',
                path: '.codecomfy/outputs/art1.png',
                created_at: '2026-04-20T12:00:00.000Z',
                run_id: 'run_abc_12345678',
                provenance: { prompt: 'sunset', preset_id: 'hq-image' },
            },
        ],
    };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('RunHistoryProvider (FT-4)', () => {
    describe('getChildren — parsing', () => {
        it('parses a valid index.json into one node per run_id', () => {
            const ws = makeTempDir('codecomfy-tree-');
            registerCleanup(ws);
            writeIndex(ws, makeIndexWithOneImage(ws));

            const provider = new RunHistoryProvider(ws);
            try {
                const children = provider.getChildren();
                assert.strictEqual(children.length, 1);
                assert.strictEqual(children[0].runId, 'run_abc_12345678');
                assert.strictEqual(children[0].status, 'ok');
                assert.strictEqual(children[0].kind, 'image');
            } finally {
                provider.dispose();
            }
        });

        it('collapses multiple artifacts for the same run into a single node', () => {
            const ws = makeTempDir('codecomfy-tree-');
            registerCleanup(ws);
            writeIndex(ws, {
                schema_version: INDEX_SCHEMA_VERSION,
                workspace_key: '0'.repeat(16),
                items: [
                    {
                        id: 'a',
                        type: 'image',
                        path: 'a.png',
                        created_at: '2026-04-20T00:00:00.000Z',
                        run_id: 'run_same',
                    },
                    {
                        id: 'b',
                        type: 'image',
                        path: 'b.png',
                        created_at: '2026-04-20T00:00:01.000Z',
                        run_id: 'run_same',
                    },
                ],
            });

            const provider = new RunHistoryProvider(ws);
            try {
                const children = provider.getChildren();
                assert.strictEqual(children.length, 1);
                // Description should mention the artifact count ("· 2 artifacts")
                const desc = String(children[0].description ?? '');
                assert.match(desc, /2 artifacts/);
            } finally {
                provider.dispose();
            }
        });

        it('sorts runs newest-first by created_at', () => {
            const ws = makeTempDir('codecomfy-tree-');
            registerCleanup(ws);
            writeIndex(ws, {
                schema_version: INDEX_SCHEMA_VERSION,
                workspace_key: '0'.repeat(16),
                items: [
                    {
                        id: 'old',
                        type: 'image',
                        path: 'old.png',
                        created_at: '2020-01-01T00:00:00.000Z',
                        run_id: 'run_old',
                    },
                    {
                        id: 'new',
                        type: 'image',
                        path: 'new.png',
                        created_at: '2030-01-01T00:00:00.000Z',
                        run_id: 'run_new',
                    },
                ],
            });
            const provider = new RunHistoryProvider(ws);
            try {
                const children = provider.getChildren();
                assert.strictEqual(children[0].runId, 'run_new');
                assert.strictEqual(children[1].runId, 'run_old');
            } finally {
                provider.dispose();
            }
        });
    });

    describe('empty-state and error handling', () => {
        it('returns a single "No runs yet" empty node when index.json is missing', () => {
            const ws = makeTempDir('codecomfy-tree-');
            registerCleanup(ws);
            // Deliberately skip writeIndex — no file on disk.
            const provider = new RunHistoryProvider(ws);
            try {
                const children = provider.getChildren();
                assert.strictEqual(children.length, 1);
                assert.strictEqual(children[0].status, 'empty');
                assert.match(String(children[0].label ?? ''), /No runs yet/i);
            } finally {
                provider.dispose();
            }
        });

        it('returns a single empty node when index.json is corrupt (no crash)', () => {
            const ws = makeTempDir('codecomfy-tree-');
            registerCleanup(ws);
            writeIndex(ws, 'NOT VALID JSON {{{');

            const provider = new RunHistoryProvider(ws);
            try {
                const children = provider.getChildren();
                assert.strictEqual(children.length, 1);
                assert.strictEqual(children[0].status, 'empty');
                // Label is allowed to say "unreadable" in the corrupt branch —
                // contract is "exactly one empty node, no crash".
            } finally {
                provider.dispose();
            }
        });

        it('returns empty node when items array is present but empty', () => {
            const ws = makeTempDir('codecomfy-tree-');
            registerCleanup(ws);
            writeIndex(ws, makeEmptyOutputIndex(ws));
            const provider = new RunHistoryProvider(ws);
            try {
                const children = provider.getChildren();
                assert.strictEqual(children.length, 1);
                assert.strictEqual(children[0].status, 'empty');
            } finally {
                provider.dispose();
            }
        });
    });

    describe('getTreeItem', () => {
        it('run items wire click command to codecomfy.rerunJob with the runId', () => {
            const ws = makeTempDir('codecomfy-tree-');
            registerCleanup(ws);
            writeIndex(ws, makeIndexWithOneImage(ws));

            const provider = new RunHistoryProvider(ws);
            try {
                const [first] = provider.getChildren();
                const item = provider.getTreeItem(first);
                assert.ok(item.command, 'tree item should have a click command');
                assert.strictEqual(item.command!.command, 'codecomfy.rerunJob');
                assert.deepStrictEqual(
                    item.command!.arguments,
                    ['run_abc_12345678'],
                    'runId should be threaded as arguments[0]',
                );
            } finally {
                provider.dispose();
            }
        });

        it('empty placeholder items carry the empty contextValue and no rerun command', () => {
            const ws = makeTempDir('codecomfy-tree-');
            registerCleanup(ws);
            const provider = new RunHistoryProvider(ws);
            try {
                const [placeholder] = provider.getChildren();
                const item = provider.getTreeItem(placeholder);
                assert.strictEqual(item.contextValue, 'codecomfy.runHistory.empty');
                assert.strictEqual(item.command, undefined);
            } finally {
                provider.dispose();
            }
        });
    });

    describe('dispose', () => {
        it('is safe to call when no watcher was ever attached', () => {
            const ws = makeTempDir('codecomfy-tree-');
            registerCleanup(ws);
            // No `.codecomfy/outputs/` subtree → attachWatcher silently
            // no-ops; dispose() must not throw.
            const provider = new RunHistoryProvider(ws);
            assert.doesNotThrow(() => provider.dispose());
        });

        it('is idempotent — calling twice does not throw', () => {
            const ws = makeTempDir('codecomfy-tree-');
            registerCleanup(ws);
            writeIndex(ws, makeIndexWithOneImage(ws));
            const provider = new RunHistoryProvider(ws);
            provider.dispose();
            assert.doesNotThrow(() => provider.dispose());
        });
    });

    describe('refresh hook', () => {
        it('refresh() fires onDidChangeTreeData', () => {
            const ws = makeTempDir('codecomfy-tree-');
            registerCleanup(ws);
            writeIndex(ws, makeIndexWithOneImage(ws));
            const provider = new RunHistoryProvider(ws);
            try {
                let fired = 0;
                const sub = provider.onDidChangeTreeData(() => fired++);
                provider.refresh();
                sub.dispose();
                assert.strictEqual(fired, 1);
            } finally {
                provider.dispose();
            }
        });
    });
});
