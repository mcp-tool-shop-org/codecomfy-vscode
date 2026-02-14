/**
 * Runtime shape guards for ComfyUI HTTP API responses.
 *
 * Every response from ComfyUI is `unknown` at the trust boundary. These
 * validators narrow the type at runtime and produce structured error messages
 * with enough detail for the Output channel when something unexpected arrives.
 */

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function truncate(str: string, max: number): string {
    return str.length > max ? str.slice(0, max) + '…' : str;
}
