/**
 * RunHistoryProvider (FT-022)
 *
 * Minimum-viable TreeView backed by `.codecomfy/outputs/index.json`.
 * Scope intentionally tight — Mike will reject Phase-6-style creep:
 *
 *   NO filtering UI
 *   NO tagging
 *   NO rename
 *   NO bulk delete
 *   NO compare UI
 *   NO search
 *
 * Just: one node per run in the index, with a "Re-run" context action
 * wired to `codecomfy.rerunJob`. Tree refreshes via `fs.watch` on the
 * index file so newly-landed runs appear without a manual refresh.
 *
 * Companion command (FT-023) lives in extension.ts so the TreeView
 * provider itself stays framework-agnostic and cheap to unit-test.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {
    OutputIndex,
    IndexedArtifact,
    CODECOMFY_DIR,
    OUTPUTS_DIR,
    INDEX_FILENAME,
} from './types';

/**
 * Tree element. A `runId === null` item is the "empty" placeholder.
 */
export interface RunHistoryItem {
    runId: string | null;
    label: string;
    description?: string;
    kind?: 'image' | 'video';
    createdAt?: string;
    status?: 'ok' | 'empty';
}

export class RunHistoryProvider implements vscode.TreeDataProvider<RunHistoryItem> {
    private readonly _onDidChangeTreeData = new vscode.EventEmitter<RunHistoryItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<RunHistoryItem | undefined | void> = this._onDidChangeTreeData.event;

    private watcher: fs.FSWatcher | undefined;
    private readonly indexPath: string;
    /** Debounce fs.watch storms — atomic writes can fire multiple events. */
    private refreshTimer: NodeJS.Timeout | undefined;

    constructor(private readonly workspacePath: string) {
        this.indexPath = path.join(
            workspacePath,
            CODECOMFY_DIR,
            OUTPUTS_DIR,
            INDEX_FILENAME,
        );
        this.attachWatcher();
    }

    /**
     * Attach `fs.watch` on the index file. Survives the file not
     * existing yet — we watch the parent dir in that case, and
     * re-attach once `.codecomfy/outputs/index.json` appears.
     */
    private attachWatcher(): void {
        const outputsDir = path.dirname(this.indexPath);
        try {
            if (fs.existsSync(this.indexPath)) {
                this.watcher = fs.watch(this.indexPath, { persistent: false }, () => this.scheduleRefresh());
            } else if (fs.existsSync(outputsDir)) {
                // Wait for the index file to appear.
                this.watcher = fs.watch(outputsDir, { persistent: false }, (_event, filename) => {
                    if (filename === INDEX_FILENAME) {
                        this.scheduleRefresh();
                        // Upgrade to watching the file itself once it exists.
                        if (fs.existsSync(this.indexPath)) {
                            this.watcher?.close();
                            try {
                                this.watcher = fs.watch(this.indexPath, { persistent: false }, () => this.scheduleRefresh());
                            } catch {
                                /* swallow — next refresh will repeat the attach */
                            }
                        }
                    }
                });
            }
            // If neither path exists yet, leave watcher unset. The tree
            // renders an empty placeholder; a manual refresh call will
            // re-attach when the user eventually runs a generation.
        } catch {
            // fs.watch can throw on some networked filesystems; tree
            // still works (refresh-on-open), we just lose live updates.
        }
    }

    private scheduleRefresh(): void {
        if (this.refreshTimer !== undefined) {
            clearTimeout(this.refreshTimer);
        }
        this.refreshTimer = setTimeout(() => {
            this.refreshTimer = undefined;
            this._onDidChangeTreeData.fire();
        }, 150);
    }

    /** Public refresh hook (used by tests and by extension.ts if needed). */
    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    dispose(): void {
        if (this.refreshTimer !== undefined) {
            clearTimeout(this.refreshTimer);
            this.refreshTimer = undefined;
        }
        this.watcher?.close();
        this.watcher = undefined;
        this._onDidChangeTreeData.dispose();
    }

    // -----------------------------------------------------------------
    // TreeDataProvider contract
    // -----------------------------------------------------------------

    getTreeItem(element: RunHistoryItem): vscode.TreeItem {
        if (element.status === 'empty') {
            const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
            item.contextValue = 'codecomfy.runHistory.empty';
            item.tooltip = 'Run CodeComfy: Generate Image (HQ) or Generate Video (HQ) to populate history.';
            return item;
        }

        const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
        item.description = element.description;
        item.contextValue = 'codecomfy.runHistory.run';
        item.tooltip = element.createdAt
            ? `Run ${element.runId}\n${element.createdAt}`
            : `Run ${element.runId}`;
        // Icon: video / image / generic
        if (element.kind === 'video') {
            item.iconPath = new vscode.ThemeIcon('file-media');
        } else if (element.kind === 'image') {
            item.iconPath = new vscode.ThemeIcon('file-media');
        } else {
            item.iconPath = new vscode.ThemeIcon('history');
        }
        // Clicking the node itself also re-runs — convenient shortcut.
        item.command = {
            command: 'codecomfy.rerunJob',
            title: 'Re-run',
            arguments: [element.runId],
        };
        return item;
    }

    getChildren(element?: RunHistoryItem): RunHistoryItem[] {
        if (element) {
            return []; // flat tree
        }
        return this.readRuns();
    }

    // -----------------------------------------------------------------
    // Index parsing
    // -----------------------------------------------------------------

    private readRuns(): RunHistoryItem[] {
        if (!fs.existsSync(this.indexPath)) {
            return [this.emptyPlaceholder()];
        }
        let parsed: OutputIndex | undefined;
        try {
            const raw = fs.readFileSync(this.indexPath, 'utf-8');
            parsed = JSON.parse(raw) as OutputIndex;
        } catch {
            // Corrupt index — still show the placeholder rather than
            // crashing the tree. A future pass could surface the parse
            // error in the status bar.
            return [this.emptyPlaceholder('Run history index is unreadable — regenerate by running a job.')];
        }
        if (!parsed || !Array.isArray(parsed.items) || parsed.items.length === 0) {
            return [this.emptyPlaceholder()];
        }

        // One node per run_id — collapse artifacts that share a run.
        const byRun = new Map<string, IndexedArtifact[]>();
        for (const art of parsed.items) {
            if (!art || typeof art.run_id !== 'string') continue;
            const bucket = byRun.get(art.run_id) ?? [];
            bucket.push(art);
            byRun.set(art.run_id, bucket);
        }

        const items: RunHistoryItem[] = [];
        for (const [runId, arts] of byRun) {
            const first = arts[0];
            const created = first?.created_at ?? '';
            const kind = (first?.type === 'video' ? 'video' : 'image') as 'image' | 'video';
            const countSuffix = arts.length > 1 ? ` · ${arts.length} artifacts` : '';
            items.push({
                runId,
                label: runId,
                description: `${formatTimestamp(created)} · ${kind}${countSuffix}`,
                kind,
                createdAt: created,
                status: 'ok',
            });
        }
        // Newest first.
        items.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
        return items;
    }

    private emptyPlaceholder(message?: string): RunHistoryItem {
        return {
            runId: null,
            label: message ?? 'No runs yet — run a generation to see history',
            status: 'empty',
        };
    }
}

/** Short, locale-agnostic timestamp for the tree description line. */
function formatTimestamp(iso: string): string {
    if (!iso) return '(unknown)';
    // ISO strings sort chronologically and are already compact enough
    // for a tree-item description; strip fractional seconds for polish.
    return iso.replace(/\.\d+Z$/, 'Z');
}
