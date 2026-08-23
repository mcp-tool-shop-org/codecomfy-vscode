/**
 * ComfyUI Server Engine
 *
 * Connects to a running ComfyUI server to execute workflows.
 * POST workflow → poll for completion → collect outputs.
 *
 * For video: collects frames into run folder for FFmpeg assembly.
 * For image: saves directly to outputs folder.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * HTTP CONTRACT (for test fixture recording — FT-017)
 *
 * The engine makes exactly these calls against the configured ComfyUI server,
 * in this order, during a successful run. Test helpers that want to record or
 * replay real traffic (e.g. a future `stubFetchFromFixtures(presetId)`) must
 * cover every URL pattern listed below.
 *
 *   1. getAvailability()  [called from generate() at entry, and standalone]
 *        GET  {serverUrl}/system_stats
 *        Timeout: 5s (AbortSignal.timeout)
 *        Expected: 200 { system: {...}, devices: [...] }
 *        Non-2xx → reason: 'http-error'; network → 'refused' | 'timeout' | 'bad-url' | 'unknown'.
 *
 *   2. submitPrompt(workflow)
 *        POST {serverUrl}/prompt
 *        Headers: Content-Type: application/json
 *        Body: { prompt: <workflow_nodes_by_id> }
 *               (no client_id is sent; ComfyUI assigns one server-side)
 *        Timeout: 10s
 *        Expected: 200 { prompt_id: string, number: int, node_errors: {} }
 *        Validated by `validatePromptResponse()`.
 *
 *   3. pollForCompletion(promptId)
 *        GET  {serverUrl}/history/{promptId}
 *        Timeout per attempt: 5s
 *        Poll cadence: exponential backoff via BackoffTimer (≈500ms → 8s cap)
 *        Budget: 300s (image) or 600s (video)
 *        Expected: 200 { [promptId]: { status: { completed: bool, ... }, outputs: { [nodeId]: { images?: [...] } } } }
 *        Validated by `validateHistoryResponse()`.
 *        Non-2xx while polling is treated as "not ready yet" and retried.
 *
 *   4. collectImages / collectFrames (one GET per output image)
 *        GET  {serverUrl}/view?filename=<name>&subfolder=<sub>&type=<type>
 *        Timeout: 30s
 *        Expected: 200 image/png | image/jpeg (streamed to disk)
 *        Filename is first passed through `sanitizeComfyFilename()`.
 *
 *   5. cancel()  [only if a prompt is in flight]
 *        POST {serverUrl}/interrupt
 *        No body; response body ignored; errors swallowed.
 *
 * Notes for fixture recorders:
 *   • ORDER MATTERS — a recorder that replays calls in the wrong order will
 *     mismatch because pollForCompletion depends on submitPrompt's id.
 *   • /view may be called many times (1× per image, N× for video frames).
 *   • A cancel may happen mid-poll; a fixture player should be tolerant of
 *     a short-circuited `/history/...` loop followed by a POST /interrupt.
 * ──────────────────────────────────────────────────────────────────────────
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
import { ApiWorkflow, injectRequest, substitutePlaceholders } from './workflowInjection';
import {
    RetrievalResult,
    collectOutputs,
    explainEmptyOutputs,
    isFrameSequence,
    defaultExtensionFor,
} from './retrieval';

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

/**
 * Per-instance overrides applied at workflow-build time. Used today to
 * substitute a user-specified checkpoint into shipped HQ presets so that
 * Marketplace installs without the preset's hardcoded model don't fail
 * on first run.
 */
export interface WorkflowOverrides {
    /**
     * If set, replaces `ckpt_name` on every `CheckpointLoaderSimple` node
     * in the preset workflow. Empty/undefined → preset value wins.
     */
    checkpoint?: string;
}

/**
 * Metadata emitted alongside the GenerationResult via the optional
 * `onComplete` callback on `generate()`. Added for FT-015 so router/extcore
 * can log structured run summaries without re-deriving timing.
 *
 * `phase_breakdown` is populated when the engine tracks each phase; fields
 * are optional because today's implementation only measures the total and
 * frame count. Callers should treat missing fields as "not measured".
 */
export interface CompletionMetadata {
    /** Total time from `generate()` entry to return, in milliseconds. */
    total_elapsed_ms: number;
    /** Per-phase timing when available (currently submit + poll + download + assemble). */
    phase_breakdown?: {
        submit_ms?: number;
        poll_ms?: number;
        download_ms?: number;
        assemble_ms?: number;
    };
    /** Number of frames actually collected (video only). Undefined for images. */
    frames_collected?: number;
    /** Final count of artifacts returned in the GenerationResult. */
    final_artifact_count: number;
}

/**
 * Callback invoked exactly once per `generate()` call, immediately before
 * the method returns, regardless of success or failure. Router/extcore
 * subscribers use it to emit structured "generation complete" events.
 */
export type OnCompleteCallback = (
    result: GenerationResult,
    metadata: CompletionMetadata,
) => void;

/**
 * Re-exported for the handbook and schema generator. The injection contract is
 * now role-based (see `workflowInjection.ts`), so this list documents the node
 * types the LEGACY degenerate-graph fallback still matches by name — not the
 * limit of what can be injected into.
 */
export const INJECTABLE_CLASS_TYPES: readonly string[] = Object.freeze([
    'CLIPTextEncode',
    'KSampler',
    'EmptyLatentImage',
    'CheckpointLoaderSimple',
]);


export class ComfyServerEngine implements IGenerationEngine {
    readonly id = 'comfy-server';
    readonly name = 'ComfyUI Server';

    private serverUrl: string;
    private currentPromptId: string | null = null;
    private canceled = false;
    private logger: Logger;
    private overrides: WorkflowOverrides;

    /**
     * Construct a new engine. The optional `logger` argument is injected by
     * the router; tests pass `undefined` and get a silent null-logger so
     * output channels are not required. The optional `overrides` argument
     * supplies per-session workflow substitutions (e.g. checkpoint name).
     */
    constructor(
        serverUrl: string = 'http://127.0.0.1:8188',
        logger?: Logger,
        overrides: WorkflowOverrides = {},
    ) {
        this.serverUrl = serverUrl.replace(/\/$/, '');
        this.logger = logger ?? createNullLogger('ComfyServerEngine');
        this.overrides = overrides;
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
    /**
     * Does this server know how to execute `classType`?
     *
     * Uses the single-node form of `/object_info` rather than the full
     * catalog, which is multi-megabyte on a server with a normal custom-node
     * load. A non-2xx or empty body means "not registered here".
     */
    async hasClass(classType: string): Promise<boolean> {
        try {
            const response = await fetch(
                `${this.serverUrl}/object_info/${encodeURIComponent(classType)}`,
                { signal: AbortSignal.timeout(5000) },
            );
            if (!response.ok) return false;
            const body = await response.json();
            return !!body && typeof body === 'object' && Object.keys(body).length > 0;
        } catch {
            return false;
        }
    }

    /**
     * List the files in a ComfyUI model folder.
     *
     * `/models/{folder}` is present in ComfyUI 0.23.0 but was added at some
     * point we cannot pin, so a failure here returns `null` ("could not
     * check") rather than an empty list ("nothing installed") — reporting a
     * model as missing because the server is old would be worse than skipping
     * the check.
     */
    async listModels(folder: string): Promise<string[] | null> {
        try {
            const response = await fetch(
                `${this.serverUrl}/models/${encodeURIComponent(folder)}`,
                { signal: AbortSignal.timeout(5000) },
            );
            if (!response.ok) return null;
            const body = await response.json();
            if (!Array.isArray(body)) return null;
            return body.filter((f): f is string => typeof f === 'string');
        } catch {
            return null;
        }
    }

    /**
     * Upload a local file into ComfyUI's input namespace and return the name
     * the server actually stored it under.
     *
     * The returned name is the ONLY trustworthy handle: with `overwrite` off
     * the server renames on collision, so the filename we sent may not be the
     * filename on disk. Callers must inject what comes back, never what they
     * sent.
     *
     * Contract verified against ComfyUI 0.23.0 (`server.py:450`): multipart
     * field `image`, plus optional `subfolder`, `type`, and `overwrite`.
     */
    async uploadFile(localPath: string, subfolder = 'codecomfy'): Promise<string | null> {
        const uploadLog = this.logger.child('upload');
        try {
            const bytes = fs.readFileSync(localPath);
            const form = new FormData();
            form.append(
                'image',
                new Blob([new Uint8Array(bytes)]),
                path.basename(localPath),
            );
            form.append('type', 'input');
            if (subfolder) form.append('subfolder', subfolder);

            const response = await fetch(`${this.serverUrl}/upload/image`, {
                method: 'POST',
                body: form,
                signal: AbortSignal.timeout(60000),
            });
            if (!response.ok) {
                uploadLog.error(
                    `Upload failed — HTTP ${response.status} from /upload/image`,
                    `File: ${localPath}`,
                );
                return null;
            }
            const body = (await response.json()) as {
                name?: unknown;
                subfolder?: unknown;
            };
            if (typeof body.name !== 'string') {
                uploadLog.error('Upload response did not include a "name" field.');
                return null;
            }
            // A subfolder-qualified reference is what LoadImage expects when
            // the file was not stored at the input root.
            const stored =
                typeof body.subfolder === 'string' && body.subfolder
                    ? `${body.subfolder}/${body.name}`
                    : body.name;
            uploadLog.info(`Uploaded ${path.basename(localPath)} as "${stored}"`);
            return stored;
        } catch (err) {
            uploadLog.error(
                'Upload failed',
                err instanceof Error ? err.message : String(err),
            );
            return null;
        }
    }

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

    /**
     * Run a generation against ComfyUI. The optional `onComplete` callback
     * (FT-015) is invoked exactly once, just before this method returns,
     * with the final `GenerationResult` and a `CompletionMetadata` record
     * (total elapsed time, per-phase breakdown where tracked, frame count
     * for video, final artifact count). It fires on success and failure —
     * router/extcore can use it as a single "this run ended" event hook
     * without reimplementing phase timing.
     *
     * The callback signature is additive and optional; existing two-arg
     * callers (`engine.generate(request, preset)`) are unaffected.
     */
    async generate(
        request: JobRequest,
        preset: Preset,
        onComplete?: OnCompleteCallback,
    ): Promise<GenerationResult> {
        this.canceled = false;

        const generateStart = Date.now();
        const phaseBreakdown: NonNullable<CompletionMetadata['phase_breakdown']> = {};
        let framesCollected: number | undefined;

        const finish = (result: GenerationResult): GenerationResult => {
            if (onComplete) {
                const metadata: CompletionMetadata = {
                    total_elapsed_ms: Date.now() - generateStart,
                    phase_breakdown: phaseBreakdown,
                    final_artifact_count: result.artifacts.length,
                };
                if (framesCollected !== undefined) {
                    metadata.frames_collected = framesCollected;
                }
                try {
                    onComplete(result, metadata);
                } catch (cbErr) {
                    // Don't let a buggy callback take down the run — log and
                    // swallow. The result itself is still returned below.
                    this.logger.warn(
                        'onComplete callback threw; ignoring',
                        cbErr instanceof Error ? cbErr.message : String(cbErr),
                    );
                }
            }
            return result;
        };

        const availability = await this.getAvailability();
        if (!availability.ok) {
            return finish({
                success: false,
                artifacts: [],
                error: composeAvailabilityMessage(availability, this.serverUrl),
            });
        }

        const workflow = this.buildWorkflow(preset, request);
        if (!workflow) {
            return finish({
                success: false,
                artifacts: [],
                error: 'Preset has no workflow defined.',
            });
        }

        try {
            const submitStart = Date.now();
            const promptResponse = await this.submitPrompt(workflow);
            phaseBreakdown.submit_ms = Date.now() - submitStart;
            if (!promptResponse) {
                return finish({
                    success: false,
                    artifacts: [],
                    error: 'Failed to submit prompt to ComfyUI.',
                });
            }

            this.currentPromptId = promptResponse.prompt_id;

            // Video generation can take much longer
            const timeoutMs = request.kind === 'video' ? 600000 : 300000;
            const pollStart = Date.now();
            const history = await this.pollForCompletion(promptResponse.prompt_id, timeoutMs);
            phaseBreakdown.poll_ms = Date.now() - pollStart;

            if (!history) {
                if (this.canceled) {
                    return finish({ success: false, artifacts: [], error: 'Generation canceled.' });
                }
                return finish({ success: false, artifacts: [], error: 'Generation timed out or failed.' });
            }

            // Collect outputs based on kind.
            //
            // For video we first look for a server-encoded container. ComfyUI's
            // core `SaveVideo` node writes its result into `/history` outputs
            // under the `images` key (verified: `PreviewVideo.as_dict()` returns
            // `{"images": [...], "animated": (True,)}`), carrying the same
            // {filename, subfolder, type} triple as a still. When the preset
            // ends in CreateVideo → SaveVideo the server has already muxed the
            // clip, so we download it directly and FFmpeg is never invoked.
            const downloadStart = Date.now();
            const retrieval = collectOutputs(history);
            let artifacts: Artifact[];
            if (request.kind === 'video' && isFrameSequence(retrieval.refs)) {
                // Legacy shape: many stills from one node, assembled locally.
                artifacts = await this.collectFrames(history, request);
                framesCollected = artifacts.length;
            } else {
                artifacts = await this.collectFiles(retrieval, request);
            }
            phaseBreakdown.download_ms = Date.now() - downloadStart;

            if (artifacts.length === 0) {
                // Name the keys we looked under and what this graph's
                // terminators were expected to write — "no outputs" alone
                // sends users hunting in the wrong place.
                const classTypes = Object.values(
                    (preset.workflow ?? {}) as Record<string, { class_type?: string }>,
                )
                    .map((n) => n?.class_type)
                    .filter((c): c is string => typeof c === 'string');
                return finish({
                    success: false,
                    artifacts: [],
                    error: explainEmptyOutputs(classTypes),
                });
            }

            return finish({ success: true, artifacts });
        } catch (err) {
            return finish({
                success: false,
                artifacts: [],
                error: categorizeError(err),
            });
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

    /**
     * Build the workflow JSON object posted to ComfyUI's `/prompt` endpoint.
     *
     * Injection is role-based: the graph is analysed by following links from
     * the sampler rather than by matching `class_type` names, so split-stack
     * models (Flux, Qwen-Image, SD3.5, Wan) and custom-sampling graphs are
     * handled correctly. See `workflowInjection.ts` for the verified anchors.
     *
     * Warnings produced by the injector are surfaced to the output channel
     * verbatim — they name the specific thing that did NOT take effect
     * (an unresolvable prompt, an ignored negative on a guidance-distilled
     * graph, a checkpoint override with no CheckpointLoaderSimple to apply
     * to, or a video preset with no temporal latent).
     */
    private buildWorkflow(preset: Preset, request: JobRequest): Record<string, unknown> | null {
        if (!preset.workflow) {
            return null;
        }

        const workflow = JSON.parse(JSON.stringify(preset.workflow)) as ApiWorkflow;
        const buildLog = this.logger.child('buildWorkflow');

        // Vendored reference graphs carry literal placeholder tokens wherever a
        // runtime value belongs. Substitute those first — they appear on nodes
        // (LoadImage, Florence2Run, ACE-Step tags) that have no structural
        // relationship to the sampler, so link-walking alone would miss them.
        const substitution = substitutePlaceholders(workflow, {
            PROMPT_TEXT: request.inputs.prompt,
            PROMPT_TAGS: request.inputs.prompt,
            EDIT_INSTRUCTION: request.inputs.prompt,
            NEGATIVE_TEXT: request.inputs.negative_prompt ?? '',
            QUERY_TEXT: request.inputs.query,
            'INPUT_IMAGE_REF.png': request.inputs.input_image,
            'INPUT_AUDIO_REF.flac': request.inputs.input_audio,
        });
        if (substitution.unresolved.length > 0) {
            // Submitting would send the literal token as a filename or prompt.
            buildLog.error(
                'Workflow still contains unfilled placeholders: ' +
                `${substitution.unresolved.join(', ')}. This preset needs those ` +
                'inputs before it can run.',
            );
            return null;
        }
        if (substitution.substituted > 0) {
            buildLog.info(`Substituted ${substitution.substituted} placeholder value(s)`);
        }

        const report = injectRequest(workflow, request, this.overrides);

        for (const warning of report.warnings) {
            buildLog.warn(warning);
        }

        if (report.injected === 0) {
            buildLog.warn(
                'No values were injected into this workflow. Your prompt and seed were ' +
                'not applied — the generation will use whatever is hardcoded in the ' +
                'workflow JSON. Check that the preset is API-format (ComfyUI → ' +
                'Workflow → Export (API)), not the plain editor export.',
            );
        } else {
            buildLog.info(
                `Injected ${report.injected} value(s); ` +
                `samplers=${report.analysis.samplerIds.length}, ` +
                `negative=${report.analysis.supportsNegative ? 'supported' : 'none'}, ` +
                `latent=${report.analysis.latentHasLength ? 'temporal' : 'image'}`,
            );
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
     * Download every artifact a workflow produced, whatever kind it is.
     *
     * This is the single collection path for all six profiles. It reads the
     * references gathered by `collectOutputs()` — which walks every `/history`
     * output key, not just `images` — so audio (`SaveAudioAdvanced` → `audio`),
     * meshes (`SaveGLB` → `3d`), inference text (`SaveText` → `text` + `files`)
     * and VHS-terminated video (`gifs`) all land on disk the same way stills do.
     *
     * Inline `SaveText` results are written out as `.txt` so an inference run
     * leaves a readable artifact rather than living only in the log.
     */
    private async collectFiles(
        retrieval: RetrievalResult,
        request: JobRequest,
    ): Promise<Artifact[]> {
        const artifacts: Artifact[] = [];
        const outputDir = path.join(request.workspace_path, CODECOMFY_DIR, OUTPUTS_DIR);
        const collectLog = this.logger.child('collect');

        let index = 0;
        let rejected = 0;
        let downloadFailed = 0;

        for (const ref of retrieval.refs) {
            index++;
            let safeName: string;
            try {
                safeName = sanitizeComfyFilename(ref.filename);
            } catch (err) {
                rejected++;
                collectLog.warn(
                    `Rejected filename from ComfyUI: ${JSON.stringify(ref.filename)} ` +
                    `(from outputs.${ref.key})`,
                    err instanceof Error ? err.message : String(err),
                );
                continue;
            }

            fs.mkdirSync(outputDir, { recursive: true });

            const ext = path.extname(safeName) || defaultExtensionFor(ref.kind);
            const outputFilename =
                `${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`;
            const outputPath = path.join(outputDir, outputFilename);

            const sizeBytes = await this.downloadToFile(
                safeName, ref.subfolder, ref.type, outputPath,
                { index, kind: ref.kind === 'image' ? 'image' : 'video' },
            );
            if (sizeBytes === null) {
                downloadFailed++;
                continue;
            }

            const relativePath = path.join(CODECOMFY_DIR, OUTPUTS_DIR, outputFilename);
            const artifact: Artifact = {
                type: ref.kind,
                path: relativePath.replace(/\\/g, '/'),
                size_bytes: sizeBytes,
                provenance: { seed: request.inputs.seed },
            };
            if (ref.kind === 'video') {
                artifact.meta = {
                    fps: request.inputs.fps,
                    duration_seconds: request.inputs.duration_seconds,
                };
            }
            artifacts.push(artifact);
        }

        // `SaveText` reports its result inline rather than as a file; persist it
        // so an inference run produces something the user can open.
        for (const { nodeId, text } of retrieval.inlineText) {
            fs.mkdirSync(outputDir, { recursive: true });
            const outputFilename =
                `${Date.now()}_${crypto.randomBytes(4).toString('hex')}_node${nodeId}.txt`;
            const outputPath = path.join(outputDir, outputFilename);
            try {
                fs.writeFileSync(outputPath, text, 'utf8');
            } catch (err) {
                collectLog.warn(
                    `Failed to write inline text from node ${nodeId}`,
                    err instanceof Error ? err.message : String(err),
                );
                continue;
            }
            const relativePath = path.join(CODECOMFY_DIR, OUTPUTS_DIR, outputFilename);
            artifacts.push({
                type: 'text',
                path: relativePath.replace(/\\/g, '/'),
                size_bytes: Buffer.byteLength(text, 'utf8'),
                provenance: { seed: request.inputs.seed },
            });
        }

        if (retrieval.refs.length > 0 || retrieval.inlineText.length > 0) {
            const kinds = [...new Set(artifacts.map((a) => a.type))].join(', ') || 'none';
            collectLog.info(
                `Collected ${artifacts.length} artifact(s) [${kinds}] ` +
                `from outputs.${retrieval.keysSeen.join(' + ')}` +
                (rejected || downloadFailed
                    ? ` (${rejected} rejected, ${downloadFailed} download-failed)`
                    : ''),
            );
        }

        return artifacts;
    }

    /**
     * Retained for the `IGenerationEngine` shape and for tests that exercise
     * the image path directly. Delegates to `collectFiles()` so there is only
     * one download/classify implementation to keep correct.
     */
    private async collectImages(
        history: ValidatedHistoryEntry,
        request: JobRequest,
    ): Promise<Artifact[]> {
        return this.collectFiles(collectOutputs(history), request);
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
    kind: 'frame' | 'image' | 'video';
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
    const label = ctx.kind === 'frame' ? 'Frame' : ctx.kind === 'video' ? 'Video' : 'Image';
    return `${label} ${ctx.index} (${filename}) download`;
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
        return (
            `The model "${match[1]}" appears to be missing. ` +
            `If this is a shipped preset, set \`codecomfy.defaultCheckpoint\` ` +
            `to a model you have installed in ComfyUI/models/checkpoints/. `
        );
    }
    return '';
}
