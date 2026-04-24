/**
 * ComfyUI Server Engine
 *
 * Connects to a running ComfyUI server to execute workflows.
 * POST workflow → poll for completion → collect outputs.
 *
 * For video: collects frames into run folder for FFmpeg assembly.
 * For image: saves directly to outputs folder.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import {
    IGenerationEngine,
    GenerationResult,
    JobRequest,
    Preset,
    Artifact,
    CODECOMFY_DIR,
    OUTPUTS_DIR,
    RUNS_DIR,
} from '../types';
import { BackoffTimer } from '../polling/backoff';
import {
    validatePromptResponse,
    validateHistoryResponse,
    ValidatedPromptResponse,
    ValidatedHistoryEntry,
    ComfyResponseError,
    sanitizeComfyFilename,
} from './comfyValidation';
import { Logger, createNullLogger } from '../logging/logger';

/**
 * Structured availability result from `getAvailability()`. The legacy
 * `isAvailable(): boolean` method is preserved for the `IGenerationEngine`
 * contract; callers that need the reason for failure should use
 * `getAvailability()` and compose a user-facing message from `reason` +
 * `detail`.
 */
export type AvailabilityResult =
    | { ok: true }
    | {
        ok: false;
        /**
         * `refused`    — ECONNREFUSED (server not running).
         * `timeout`    — abort/timeout (server hung or starting up).
         * `bad-url`    — URL couldn't be parsed/fetched (config error).
         * `http-error` — server responded with a non-2xx status.
         * `unknown`    — anything else (shouldn't normally happen).
         */
        reason: 'refused' | 'timeout' | 'bad-url' | 'http-error' | 'unknown';
        detail: string;
    };

export class ComfyServerEngine implements IGenerationEngine {
    readonly id = 'comfy-server';
    readonly name = 'ComfyUI Server';

    private serverUrl: string;
    private currentPromptId: string | null = null;
    private canceled = false;
    private logger: Logger;

    /**
     * Construct a new engine. The optional `logger` argument is injected by
     * the router; tests pass `undefined` and get a silent null-logger so
     * output channels are not required.
     */
    constructor(serverUrl: string = 'http://127.0.0.1:8188', logger?: Logger) {
        this.serverUrl = serverUrl.replace(/\/$/, '');
        this.logger = logger ?? createNullLogger('ComfyServerEngine');
    }

    /**
     * Legacy boolean availability check. Kept for the `IGenerationEngine`
     * contract — callers that want to tell the user *why* ComfyUI is
     * unreachable should use `getAvailability()` instead.
     */
    async isAvailable(): Promise<boolean> {
        const result = await this.getAvailability();
        return result.ok;
    }

    /**
     * Structured availability check. Distinguishes between server-not-running
     * (refused), hung/starting-up (timeout), config error (bad-url), and
     * non-2xx HTTP responses. Router-side callers compose the user-facing
     * error from `reason` + `detail`.
     */
    async getAvailability(): Promise<AvailabilityResult> {
        try {
            const response = await fetch(`${this.serverUrl}/system_stats`, {
                method: 'GET',
                signal: AbortSignal.timeout(5000),
            });
            if (response.ok) {
                return { ok: true };
            }
            return {
                ok: false,
                reason: 'http-error',
                detail: `HTTP ${response.status} from ${this.serverUrl}/system_stats. ` +
                    `The URL may point to a different service.`,
            };
        } catch (err) {
            return classifyAvailabilityError(err, this.serverUrl);
        }
    }

    async generate(request: JobRequest, preset: Preset): Promise<GenerationResult> {
        this.canceled = false;

        const availability = await this.getAvailability();
        if (!availability.ok) {
            return {
                success: false,
                artifacts: [],
                error: composeAvailabilityMessage(availability, this.serverUrl),
            };
        }

        const workflow = this.buildWorkflow(preset, request);
        if (!workflow) {
            return {
                success: false,
                artifacts: [],
                error: 'Preset has no workflow defined.',
            };
        }

        try {
            const promptResponse = await this.submitPrompt(workflow);
            if (!promptResponse) {
                return {
                    success: false,
                    artifacts: [],
                    error: 'Failed to submit prompt to ComfyUI.',
                };
            }

            this.currentPromptId = promptResponse.prompt_id;

            // Video generation can take much longer
            const timeoutMs = request.kind === 'video' ? 600000 : 300000;
            const history = await this.pollForCompletion(promptResponse.prompt_id, timeoutMs);

            if (!history) {
                if (this.canceled) {
                    return { success: false, artifacts: [], error: 'Generation canceled.' };
                }
                return { success: false, artifacts: [], error: 'Generation timed out or failed.' };
            }

            // Collect outputs based on kind
            const artifacts = request.kind === 'video'
                ? await this.collectFrames(history, request)
                : await this.collectImages(history, request);

            if (artifacts.length === 0) {
                return {
                    success: false,
                    artifacts: [],
                    error: 'No outputs received from ComfyUI.',
                };
            }

            return { success: true, artifacts };
        } catch (err) {
            return {
                success: false,
                artifacts: [],
                error: categorizeError(err),
            };
        } finally {
            this.currentPromptId = null;
        }
    }

    async cancel(): Promise<void> {
        this.canceled = true;
        if (this.currentPromptId) {
            try {
                await fetch(`${this.serverUrl}/interrupt`, { method: 'POST' });
            } catch {
                // Ignore cancel errors
            }
        }
    }

    // =========================================================================
    // Workflow Building
    // =========================================================================

    private buildWorkflow(preset: Preset, request: JobRequest): Record<string, unknown> | null {
        if (!preset.workflow) {
            return null;
        }

        const workflow = JSON.parse(JSON.stringify(preset.workflow));

        for (const nodeId of Object.keys(workflow)) {
            const node = workflow[nodeId] as Record<string, unknown>;
            const inputs = node.inputs as Record<string, unknown> | undefined;
            if (!inputs) continue;

            const classType = node.class_type as string;

            // CLIP Text Encode - apply prompts
            if (classType?.includes('CLIPTextEncode')) {
                if (inputs.text !== undefined) {
                    const nodeTitle = (node._meta as Record<string, unknown>)?.title as string;
                    if (nodeTitle?.toLowerCase().includes('negative') || nodeId.includes('neg')) {
                        inputs.text = request.inputs.negative_prompt || '';
                    } else {
                        inputs.text = request.inputs.prompt;
                    }
                }
            }

            // KSampler - apply seed, steps, cfg
            if (classType?.includes('KSampler')) {
                if (request.inputs.seed !== undefined) {
                    inputs.seed = request.inputs.seed;
                }
                if (request.inputs.steps !== undefined) {
                    inputs.steps = request.inputs.steps;
                }
                if (request.inputs.cfg_scale !== undefined) {
                    inputs.cfg = request.inputs.cfg_scale;
                }
            }

            // EmptyLatentImage - apply dimensions and batch_size (for video frames)
            if (classType === 'EmptyLatentImage') {
                if (request.inputs.width !== undefined) {
                    inputs.width = request.inputs.width;
                }
                if (request.inputs.height !== undefined) {
                    inputs.height = request.inputs.height;
                }
                // For video: batch_size = frame_count
                if (request.kind === 'video' && request.inputs.frame_count !== undefined) {
                    inputs.batch_size = request.inputs.frame_count;
                }
            }
        }

        return { prompt: workflow };
    }

    // =========================================================================
    // Prompt Submission and Polling
    // =========================================================================

    private async submitPrompt(workflow: Record<string, unknown>): Promise<ValidatedPromptResponse | null> {
        try {
            const response = await fetch(`${this.serverUrl}/prompt`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(workflow),
                signal: AbortSignal.timeout(10000),
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`ComfyUI error (HTTP ${response.status}): ${text}`);
            }

            const body: unknown = await response.json();
            return validatePromptResponse(body);
        } catch (err) {
            if (err instanceof ComfyResponseError) {
                // Surface node-validation errors distinctly so the categoriser
                // can give the user actionable preset guidance (F-012).
                const prefix = err.fieldPath === 'node_errors'
                    ? 'ComfyUI node error'
                    : 'ComfyUI prompt response invalid';
                const fieldHint = err.fieldPath && err.fieldPath !== 'node_errors'
                    ? ` (field: ${err.fieldPath})`
                    : '';
                throw new Error(`${prefix}${fieldHint}: ${err.message}\nRaw: ${err.rawBody}`);
            }
            throw new Error(`Failed to submit prompt: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    private async pollForCompletion(promptId: string, timeoutMs = 300000): Promise<ValidatedHistoryEntry | null> {
        const startTime = Date.now();
        const backoff = new BackoffTimer();
        const pollLog = this.logger.child('poll');

        pollLog.info(
            `Polling ComfyUI /history/${promptId}... (timeout ${Math.round(timeoutMs / 1000)}s)`,
        );

        let attempts = 0;
        let lastHeartbeatMs = startTime;
        let completedEntry: ValidatedHistoryEntry | null = null;

        while (Date.now() - startTime < timeoutMs) {
            if (this.canceled) {
                pollLog.info(
                    `Poll canceled after ${attempts} attempt(s), ${formatElapsed(Date.now() - startTime)}`,
                );
                return null;
            }

            attempts++;
            try {
                const response = await fetch(`${this.serverUrl}/history/${promptId}`, {
                    signal: AbortSignal.timeout(5000),
                });
                if (!response.ok) {
                    const delay = backoff.next();
                    // Don't spam on 404 (job not yet registered) — covered by heartbeat
                    await this.sleep(delay);
                    maybeHeartbeat();
                    continue;
                }

                const body: unknown = await response.json();
                const entry = validateHistoryResponse(body, promptId);

                if (entry?.status?.completed) {
                    completedEntry = entry;
                    break;
                }

                // Entry exists but not completed — progress detected, reset backoff
                if (entry) {
                    backoff.reset();
                    pollLog.info(
                        `Progress: ComfyUI acknowledged prompt ${promptId}; ` +
                        `still generating (attempt ${attempts}, ` +
                        `elapsed ${formatElapsed(Date.now() - startTime)})`,
                    );
                }
            } catch (err) {
                // ComfyResponseError = shape mismatch — rethrow so the caller sees it
                if (err instanceof ComfyResponseError) {
                    const fieldHint = err.fieldPath
                        ? ` (missing/invalid field: ${err.fieldPath})`
                        : '';
                    pollLog.error(
                        `ComfyUI /history response invalid${fieldHint}. ` +
                        `Your ComfyUI version may be incompatible — ` +
                        `see https://github.com/mcp-tool-shop-org/codecomfy-vscode#troubleshooting`,
                        err.message,
                    );
                    throw new Error(
                        `ComfyUI history response invalid${fieldHint}: ${err.message}\n` +
                        `Raw: ${err.rawBody}`,
                    );
                }
                // Other errors (network) — let backoff grow
                pollLog.warn(
                    `Poll attempt ${attempts} failed (will retry): ` +
                    `${err instanceof Error ? err.message : String(err)}`,
                );
            }

            await this.sleep(backoff.next());
            maybeHeartbeat();
        }

        if (completedEntry) {
            pollLog.info(
                `Generation complete — ${formatElapsed(Date.now() - startTime)} total, ` +
                `${attempts} poll(s)`,
            );
            return completedEntry;
        }

        pollLog.warn(
            `Poll timed out after ${formatElapsed(Date.now() - startTime)} ` +
            `(${attempts} attempts, budget ${Math.round(timeoutMs / 1000)}s)`,
        );
        return null;

        // --- local helper closures ---

        function maybeHeartbeat(): void {
            const now = Date.now();
            if (now - lastHeartbeatMs >= 30_000) {
                lastHeartbeatMs = now;
                pollLog.info(
                    `Still generating — elapsed ${formatElapsed(now - startTime)}, ` +
                    `${attempts} polls, next backoff ≈${Math.round(nextBackoffEstimate(backoff))}ms`,
                );
            }
        }
    }

    // =========================================================================
    // Output Collection
    // =========================================================================

    /**
     * Collect images for single image generation.
     * Saves to .codecomfy/outputs/
     */
    private async collectImages(history: ValidatedHistoryEntry, request: JobRequest): Promise<Artifact[]> {
        const artifacts: Artifact[] = [];
        const outputDir = path.join(request.workspace_path, CODECOMFY_DIR, OUTPUTS_DIR);
        fs.mkdirSync(outputDir, { recursive: true });
        const collectLog = this.logger.child('collect/image');

        let total = 0;
        let rejected = 0;
        let downloadFailed = 0;

        for (const nodeId of Object.keys(history.outputs)) {
            const nodeOutput = history.outputs[nodeId];
            if (!nodeOutput.images) continue;

            for (const img of nodeOutput.images) {
                total++;
                // Sanitise untrusted filename from ComfyUI response before any
                // path.* / fs.* use. See sanitizeComfyFilename() for rejection rules.
                let safeName: string;
                try {
                    safeName = sanitizeComfyFilename(img.filename);
                } catch (err) {
                    rejected++;
                    if (err instanceof ComfyResponseError) {
                        collectLog.warn(
                            `Rejected filename from ComfyUI: ${JSON.stringify(img.filename)} ` +
                            `(${err.fieldPath ?? 'invalid'})`,
                            err.message,
                        );
                    } else {
                        collectLog.warn(
                            `Rejected filename from ComfyUI: ${JSON.stringify(img.filename)}`,
                            err instanceof Error ? err.message : String(err),
                        );
                    }
                    continue;
                }
                const ext = path.extname(safeName) || '.png';
                const outputFilename = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`;
                const outputPath = path.join(outputDir, outputFilename);

                const sizeBytes = await this.downloadToFile(
                    safeName, img.subfolder, img.type, outputPath,
                    { index: total, kind: 'image' },
                );
                if (sizeBytes === null) {
                    downloadFailed++;
                    continue;
                }

                const relativePath = path.join(CODECOMFY_DIR, OUTPUTS_DIR, outputFilename);

                artifacts.push({
                    type: 'image',
                    path: relativePath.replace(/\\/g, '/'),
                    size_bytes: sizeBytes,
                    provenance: { seed: request.inputs.seed },
                });
            }
        }

        if (total > 0) {
            if (rejected > 0 || downloadFailed > 0) {
                collectLog.info(
                    `Collected ${artifacts.length} of ${total} images ` +
                    `(${rejected} rejected, ${downloadFailed} download-failed)`,
                );
            } else {
                collectLog.info(`Collected ${artifacts.length} of ${total} images`);
            }
        }

        return artifacts;
    }

    /**
     * Collect frames for video generation.
     * Saves to .codecomfy/runs/{run_id}/frames/
     * Returns artifacts with type 'image' that the router will assemble into video.
     */
    private async collectFrames(history: ValidatedHistoryEntry, request: JobRequest): Promise<Artifact[]> {
        const artifacts: Artifact[] = [];
        const framesDir = path.join(
            request.workspace_path,
            CODECOMFY_DIR,
            RUNS_DIR,
            request.run_id,
            'frames'
        );
        fs.mkdirSync(framesDir, { recursive: true });
        const collectLog = this.logger.child('collect/frames');

        // Collect all images from all output nodes
        const allImages: Array<{ filename: string; subfolder: string; type: string }> = [];
        for (const nodeId of Object.keys(history.outputs)) {
            const nodeOutput = history.outputs[nodeId];
            if (nodeOutput.images) {
                allImages.push(...nodeOutput.images);
            }
        }

        // Sort images by filename to preserve order
        allImages.sort((a, b) => a.filename.localeCompare(b.filename));

        const total = allImages.length;
        let rejected = 0;
        let downloadFailed = 0;

        // Download and save each frame (streamed to disk)
        for (let i = 0; i < allImages.length; i++) {
            const img = allImages[i];

            // Sanitise untrusted filename from ComfyUI response before any
            // path.* / fs.* use. A compromised server could otherwise craft
            // names like "../../etc/shadow.png" to escape the frames folder.
            let safeName: string;
            try {
                safeName = sanitizeComfyFilename(img.filename);
            } catch (err) {
                rejected++;
                if (err instanceof ComfyResponseError) {
                    collectLog.warn(
                        `Rejected frame filename from ComfyUI at index ${i + 1}/${total}: ` +
                        `${JSON.stringify(img.filename)} (${err.fieldPath ?? 'invalid'})`,
                        err.message,
                    );
                } else {
                    collectLog.warn(
                        `Rejected frame filename from ComfyUI at index ${i + 1}/${total}: ` +
                        `${JSON.stringify(img.filename)}`,
                        err instanceof Error ? err.message : String(err),
                    );
                }
                continue;
            }
            const outputPath = path.join(framesDir, safeName);

            const sizeBytes = await this.downloadToFile(
                safeName, img.subfolder, img.type, outputPath,
                { index: i + 1, total, kind: 'frame' },
            );
            if (sizeBytes === null) {
                downloadFailed++;
                continue;
            }

            // Relative path for artifact
            const relativePath = path.join(
                CODECOMFY_DIR,
                RUNS_DIR,
                request.run_id,
                'frames',
                safeName
            );

            artifacts.push({
                type: 'image', // Frames are images; router assembles into video
                path: relativePath.replace(/\\/g, '/'),
                size_bytes: sizeBytes,
            });
        }

        if (total > 0) {
            if (rejected > 0 || downloadFailed > 0) {
                const missing = rejected + downloadFailed;
                collectLog.warn(
                    `Collected ${artifacts.length} of ${total} frames; ` +
                    `${missing} frame(s) missing ` +
                    `(${rejected} rejected, ${downloadFailed} download-failed). ` +
                    `Video assembly will likely fail.`,
                );
            } else {
                collectLog.info(`Collected ${artifacts.length} of ${total} frames`);
            }
        }

        return artifacts;
    }

    /**
     * Stream an image from ComfyUI directly to disk.
     *
     * Returns the file size on success, or null on failure.
     * Writes to a temp file first, then renames — avoids partial files on error.
     *
     * The optional `context` argument is used for structured log messages when
     * a download fails — frame 47 of 96 is much more useful than a bare
     * "download failed" line.
     */
    private async downloadToFile(
        filename: string,
        subfolder: string,
        type: string,
        destPath: string,
        context?: DownloadContext,
    ): Promise<number | null> {
        const tmpPath = `${destPath}.tmp.${Date.now()}`;
        const downloadLog = this.logger.child('download');
        try {
            const params = new URLSearchParams({
                filename,
                subfolder: subfolder || '',
                type: type || 'output',
            });

            const response = await fetch(`${this.serverUrl}/view?${params}`, {
                signal: AbortSignal.timeout(30000),
            });
            if (!response.ok) {
                downloadLog.warn(
                    `${describeDownload(context, filename)} failed: HTTP ${response.status}`,
                );
                return null;
            }

            if (!response.body) {
                downloadLog.warn(
                    `${describeDownload(context, filename)} failed: empty response body`,
                );
                return null;
            }

            // Stream response body → temp file
            const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
            const fileStream = fs.createWriteStream(tmpPath);
            await pipeline(nodeStream, fileStream);

            // Atomic rename
            fs.renameSync(tmpPath, destPath);

            const stats = fs.statSync(destPath);
            return stats.size;
        } catch (err) {
            // Clean up partial temp file
            try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch { /* ignore */ }

            // Classify and log — silent swallow is the original bug.
            const reason = classifyDownloadError(err);
            downloadLog.warn(
                `${describeDownload(context, filename)} failed: ${reason}`,
                err instanceof Error ? err.message : String(err),
            );
            return null;
        }
    }

    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Contextual hint for download log lines. For frames, `index`/`total` produces
 * "Frame 47/96 download"; for images, just "Image 3 download".
 */
interface DownloadContext {
    kind: 'frame' | 'image';
    index: number;
    total?: number;
}

function describeDownload(ctx: DownloadContext | undefined, filename: string): string {
    if (!ctx) {
        return `Download of ${JSON.stringify(filename)}`;
    }
    if (ctx.kind === 'frame' && typeof ctx.total === 'number') {
        return `Frame ${ctx.index}/${ctx.total} (${filename}) download`;
    }
    return `${ctx.kind === 'frame' ? 'Frame' : 'Image'} ${ctx.index} (${filename}) download`;
}

/**
 * Turn a thrown error from the `fetch → pipeline → rename` chain into a
 * short human-readable reason for the output channel.
 */
function classifyDownloadError(err: unknown): string {
    const raw = err instanceof Error ? err.message : String(err);
    const name = err instanceof Error ? err.name : '';
    if (name === 'AbortError' || /aborted/i.test(raw)) return 'fetch aborted (timeout)';
    if (/ECONNRESET/.test(raw)) return 'connection reset';
    if (/ECONNREFUSED/.test(raw)) return 'connection refused';
    if (/ENOSPC/.test(raw)) return 'no space left on device';
    if (/ENOENT/.test(raw)) return 'file-system error (ENOENT)';
    if (/EACCES|EPERM/.test(raw)) return 'file-system permission denied';
    return raw.slice(0, 200);
}

/**
 * Estimate the next backoff delay without advancing the timer. Used for log
 * breadcrumbs only — inexact is fine.
 */
function nextBackoffEstimate(backoff: BackoffTimer): number {
    // Access the private attempt counter via bracket indexing — we only use
    // this for log output, so slight drift is acceptable.
    const attempt = (backoff as unknown as { attempt: number }).attempt ?? 0;
    return Math.min(1000 * Math.pow(1.5, attempt), 8000);
}

function formatElapsed(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    const seconds = ms / 1000;
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    const minutes = Math.floor(seconds / 60);
    const remSec = Math.floor(seconds % 60);
    return `${minutes}m${remSec.toString().padStart(2, '0')}s`;
}

/**
 * Map an error thrown by `fetch /system_stats` to a structured availability
 * result. The mapping is based on error message / name because Node's fetch
 * wraps the underlying cause in a generic TypeError.
 */
function classifyAvailabilityError(err: unknown, serverUrl: string): AvailabilityResult {
    const raw = err instanceof Error ? err.message : String(err);
    const name = err instanceof Error ? err.name : '';
    const cause = err instanceof Error ? (err as Error & { cause?: unknown }).cause : undefined;
    const causeMsg = cause instanceof Error ? cause.message : typeof cause === 'string' ? cause : '';
    const allText = `${raw} ${causeMsg}`;

    if (name === 'AbortError' || /aborted|timeout|TimeoutError/i.test(allText)) {
        return {
            ok: false,
            reason: 'timeout',
            detail: `ComfyUI at ${serverUrl} did not respond within 5s. ` +
                `It may be starting up — try again in a few seconds.`,
        };
    }
    if (/ECONNREFUSED/.test(allText)) {
        return {
            ok: false,
            reason: 'refused',
            detail: `ComfyUI is not running at ${serverUrl}. Start ComfyUI, then retry.`,
        };
    }
    if (
        /Invalid URL|ERR_INVALID_URL|only absolute URLs|Failed to parse URL/i.test(allText) ||
        err instanceof TypeError && /URL/i.test(raw)
    ) {
        return {
            ok: false,
            reason: 'bad-url',
            detail: `ComfyUI URL is malformed: "${serverUrl}". ` +
                `Check "codecomfy.comfyuiUrl" in Settings.`,
        };
    }
    return {
        ok: false,
        reason: 'unknown',
        detail: `ComfyUI at ${serverUrl} is not reachable: ${raw}`,
    };
}

/**
 * Compose a single user-facing error string from a structured availability
 * result. Kept in-engine for backwards-compat with the old `generate()` error
 * message; the router may compose its own message using the reason code.
 */
export function composeAvailabilityMessage(
    result: Exclude<AvailabilityResult, { ok: true }>,
    _serverUrl: string,
): string {
    switch (result.reason) {
        case 'refused':
            return result.detail + ' See ' + TROUBLESHOOTING_URL;
        case 'timeout':
            return result.detail;
        case 'bad-url':
            return result.detail;
        case 'http-error':
            return result.detail + ' See ' + TROUBLESHOOTING_URL;
        default:
            return result.detail + ' See ' + TROUBLESHOOTING_URL;
    }
}

// ── Error categorisation ──────────────────────────────────────────────────────

/**
 * Categorise an error into a user-friendly message with an action hint.
 */
const TROUBLESHOOTING_URL = 'https://github.com/mcp-tool-shop-org/codecomfy-vscode#troubleshooting';

export function categorizeError(err: unknown): string {
    const raw = err instanceof Error ? err.message : String(err);

    // Node-level workflow errors (F-012): a preset refers to a model ComfyUI
    // doesn't have, a sampler is mis-wired, etc. The validatePromptResponse
    // throw is wrapped by submitPrompt as "ComfyUI node error: ..." — match
    // that distinctive prefix and surface the actionable detail.
    if (raw.startsWith('ComfyUI node error') || /node_errors|node \d+:/i.test(raw)) {
        const modelHint = extractMissingModelHint(raw);
        return (
            `[Node] ${raw}. ${modelHint}Check the preset or install the ` +
            `required model/custom node in ComfyUI. See ${TROUBLESHOOTING_URL}`
        );
    }

    // Network / connectivity
    if (
        raw.includes('ECONNREFUSED') ||
        raw.includes('ECONNRESET') ||
        raw.includes('ETIMEDOUT') ||
        raw.includes('fetch failed')
    ) {
        return `[Network] ${raw}. Check that ComfyUI is running and codecomfy.comfyuiUrl is correct. See ${TROUBLESHOOTING_URL}`;
    }

    // Server-side HTTP errors
    if (raw.includes('ComfyUI error (HTTP')) {
        return `[Server] ${raw}. The ComfyUI server returned an error — check the ComfyUI console for details. See ${TROUBLESHOOTING_URL}`;
    }

    // Response shape / validation
    if (raw.includes('response invalid') || raw.includes('ComfyResponseError')) {
        return (
            `[API] ${raw}. The ComfyUI response had an unexpected shape — ` +
            `you may be running an incompatible version. ` +
            `See ${TROUBLESHOOTING_URL}`
        );
    }

    // File system / IO
    if (
        raw.includes('ENOENT') ||
        raw.includes('EACCES') ||
        raw.includes('EPERM') ||
        raw.includes('ENOSPC')
    ) {
        return `[IO] ${raw}. Check disk space and file permissions for the workspace folder. See ${TROUBLESHOOTING_URL}`;
    }

    return raw;
}

/**
 * Try to pull a `.safetensors` / `.ckpt` / `.pt` filename out of a node-error
 * message so we can tell the user exactly which model to install.
 */
function extractMissingModelHint(raw: string): string {
    const match = raw.match(/['"`]?([\w.\-]+\.(?:safetensors|ckpt|pt|bin|gguf))['"`]?/i);
    if (match) {
        return `The model "${match[1]}" appears to be missing. `;
    }
    return '';
}
