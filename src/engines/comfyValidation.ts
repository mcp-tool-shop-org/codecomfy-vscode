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
    /**
     * Optional dotted path of the field that failed validation, e.g.
     * `status.completed` or `outputs[9].images[0].filename`. When present,
     * callers can surface a version-mismatch hint with the exact field that
     * broke. Undefined when the error is not tied to a single field
     * (e.g. "response is not a JSON object").
     */
    readonly fieldPath?: string;

    constructor(kind: string, message: string, rawBody: unknown, fieldPath?: string) {
        super(message);
        this.name = 'ComfyResponseError';
        this.responseKind = kind;
        // JSON.stringify returns undefined for undefined/function/symbol; fall back to String().
        this.rawBody = truncate(JSON.stringify(rawBody) ?? String(rawBody), 2000);
        this.fieldPath = fieldPath;
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
            'prompt_id',
        );
    }

    if (typeof obj.number !== 'number') {
        throw new ComfyResponseError(
            'prompt_response',
            `Missing or invalid "number" field (got ${typeof obj.number}).`,
            body,
            'number',
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
            'node_errors',
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

/** A `{filename, subfolder, type}` triple as ComfyUI reports saved files. */
export interface ValidatedFileRef {
    filename: string;
    subfolder: string;
    type: string;
}

/**
 * One node's entry in `/history` outputs.
 *
 * ComfyUI keys saved files by the terminator that wrote them, and the key is
 * NOT uniform: `SaveImage` and `SaveVideo` both use `images`, `VHS_VideoCombine`
 * uses `gifs`, `SaveAudioAdvanced` uses `audio`, `SaveGLB` uses `3d`, and
 * `SaveText` uses `text` (inline strings) plus `files` (what it wrote).
 *
 * Validating only `images` — as versions through 1.2.0 did — silently discards
 * the output of every audio, 3D, inference and VHS-terminated video preset, so
 * every file-bearing key is preserved here and `text` is carried through as
 * inline strings.
 */
export interface ValidatedNodeOutput {
    images?: ValidatedFileRef[];
    gifs?: ValidatedFileRef[];
    audio?: ValidatedFileRef[];
    /** `SaveGLB` — the key really is the digit-leading string `3d`. */
    '3d'?: ValidatedFileRef[];
    files?: ValidatedFileRef[];
    /** `SaveText` reports its content inline, not as a file reference. */
    text?: string[];
}

/**
 * Every `/history` output key that carries file references. Order is stable so
 * collectors iterate deterministically.
 */
export const FILE_OUTPUT_KEYS = [
    'images',
    'gifs',
    'audio',
    '3d',
    'files',
] as const;

export type FileOutputKey = (typeof FILE_OUTPUT_KEYS)[number];

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
        throw new ComfyResponseError(
            'history_entry',
            'Missing or invalid "status" object.',
            body,
            'status',
        );
    }

    const statusObj = obj.status as Record<string, unknown>;
    if (typeof statusObj.completed !== 'boolean') {
        throw new ComfyResponseError(
            'history_entry',
            `Missing or invalid "status.completed" (got ${typeof statusObj.completed}).`,
            body,
            'status.completed',
        );
    }

    const status = {
        status_str: typeof statusObj.status_str === 'string' ? statusObj.status_str : 'unknown',
        completed: statusObj.completed as boolean,
    };

    // --- outputs ---
    if (!isObject(obj.outputs)) {
        throw new ComfyResponseError(
            'history_entry',
            'Missing or invalid "outputs" object.',
            body,
            'outputs',
        );
    }

    const rawOutputs = obj.outputs as Record<string, unknown>;
    const outputs: Record<string, ValidatedNodeOutput> = {};

    for (const [nodeId, nodeOut] of Object.entries(rawOutputs)) {
        if (!isObject(nodeOut)) continue;
        const nodeObj = nodeOut as Record<string, unknown>;

        const validatedNode: ValidatedNodeOutput = {};

        for (const key of FILE_OUTPUT_KEYS) {
            const raw = nodeObj[key];
            if (!Array.isArray(raw)) continue;

            const refs: ValidatedFileRef[] = [];
            for (const item of raw) {
                if (!isObject(item)) continue;
                const itemObj = item as Record<string, unknown>;
                if (typeof itemObj.filename !== 'string') continue;

                refs.push({
                    filename: itemObj.filename,
                    subfolder: typeof itemObj.subfolder === 'string' ? itemObj.subfolder : '',
                    type: typeof itemObj.type === 'string' ? itemObj.type : 'output',
                });
            }
            if (refs.length > 0) {
                validatedNode[key] = refs;
            }
        }

        // `SaveText` reports its result inline as an array of strings rather
        // than as file references, so it needs its own branch.
        if (Array.isArray(nodeObj.text)) {
            const texts = nodeObj.text.filter((t): t is string => typeof t === 'string');
            if (texts.length > 0) {
                validatedNode.text = texts;
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
            'non-string',
        );
    }

    const name = raw;

    if (name.trim().length === 0) {
        throw new ComfyResponseError(
            'filename',
            'Filename is empty or whitespace-only.',
            raw,
            'empty',
        );
    }

    if (name.includes('\0')) {
        throw new ComfyResponseError(
            'filename',
            'Filename contains a null byte.',
            raw,
            'null-byte',
        );
    }

    if (name.includes('/') || name.includes('\\')) {
        throw new ComfyResponseError(
            'filename',
            `Filename must be a bare leaf name (no path separators): "${name}".`,
            raw,
            'path-separator',
        );
    }

    if (TRAVERSAL_PATTERN.test(name) || name === '..' || name === '.') {
        throw new ComfyResponseError(
            'filename',
            `Filename contains path-traversal segment: "${name}".`,
            raw,
            'path-traversal',
        );
    }

    // Absolute-path guards (covers POSIX `/foo`, Windows `C:\foo`, `\\server\share`)
    if (path.isAbsolute(name)) {
        throw new ComfyResponseError(
            'filename',
            `Filename must not be absolute: "${name}".`,
            raw,
            'absolute-path',
        );
    }

    // Defence-in-depth: basename must round-trip to itself.
    if (path.basename(name) !== name) {
        throw new ComfyResponseError(
            'filename',
            `Filename failed basename round-trip check: "${name}".`,
            raw,
            'basename-mismatch',
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
