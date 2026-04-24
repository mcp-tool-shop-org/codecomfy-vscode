/**
 * Minimal vscode module stub for headless unit tests.
 *
 * Only surfaces the shapes that our source code actually imports.
 * Tests that exercise real VS Code APIs belong in integration tests
 * (run via @vscode/test-electron), not here.
 *
 * FT-5/FT-039 extensions:
 * - `TreeDataProvider`, `TreeItem`, `TreeItemCollapsibleState`, `ThemeIcon`,
 *   `EventEmitter` surfaces for TreeView-backed features (runHistoryProvider).
 * - Spy lists on `showInformationMessage` / `showErrorMessage` /
 *   `showWarningMessage` so tests can assert on user-facing prompts.
 * - Mutable `workspace.workspaceFolders` so tests can simulate
 *   "no folder open" vs. "workspace at /tmp/x" cases.
 * - A FileSystemWatcher mock with manual `.emit()` hooks for
 *   file-change-driven tests.
 *
 * Contract — kept intentionally narrow: only the shapes our source
 * imports are re-exported. Adding new fields is fine; removing them
 * requires a sweep of the `src/` imports first.
 */

export namespace workspace {
    const _config: Record<string, any> = {};

    export function getConfiguration(_section?: string) {
        return {
            get<T>(key: string, defaultValue?: T): T | undefined {
                if (key in _config) {
                    return _config[key] as T;
                }
                return defaultValue;
            },
        };
    }

    /** Test helper: seed fake config values before calling getConfig(). */
    export function _setFakeConfig(values: Record<string, any>): void {
        for (const key of Object.keys(_config)) {
            delete _config[key];
        }
        Object.assign(_config, values);
    }

    /**
     * Mutable workspaceFolders — tests can push/pop entries via
     * `_setWorkspaceFolders([...])`.
     *
     * Using a mutable `let` (re-exported via the accessor pattern) is the
     * least-noisy shape: production code reads `vscode.workspace.workspaceFolders`
     * directly and treats `undefined` as "no folder open".
     */
    export let workspaceFolders: ReadonlyArray<{ uri: { fsPath: string } }> | undefined = undefined;

    /** Test helper: replace the workspaceFolders list. Pass `undefined` to clear. */
    export function _setWorkspaceFolders(
        folders: ReadonlyArray<{ uri: { fsPath: string } }> | undefined,
    ): void {
        workspaceFolders = folders;
    }

    /** Test helper: reset all mutable stub state. Call in `beforeEach`. */
    export function _reset(): void {
        for (const key of Object.keys(_config)) {
            delete _config[key];
        }
        workspaceFolders = undefined;
    }

    /**
     * FileSystemWatcher mock. Production code listens for `onDidChange` /
     * `onDidCreate` / `onDidDelete`; tests can use `.emit(kind, uri)` to
     * drive the callbacks manually.
     */
    export function createFileSystemWatcher(_pattern: any): FileSystemWatcherMock {
        return new FileSystemWatcherMock();
    }
}

// ---------------------------------------------------------------------------
// window — with spy-able message surfaces
// ---------------------------------------------------------------------------

interface MessageCall {
    /** 'warning' | 'error' | 'information' */
    level: 'warning' | 'error' | 'information';
    message: string;
    items: any[];
}

/** Programmed response for the NEXT call of the given level. */
const _nextResponse: { warning?: any; error?: any; information?: any } = {};

export namespace window {
    /** Every message call recorded in order. Tests may inspect or `.length = 0`. */
    export const messageCalls: MessageCall[] = [];

    /** Convenience filter — only the information-level calls. */
    export function informationCalls(): MessageCall[] {
        return messageCalls.filter((c) => c.level === 'information');
    }
    export function errorCalls(): MessageCall[] {
        return messageCalls.filter((c) => c.level === 'error');
    }
    export function warningCalls(): MessageCall[] {
        return messageCalls.filter((c) => c.level === 'warning');
    }

    /** Test helper: clear every recorded call + programmed response. */
    export function _resetMessages(): void {
        messageCalls.length = 0;
        delete _nextResponse.warning;
        delete _nextResponse.error;
        delete _nextResponse.information;
    }

    /**
     * Test helper: program the value the NEXT `showInformationMessage`
     * (or `showErrorMessage` / `showWarningMessage`) will resolve to.
     * This lets tests assert on the "user clicked 'Open Gallery'" branch.
     */
    export function _programNextResponse(level: 'warning' | 'error' | 'information', value: any): void {
        _nextResponse[level] = value;
    }

    export function showWarningMessage(msg: string, ...items: any[]): any {
        messageCalls.push({ level: 'warning', message: msg, items });
        const v = _nextResponse.warning;
        delete _nextResponse.warning;
        return Promise.resolve(v);
    }
    export function showErrorMessage(msg: string, ...items: any[]): any {
        messageCalls.push({ level: 'error', message: msg, items });
        const v = _nextResponse.error;
        delete _nextResponse.error;
        return Promise.resolve(v);
    }
    export function showInformationMessage(msg: string, ...items: any[]): any {
        messageCalls.push({ level: 'information', message: msg, items });
        const v = _nextResponse.information;
        delete _nextResponse.information;
        return Promise.resolve(v);
    }

    // ── Input primitives ────────────────────────────────────────────────────
    //
    // Tests queue a sequence of responses via `_queueInput(...)` — each call
    // of `showInputBox` / `showQuickPick` shifts the next value off the queue.
    // A missing response returns `undefined` (the "user hit Escape" shape).

    const _inputQueue: any[] = [];
    const _quickPickQueue: any[] = [];

    export function _queueInput(...values: any[]): void {
        _inputQueue.push(...values);
    }
    export function _queueQuickPick(...values: any[]): void {
        _quickPickQueue.push(...values);
    }
    export function _resetInputs(): void {
        _inputQueue.length = 0;
        _quickPickQueue.length = 0;
    }

    export function showInputBox(_options?: any): any {
        const v = _inputQueue.shift();
        return Promise.resolve(v);
    }
    export function showQuickPick(_items: any[], _options?: any): any {
        const v = _quickPickQueue.shift();
        return Promise.resolve(v);
    }

    export function createOutputChannel(_name: string): any {
        const lines: string[] = [];
        return {
            appendLine: (s: string) => {
                lines.push(s);
            },
            show: () => {},
            dispose: () => {},
            _lines: lines, // test-only inspection hook
        };
    }
    export function createStatusBarItem(..._args: any[]): any {
        return {
            text: '',
            tooltip: '',
            show: () => {},
            hide: () => {},
            dispose: () => {},
        };
    }

    // ── TreeView surfaces (FT-5 / FT-036) ───────────────────────────────────

    /** Record of every TreeView registration. */
    export const registeredTreeProviders: Array<{ viewId: string; provider: any }> = [];

    export function registerTreeDataProvider(viewId: string, provider: any): any {
        registeredTreeProviders.push({ viewId, provider });
        return { dispose: () => {} };
    }

    export function createTreeView(viewId: string, options: { treeDataProvider: any }): any {
        registeredTreeProviders.push({ viewId, provider: options.treeDataProvider });
        return {
            dispose: () => {},
            reveal: () => Promise.resolve(),
        };
    }

    export function _resetTreeViews(): void {
        registeredTreeProviders.length = 0;
    }
}

// ---------------------------------------------------------------------------
// commands — tracked registrations
// ---------------------------------------------------------------------------

interface RegisteredCommand {
    id: string;
    handler: (...args: any[]) => any;
}

export namespace commands {
    /** Every command registration recorded in order. */
    export const registered: RegisteredCommand[] = [];

    export function registerCommand(id: string, handler: (...args: any[]) => any): any {
        registered.push({ id, handler });
        return { dispose: () => {} };
    }

    /** Resolve a registered command's handler — `undefined` if not registered. */
    export function _getHandler(id: string): ((...args: any[]) => any) | undefined {
        const entry = registered.find((c) => c.id === id);
        return entry?.handler;
    }

    /** Invoke a registered command's handler directly (test-only). */
    export function _invoke(id: string, ...args: any[]): any {
        const handler = _getHandler(id);
        if (!handler) {
            throw new Error(`command "${id}" is not registered`);
        }
        return handler(...args);
    }

    export function _reset(): void {
        registered.length = 0;
    }

    export function executeCommand(_id: string, ..._args: any[]): any {
        return Promise.resolve(undefined);
    }
}

export enum StatusBarAlignment {
    Left = 1,
    Right = 2,
}

export class Uri {
    static file(p: string): Uri { return new Uri(p); }
    readonly fsPath: string;
    private constructor(p: string) { this.fsPath = p; }
}

// ---------------------------------------------------------------------------
// TreeView shapes
// ---------------------------------------------------------------------------

export enum TreeItemCollapsibleState {
    None = 0,
    Collapsed = 1,
    Expanded = 2,
}

export class TreeItem {
    label: string | undefined;
    collapsibleState: TreeItemCollapsibleState | undefined;
    contextValue?: string;
    tooltip?: string | { value: string };
    description?: string | boolean;
    iconPath?: any;
    command?: { command: string; title: string; arguments?: any[] };
    resourceUri?: any;

    constructor(
        label: string,
        collapsibleState?: TreeItemCollapsibleState,
    ) {
        this.label = label;
        this.collapsibleState = collapsibleState;
    }
}

export class ThemeIcon {
    static File = new ThemeIcon('file');
    static Folder = new ThemeIcon('folder');
    readonly id: string;
    constructor(id: string) {
        this.id = id;
    }
}

/**
 * Stub EventEmitter that mirrors the `vscode.EventEmitter<T>` contract the
 * runHistoryProvider relies on. `event` is a subscribe function returning
 * a disposable. `fire(data)` synchronously invokes every listener.
 */
export class EventEmitter<T> {
    private listeners: Array<(e: T) => void> = [];
    readonly event = (listener: (e: T) => void): { dispose: () => void } => {
        this.listeners.push(listener);
        return {
            dispose: () => {
                const idx = this.listeners.indexOf(listener);
                if (idx >= 0) this.listeners.splice(idx, 1);
            },
        };
    };
    fire(data: T): void {
        for (const l of this.listeners.slice()) {
            try {
                l(data);
            } catch {
                /* swallow — test runners surface errors via their own rails */
            }
        }
    }
    dispose(): void {
        this.listeners.length = 0;
    }
}

// ---------------------------------------------------------------------------
// FileSystemWatcher mock
// ---------------------------------------------------------------------------

class FileSystemWatcherMock {
    private changeListeners: Array<(uri: Uri) => void> = [];
    private createListeners: Array<(uri: Uri) => void> = [];
    private deleteListeners: Array<(uri: Uri) => void> = [];

    onDidChange = (cb: (uri: Uri) => void) => {
        this.changeListeners.push(cb);
        return { dispose: () => {} };
    };
    onDidCreate = (cb: (uri: Uri) => void) => {
        this.createListeners.push(cb);
        return { dispose: () => {} };
    };
    onDidDelete = (cb: (uri: Uri) => void) => {
        this.deleteListeners.push(cb);
        return { dispose: () => {} };
    };

    /** Test helper — drive the watcher manually. */
    emit(kind: 'change' | 'create' | 'delete', uri: Uri): void {
        const bucket =
            kind === 'change'
                ? this.changeListeners
                : kind === 'create'
                    ? this.createListeners
                    : this.deleteListeners;
        for (const cb of bucket.slice()) cb(uri);
    }

    dispose(): void {
        this.changeListeners.length = 0;
        this.createListeners.length = 0;
        this.deleteListeners.length = 0;
    }
}

// Export as a nested type for `instanceof` reach from tests.
export type FileSystemWatcher = FileSystemWatcherMock;

// ---------------------------------------------------------------------------
// ExtensionContext shape for activate() tests (FT-035).
// ---------------------------------------------------------------------------

/** Test helper: build a minimal ExtensionContext the activate() function expects. */
export function _makeExtensionContext(): {
    subscriptions: Array<{ dispose: () => void }>;
    extensionPath: string;
    globalState: any;
    workspaceState: any;
} {
    return {
        subscriptions: [],
        extensionPath: '/tmp/ext',
        globalState: { get: () => undefined, update: () => Promise.resolve() },
        workspaceState: { get: () => undefined, update: () => Promise.resolve() },
    };
}
