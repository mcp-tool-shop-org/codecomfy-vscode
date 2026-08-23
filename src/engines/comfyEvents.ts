/**
 * ComfyUI's WebSocket event stream.
 *
 * Until 1.3.0 CodeComfy only polled `GET /history/{prompt_id}`, which returns
 * nothing at all until a job is finished. That made the status bar a single
 * static string for the entire multi-minute tail of a video run, and it made
 * completion detection fragile: `/history` is an in-memory ring evicted by
 * count (`MAXIMUM_HISTORY_SIZE = 10000`) that does not survive a server
 * restart, so a polled id can become permanently unresolvable even though the
 * job succeeded — and the poller would report a failure for a successful run.
 *
 * The socket fixes both. It reports per-step progress live, and it announces
 * completion the moment it happens, before any eviction can occur.
 *
 * WHAT IS AND IS NOT AUTHORITATIVE
 * --------------------------------
 * The socket is strictly an OPTIMISATION. Nothing in the artifact path exists
 * only on it — `/history/{id}` remains the source of truth for what a run
 * produced, and polling remains a complete fallback. A dropped socket is not
 * replayed by the server, so this module never treats socket silence as
 * failure: it degrades to polling instead.
 *
 * Verified against ComfyUI 0.23.0 source:
 *   • `GET /ws` reads `clientId` from the query string; if omitted the server
 *     mints `uuid.uuid4().hex` and returns it in the first `status` message as
 *     `data.sid` (server.py:257-276).
 *   • On connect the server proactively sends `executing` with its
 *     `last_node_id`, so a reconnecting client learns the current node without
 *     asking (server.py:278).
 *   • Event names: `execution_start`, `execution_cached`, `executing`,
 *     `progress`, `executed`, `execution_error`, `execution_interrupted`,
 *     `execution_success`, `progress_state` (execution.py, progress.py).
 *   • `display_node` is a FIELD inside `executing`/`executed`, not an event
 *     type of its own.
 *   • Binary preview frames are `[uint32 eventType][uint32 imageType][bytes]`,
 *     imageType 1=JPEG 2=PNG (server.py:1142, 1158-1169).
 */

import { Logger, createNullLogger } from '../logging/logger';

/** Why a run stopped, as reported by the socket. */
export type TerminalReason =
    | 'success'
    | 'error'
    | 'interrupted'
    /** The socket dropped or never delivered a terminal event. Fall back to polling. */
    | 'unavailable';

export interface TerminalOutcome {
    reason: TerminalReason;
    /** Present for `error` — ComfyUI's exception message. */
    detail?: string;
}

/** Live progress as reported by the server. */
export interface ComfyProgress {
    /** Current step within the executing node. */
    value: number;
    /** Total steps that node will report. */
    max: number;
    /** Node id currently executing, when known. */
    node?: string;
}

export type ProgressListener = (progress: ComfyProgress) => void;
export type NodeListener = (nodeId: string | null) => void;

/**
 * Cap on events buffered before the prompt id is known. The real window is a
 * few statements wide, so anything beyond this is a misbehaving server rather
 * than a backlog worth keeping.
 */
const MAX_PENDING_EVENTS = 256;

interface RawMessage {
    type?: string;
    data?: Record<string, unknown>;
}

/**
 * True when this runtime can open a WebSocket without a bundled library.
 *
 * A global `WebSocket` landed in Node 21 and is stable in Node 22. VS Code
 * builds on older Electron/Node do not have it, and CodeComfy deliberately
 * ships zero runtime dependencies, so rather than vendor a socket library we
 * feature-detect and let those installs keep the polling behaviour they have
 * always had.
 */
export function isEventStreamSupported(): boolean {
    return typeof (globalThis as { WebSocket?: unknown }).WebSocket === 'function';
}

/** Derive the ws(s):// origin for `/ws` from the configured http(s) URL. */
export function toWebSocketUrl(serverUrl: string, clientId: string): string {
    const base = serverUrl.replace(/\/$/, '');
    const scheme = base.startsWith('https://') ? 'wss://' : 'ws://';
    const hostAndPath = base.replace(/^https?:\/\//, '');
    return `${scheme}${hostAndPath}/ws?clientId=${encodeURIComponent(clientId)}`;
}

/**
 * Interpret one decoded event.
 *
 * Exported so the parsing rules can be unit-tested without a socket. Returns
 * `null` for events that carry no state we act on.
 */
export function interpretMessage(
    msg: RawMessage,
    promptId: string,
):
    | { kind: 'progress'; progress: ComfyProgress }
    | { kind: 'node'; node: string | null }
    | { kind: 'terminal'; outcome: TerminalOutcome }
    | null {
    const type = msg.type;
    const data = msg.data ?? {};

    // Events that name a prompt must name OURS. `status` carries none and is
    // queue-wide, so it is exempt.
    const eventPromptId = typeof data.prompt_id === 'string' ? data.prompt_id : undefined;
    if (eventPromptId !== undefined && eventPromptId !== promptId) return null;

    switch (type) {
        case 'progress': {
            const value = typeof data.value === 'number' ? data.value : undefined;
            const max = typeof data.max === 'number' ? data.max : undefined;
            if (value === undefined || max === undefined || max <= 0) return null;
            return {
                kind: 'progress',
                progress: {
                    value,
                    max,
                    node: typeof data.node === 'string' ? data.node : undefined,
                },
            };
        }

        case 'executing': {
            // `node: null` is the LEGACY completion signal, still emitted by
            // servers that predate `execution_success`. It only means "done"
            // when it names our prompt — and on older servers it may carry no
            // prompt_id at all, in which case we accept it, because the socket
            // is bound to our client_id and only our job's events arrive.
            const node = typeof data.node === 'string' ? data.node : null;
            if (node === null) {
                return { kind: 'terminal', outcome: { reason: 'success' } };
            }
            return { kind: 'node', node };
        }

        case 'execution_success':
            return { kind: 'terminal', outcome: { reason: 'success' } };

        case 'execution_error': {
            const message =
                typeof data.exception_message === 'string'
                    ? data.exception_message
                    : undefined;
            const nodeType = typeof data.node_type === 'string' ? data.node_type : undefined;
            return {
                kind: 'terminal',
                outcome: {
                    reason: 'error',
                    detail: nodeType && message ? `${nodeType}: ${message}` : message,
                },
            };
        }

        case 'execution_interrupted':
            return { kind: 'terminal', outcome: { reason: 'interrupted' } };

        default:
            // `status`, `execution_start`, `execution_cached`, `executed`,
            // `progress_state`, and anything a future server adds are all
            // observed but carry no state this client acts on.
            return null;
    }
}

/**
 * A single job's live event feed.
 *
 * Usage is deliberately one-shot: construct, `connect()`, submit the prompt
 * with the same `clientId`, `await waitForTerminal()`, then `close()`.
 */
export class ComfyEventStream {
    readonly clientId: string;

    private socket: WebSocket | null = null;
    private readonly serverUrl: string;
    private readonly logger: Logger;

    private progressListener: ProgressListener | null = null;
    private nodeListener: NodeListener | null = null;

    /** Resolved once a terminal event arrives (or the socket gives up). */
    private terminalResolve: ((outcome: TerminalOutcome) => void) | null = null;
    private terminalOutcome: TerminalOutcome | null = null;
    private promptId: string | null = null;
    /** Events seen before the prompt id was known, replayed once it is. */
    private pending: RawMessage[] = [];

    constructor(serverUrl: string, clientId: string, logger?: Logger) {
        this.serverUrl = serverUrl.replace(/\/$/, '');
        this.clientId = clientId;
        this.logger = (logger ?? createNullLogger('ComfyEvents')).child('ws');
    }

    onProgress(listener: ProgressListener): void {
        this.progressListener = listener;
    }

    onNode(listener: NodeListener): void {
        this.nodeListener = listener;
    }

    /**
     * Open the socket. Resolves `false` when the runtime has no WebSocket or
     * the connection fails — callers then poll, which is always sufficient.
     */
    async connect(timeoutMs = 5000): Promise<boolean> {
        if (!isEventStreamSupported()) {
            this.logger.info(
                'Live progress unavailable — this VS Code build has no WebSocket. ' +
                'Falling back to /history polling (outputs are unaffected).',
            );
            return false;
        }

        const url = toWebSocketUrl(this.serverUrl, this.clientId);

        return new Promise<boolean>((resolve) => {
            let settled = false;
            const settleOnce = (ok: boolean): void => {
                if (settled) return;
                settled = true;
                resolve(ok);
            };

            let socket: WebSocket;
            try {
                socket = new WebSocket(url);
            } catch (err) {
                this.logger.warn(
                    'Could not open the ComfyUI event socket; using polling instead.',
                    err instanceof Error ? err.message : String(err),
                );
                settleOnce(false);
                return;
            }

            this.socket = socket;
            const timer = setTimeout(() => {
                if (!settled) {
                    this.logger.warn(
                        `Event socket did not open within ${timeoutMs}ms; using polling instead.`,
                    );
                    try { socket.close(); } catch { /* already closing */ }
                    settleOnce(false);
                }
            }, timeoutMs);

            socket.onopen = (): void => {
                clearTimeout(timer);
                this.logger.info(`Live progress connected (clientId ${this.clientId}).`);
                settleOnce(true);
            };

            socket.onerror = (): void => {
                clearTimeout(timer);
                // An error after a successful open is a mid-run drop; the
                // terminal wait resolves `unavailable` and the caller polls.
                this.logger.warn('Event socket error — falling back to polling.');
                this.settleTerminal({ reason: 'unavailable' });
                settleOnce(false);
            };

            socket.onclose = (): void => {
                clearTimeout(timer);
                this.settleTerminal({ reason: 'unavailable' });
                settleOnce(false);
            };

            socket.onmessage = (event: MessageEvent): void => {
                this.handleMessage(event.data);
            };
        });
    }

    /**
     * Wait for this prompt to reach a terminal state.
     *
     * `unavailable` means "ask /history instead", never "the run failed".
     */
    waitForTerminal(promptId: string, timeoutMs: number): Promise<TerminalOutcome> {
        this.promptId = promptId;

        // Replay anything that arrived before we knew the id. A cached job can
        // complete inside that window, and dropping its terminal event would
        // cost a full timeout before the polling fallback noticed.
        const buffered = this.pending;
        this.pending = [];
        for (const msg of buffered) this.dispatch(msg);

        if (this.terminalOutcome) return Promise.resolve(this.terminalOutcome);
        if (!this.socket) return Promise.resolve({ reason: 'unavailable' });

        return new Promise<TerminalOutcome>((resolve) => {
            this.terminalResolve = resolve;
            const timer = setTimeout(() => {
                this.logger.warn(
                    `No terminal event within ${Math.round(timeoutMs / 1000)}s — ` +
                    'checking /history directly.',
                );
                this.settleTerminal({ reason: 'unavailable' });
            }, timeoutMs);

            const original = this.terminalResolve;
            this.terminalResolve = (outcome): void => {
                clearTimeout(timer);
                original(outcome);
            };
        });
    }

    close(): void {
        const socket = this.socket;
        this.socket = null;
        if (!socket) return;
        try {
            socket.close();
        } catch {
            // Already closed — nothing to do.
        }
    }

    private settleTerminal(outcome: TerminalOutcome): void {
        if (this.terminalOutcome) return;
        this.terminalOutcome = outcome;
        const resolve = this.terminalResolve;
        this.terminalResolve = null;
        resolve?.(outcome);
    }

    private handleMessage(raw: unknown): void {
        // Binary frames are preview images. We do not render them yet, and a
        // Blob/ArrayBuffer would throw in JSON.parse, so they are skipped
        // rather than treated as malformed events.
        if (typeof raw !== 'string') return;

        let msg: RawMessage;
        try {
            msg = JSON.parse(raw) as RawMessage;
        } catch {
            return;
        }

        // The socket is live from before submission, so events can arrive
        // before we know which prompt id to correlate them against — a short
        // job (or a fully cached one) can finish in that window. Buffer them
        // rather than dropping them; `waitForTerminal()` replays the buffer as
        // soon as the id is known.
        if (!this.promptId) {
            if (this.pending.length < MAX_PENDING_EVENTS) this.pending.push(msg);
            return;
        }

        this.dispatch(msg);
    }

    /** Interpret one message against the known prompt id and act on it. */
    private dispatch(msg: RawMessage): void {
        if (!this.promptId) return;
        const interpreted = interpretMessage(msg, this.promptId);
        if (!interpreted) return;

        switch (interpreted.kind) {
            case 'progress':
                this.progressListener?.(interpreted.progress);
                break;
            case 'node':
                this.nodeListener?.(interpreted.node);
                break;
            case 'terminal':
                this.settleTerminal(interpreted.outcome);
                break;
        }
    }
}
