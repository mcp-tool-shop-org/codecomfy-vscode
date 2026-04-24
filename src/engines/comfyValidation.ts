/**
 * Runtime shape guards for ComfyUI HTTP API responses.
 *
 * Every response from ComfyUI is `unknown` at the trust boundary. These
 * validators narrow the type at runtime and produce structured error messages
 * with enough detail for the Output channel when something unexpected arrives.
 */

import * as path from 'path';

// ── Typed error ───────────────────────────────────────────────────────────────

export class ComfyResponseError extends Error {
    /** Short human label, e.g. "prompt_response" or "history_entry". */
    readonly responseKind: string;
    /** The raw body that failed validation (truncated for safety). */
    readonly rawBody: string;

    constructor(kind: string, message: string, rawBody: unknown) {
        super(message);
        this.name = 'ComfyResponseError';
        this.responseKind = kind;
        this.rawBody = truncate(JSON.stringify(rawBody), 2000);
    }
}

// ── Prompt submission response ────────────────────────────────────────────────

export interface ValidatedPromptResponse {
    prompt_id: string;
    number: number;
    node_errors: Record<string, unknown>;
}

/**
 * Validate the JSON body returned by `POST /prompt`.
 *
 * Expected shape:
 * ```json
 * { "prompt_id": "<uuid>", "number": 42, "node_errors": {} }
 * ```
 */
export function validatePromptResponse(body: unknown): ValidatedPromptResponse {
    if (!isObject(body)) {
        throw new ComfyResponseError('prompt_response', 'Response is not a JSON object.', body);
    }

    const obj = body as Record<string, unknown>;

    if (typeof obj.prompt_id !== 'string' || obj.prompt_id.length === 0) {
        throw new ComfyResponseError(
            'prompt_response',
            `Missing or invalid "prompt_id" (got ${typeof obj.prompt_id}).`,
            body,
        );
    }

    if (typeof obj.number !== 'number') {
        throw new ComfyResponseError(
            'prompt_response',
            `Missing or invalid "number" field (got ${typeof obj.number}).`,
            body,
        );
    }

    // node_errors is optional — some ComfyUI versions omit it
    const nodeErrors = isObject(obj.node_errors)
        ? (obj.node_errors as Record<string, unknown>)
        : {};

    // Surface node-level errors early
    if (Object.keys(nodeErrors).length > 0) {
        const summary = Object.entries(nodeErrors)
            .map(([nodeId, err]) => `  node ${nodeId}: ${JSON.stringify(err)}`)
            .join('\n');
        throw new ComfyResponseError(
            'prompt_response',
            `ComfyUI reported node errors:\n${summary}`,
            body,
        );
    }

    return {
        prompt_id: obj.prompt_id as string,
        number: obj.number as number,
        node_errors: nodeErrors,
    };
}

// ── History entry ─────────────────────────────────────────────────────────────

export interface ValidatedHistoryEntry {
    outputs: Record<string, ValidatedNodeOutput>;
    status: { status_str: string; completed: boolean };
}

export interface ValidatedNodeOutput {
    images?: Array<{ filename: string; subfolder: string; type: string }>;
}

/**
 * Validate a single history entry from `GET /history/{prompt_id}`.
 *
 * Expected shape:
 * ```json
 * {
 *   "outputs": { "<nodeId>": { "images": [ { "filename": "...", "subfolder": "...", "type": "..." } ] } },
 *   "status":  { "status_str": "success", "completed": true }
 * }
 * ```
 */
export function validateHistoryEntry(body: unknown): ValidatedHistoryEntry {
    if (!isObject(body)) {
        throw new ComfyResponseError('history_entry', 'History entry is not a JSON object.', body);
    }

    const obj = body as Record<string, unknown>;

    // --- status ---
    if (!isObject(obj.status)) {
        throw new ComfyResponseError('history_entry', 'Missing or invalid "status" object.', body);
    }

    const statusObj = obj.status as Record<string, unknown>;
    if (typeof statusObj.completed !== 'boolean') {
        throw new ComfyResponseError(
            'history_entry',
            `Missing or invalid "status.completed" (got ${typeof statusObj.completed}).`,
            body,
        );
    }

    const status = {
        status_str: typeof statusObj.status_str === 'string' ? statusObj.status_str : 'unknown',
        completed: statusObj.completed as boolean,
    };

    // --- outputs ---
    if (!isObject(obj.outputs)) {
        throw new ComfyResponseError('history_entry', 'Missing or invalid "outputs" object.', body);
    }

    const rawOutputs = obj.outputs as Record<string, unknown>;
    const outputs: Record<string, ValidatedNodeOutput> = {};

    for (const [nodeId, nodeOut] of Object.entries(rawOutputs)) {
        if (!isObject(nodeOut)) continue;
        const nodeObj = nodeOut as Record<string, unknown>;

        const validatedNode: ValidatedNodeOutput = {};

        if (Array.isArray(nodeObj.images)) {
            validatedNode.images = [];
            for (const img of nodeObj.images) {
                if (!isObject(img)) continue;
                const imgObj = img as Record<string, unknown>;
                if (typeof imgObj.filename !== 'string') continue;

                validatedNode.images.push({
                    filename: imgObj.filename,
                    subfolder: typeof imgObj.subfolder === 'string' ? imgObj.subfolder : '',
                    type: typeof imgObj.type === 'string' ? imgObj.type : 'output',
                });
            }
        }

        outputs[nodeId] = validatedNode;
    }

    return { outputs, status };
}

/**
 * Validate the top-level history response from `GET /history/{prompt_id}`.
 *
 * Returns the entry for the given promptId, or null if the entry is not
 * present (i.e. job has not finished yet).
 */
export function validateHistoryResponse(
    body: unknown,
    promptId: string,
): ValidatedHistoryEntry | null {
    if (!isObject(body)) {
        throw new ComfyResponseError(
            'history_response',
            'History response is not a JSON object.',
            body,
        );
    }

    const obj = body as Record<string, unknown>;
    const entry = obj[promptId];

    // Entry not present yet — job still running
    if (entry === undefined) {
        return null;
    }

    return validateHistoryEntry(entry);
}

// ── Filename sanitisation ─────────────────────────────────────────────────────

/**
 * Patterns that indicate a filename is unsafe for local filesystem writes.
 *
 * ComfyUI returns filenames in history responses. A compromised or malicious
 * server could craft names like `../../../etc/shadow.png` or `C:\\Windows\\x.png`
 * to escape the intended run folder. We reject anything that isn't a plain
 * leaf name (no separators, no traversal segments, no null bytes, not absolute).
 */
const TRAVERSAL_PATTERN = /(^|[\\/])\.\.([\\/]|$)/;

/**
 * Validate and return a safe leaf filename from an untrusted ComfyUI response.
 *
 * Throws `ComfyResponseError` on any unsafe input. Callers should pass the
 * returned string into `path.join(safeDir, result)` — the result is guaranteed
 * to be a bare basename with no separators, null bytes, or traversal segments.
 *
 * Rejects:
 *   - Empty or whitespace-only strings
 *   - Null bytes (`\0`)
 *   - Path separators (`/` or `\`)
 *   - Parent-traversal segments (`..`)
 *   - Absolute paths (POSIX `/foo` or Windows `C:\foo`)
 *   - Anything where `path.basename(input) !== input` (catches platform-specific edge cases)
 */
export function sanitizeComfyFilename(raw: unknown): string {
    if (typeof raw !== 'string') {
        throw new ComfyResponseError(
            'filename',
            `Expected filename to be a string (got ${typeof raw}).`,
            raw,
        );
    }

    const name = raw;

    if (name.trim().length === 0) {
        throw new ComfyResponseError(
            'filename',
            'Filename is empty or whitespace-only.',
            raw,
        );
    }

    if (name.includes('\0')) {
        throw new ComfyResponseError(
            'filename',
            'Filename contains a null byte.',
            raw,
        );
    }

    if (name.includes('/') || name.includes('\\')) {
        throw new ComfyResponseError(
            'filename',
            `Filename must be a bare leaf name (no path separators): "${name}".`,
            raw,
        );
    }

    if (TRAVERSAL_PATTERN.test(name) || name === '..' || name === '.') {
        throw new ComfyResponseError(
            'filename',
            `Filename contains path-traversal segment: "${name}".`,
            raw,
        );
    }

    // Absolute-path guards (covers POSIX `/foo`, Windows `C:\foo`, `\\server\share`)
    if (path.isAbsolute(name)) {
        throw new ComfyResponseError(
            'filename',
            `Filename must not be absolute: "${name}".`,
            raw,
        );
    }

    // Defence-in-depth: basename must round-trip to itself.
    if (path.basename(name) !== name) {
        throw new ComfyResponseError(
            'filename',
            `Filename failed basename round-trip check: "${name}".`,
            raw,
        );
    }

    return name;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function truncate(str: string, max: number): string {
    return str.length > max ? str.slice(0, max) + '…' : str;
}
