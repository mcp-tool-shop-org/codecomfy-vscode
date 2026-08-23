/**
 * JobRouter - Manages run lifecycle and workspace state.
 *
 * Responsibilities:
 * - Create run folders
 * - Track status
 * - Write logs
 * - Update index atomically
 * - For video: compute frame_count and assemble with FFmpeg
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import {
    JobRequestInput,
    JobRequest,
    JobRun,
    RunArtifacts,
    Artifact,
    OutputIndex,
    IndexedArtifact,
    Preset,
    GenerationResult,
    IGenerationEngine,
    CODECOMFY_DIR,
    OUTPUTS_DIR,
    RUNS_DIR,
    INDEX_FILENAME,
    INDEX_SCHEMA_VERSION,
} from '../types';
import { findFfmpeg, assembleVideo, cleanupPartialVideo } from '../engines/ffmpeg';
import { snapToFrameGrid } from '../engines/workflowInjection';
import { Logger, createNullLogger } from '../logging/logger';
import { pruneRuns } from '../pruning/pruner';

/**
 * Frame-count grid for temporal latents. Wan and Hunyuan video latents declare
 * `length` with step 4 (`4n + 1` legal values); LTX uses step 8. We snap to the
 * stricter-but-universal 4 so a count is legal on the widest set of models.
 */
const VIDEO_FRAME_GRID = 4;

export interface JobRouterOptions {
    ffmpegPath?: string;
    logger?: Logger;
}

export class JobRouter {
    private workspacePath: string;
    private engine: IGenerationEngine;
    private options: JobRouterOptions;
    private log: Logger;
    private currentRun: JobRun | null = null;
    private cancelRequested = false;

    constructor(workspacePath: string, engine: IGenerationEngine, options: JobRouterOptions = {}) {
        this.workspacePath = workspacePath;
        this.engine = engine;
        this.options = options;
        this.log = options.logger ?? createNullLogger('JobRouter');
    }

    /**
     * Run a generation job.
     *
     * @param onProgress invoked on every status transition with the current JobRun.
     * @param onComplete invoked exactly once after the terminal `status.json`
     *   is written (both success and failure paths — including cancel).
     *   Receives the final GenerationResult and the terminal JobRun snapshot
     *   so callers can react to "this run is fully finalized on disk" without
     *   having to infer it from onProgress transitions.
     */
    async run(
        input: JobRequestInput,
        preset: Preset,
        onProgress?: (run: JobRun) => void,
        onComplete?: (result: GenerationResult, run: JobRun) => void
    ): Promise<GenerationResult> {
        this.cancelRequested = false;

        const runId = this.generateRunId();
        this.log.info(`Run ${runId} created`, `kind=${input.kind} preset=${input.preset_id}`);

        // For video: compute frame_count from fps and duration
        const processedInputs = { ...input.inputs };
        if (input.kind === 'video') {
            const fps = processedInputs.fps ?? preset.defaults.fps ?? 24;
            const duration = processedInputs.duration_seconds ?? preset.defaults.duration_seconds ?? 4;
            processedInputs.fps = fps;
            processedInputs.duration_seconds = duration;
            // Temporal latents take `length` in frames on a 4n+1 grid
            // (Wan / Hunyuan step 4; LTX step 8). ComfyUI does NOT snap for us
            // — `step` is a UI hint and `/prompt` validation only enforces
            // min/max — so an off-grid value would be silently mishandled by
            // the model. Snap up to the next legal count here.
            const requested = Math.ceil(fps * duration);
            processedInputs.frame_count = snapToFrameGrid(requested, VIDEO_FRAME_GRID);
            this.log.info(
                `Video params: ${duration}s @ ${fps}fps = ${requested} frames` +
                (processedInputs.frame_count !== requested
                    ? ` → snapped to ${processedInputs.frame_count} (${VIDEO_FRAME_GRID}n+1 grid)`
                    : ''),
            );
        }

        const request: JobRequest = {
            ...input,
            inputs: processedInputs,
            run_id: runId,
            workspace_path: this.workspacePath,
            created_at: new Date().toISOString(),
        };

        this.ensureDirectories();
        const runDir = this.getRunDir(runId);
        fs.mkdirSync(runDir, { recursive: true });

        this.writeJson(path.join(runDir, 'request.json'), request);

        this.currentRun = { run_id: runId, status: 'queued' };
        this.writeStatus(runDir, this.currentRun);
        onProgress?.(this.currentRun);

        this.currentRun.status = 'running';
        this.currentRun.started_at = new Date().toISOString();
        this.writeStatus(runDir, this.currentRun);
        onProgress?.(this.currentRun);

        const stdoutPath = path.join(runDir, 'stdout.log');
        const stderrPath = path.join(runDir, 'stderr.log');
        fs.writeFileSync(stdoutPath, '');
        fs.writeFileSync(stderrPath, '');

        try {
            // Run ComfyUI generation
            this.log.info(`Run ${runId} dispatching to engine "${this.engine.id}"`);
            const result = await this.engine.generate(request, preset);

            if (!result.success) {
                this.log.warn(`Run ${runId} engine returned failure`, result.error);
                return this.handleFailure(runDir, result.error, onProgress, onComplete);
            }

            // For video: assemble frames into MP4 — unless the server already
            // encoded the clip for us (CreateVideo → SaveVideo), in which case
            // the engine returns a ready `type: 'video'` artifact and FFmpeg is
            // not needed at all.
            let finalArtifacts: Artifact[];
            const serverEncoded = result.artifacts.filter((a) => a.type === 'video');
            if (request.kind === 'video' && serverEncoded.length > 0) {
                this.log.info(
                    `Run ${runId} used server-side video encoding ` +
                    `(${serverEncoded.length} file(s)) — FFmpeg not required`,
                );
                finalArtifacts = serverEncoded;
            } else if (request.kind === 'video') {
                this.log.info(`Run ${runId} assembling video from ${result.artifacts.length} frames`);
                const videoResult = await this.assembleVideoFromFrames(request, result.artifacts);
                if (!videoResult.success) {
                    this.log.warn(`Run ${runId} video assembly failed`, videoResult.error);
                    return this.handleFailure(runDir, videoResult.error, onProgress, onComplete);
                }
                finalArtifacts = videoResult.artifacts;
            } else {
                finalArtifacts = result.artifacts;
            }

            // Write artifacts.json
            const runArtifacts: RunArtifacts = {
                run_id: runId,
                artifacts: finalArtifacts,
            };
            this.writeJson(path.join(runDir, 'artifacts.json'), runArtifacts);

            // Update index with final artifacts only
            this.updateIndex(runId, finalArtifacts, request);

            this.currentRun.status = 'succeeded';
            this.currentRun.ended_at = new Date().toISOString();
            this.writeStatus(runDir, this.currentRun);
            onProgress?.(this.currentRun);

            this.log.info(`Run ${runId} succeeded — ${finalArtifacts.length} artifact(s)`);

            const successResult: GenerationResult = { success: true, artifacts: finalArtifacts };
            // Fire onComplete AFTER status.json is written so callers see a
            // finalized on-disk state. Guard with try/catch — a buggy
            // listener must not corrupt the router's post-success cleanup.
            try {
                onComplete?.(successResult, this.currentRun);
            } catch (cbErr) {
                this.log.warn('onComplete callback threw (non-fatal)', String(cbErr));
            }

            // Best-effort pruning — never let it fail the run
            try {
                const pruneResult = pruneRuns(this.workspacePath, { logger: this.log });
                if (pruneResult.prunedRuns > 0) {
                    this.log.info(
                        `Pruned ${pruneResult.prunedRuns} old run(s), ${pruneResult.prunedIndexEntries} index entries`,
                    );
                }
            } catch (pruneErr) {
                this.log.warn('Pruning failed (non-fatal)', String(pruneErr));
            }

            return successResult;
        } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            this.log.error(`Run ${runId} threw`, errMsg);
            return this.handleFailure(
                runDir,
                errMsg,
                onProgress,
                onComplete
            );
        } finally {
            this.currentRun = null;
            this.cancelRequested = false;
        }
    }

    /**
     * Cancel the current run.
     *
     * Logs a warn at entry, an info line at engine.cancel() invocation,
     * and a completion summary with status + elapsed + partial counts
     * so the user can tell from the output channel whether cancel
     * succeeded mid-generation or was too late.
     */
    async cancel(): Promise<void> {
        if (!this.currentRun) {
            return;
        }

        const runId = this.currentRun.run_id;
        const startedAt = this.currentRun.started_at;
        const cancelStart = Date.now();
        this.log.warn(`Cancel requested for run ${runId}`);
        this.cancelRequested = true;

        this.log.info(`engine.cancel() called for run ${runId}`);
        let engineErr: unknown;
        try {
            await this.engine.cancel();
        } catch (err) {
            engineErr = err;
        }

        // Compose summary — currentRun may have been cleared by the finally
        // block of an in-flight run() call between await points, so snapshot
        // what we can still read.
        const snapshot = this.currentRun;
        const finalStatus = snapshot?.status ?? 'unknown';
        const elapsedMs = startedAt
            ? Date.now() - new Date(startedAt).getTime()
            : Date.now() - cancelStart;
        const elapsedSec = Math.round(elapsedMs / 1000);

        if (engineErr) {
            const errMsg = engineErr instanceof Error ? engineErr.message : String(engineErr);
            this.log.warn(`engine.cancel() for run ${runId} errored: ${errMsg}`);
        }

        this.log.info(
            `Cancel complete for run ${runId}: status=${finalStatus}, elapsed=${elapsedSec}s`,
        );
    }

    /**
     * Get current run status.
     */
    getCurrentRun(): JobRun | null {
        return this.currentRun;
    }

    // =========================================================================
    // Video Assembly
    // =========================================================================

    private async assembleVideoFromFrames(
        request: JobRequest,
        _frameArtifacts: Artifact[]
    ): Promise<{ success: boolean; artifacts: Artifact[]; error?: string }> {
        // Find FFmpeg (async PATH probe)
        const ffmpegPath = await findFfmpeg(this.options.ffmpegPath);
        if (!ffmpegPath) {
            return {
                success: false,
                artifacts: [],
                error: 'FFmpeg not found. Install FFmpeg or set codecomfy.ffmpegPath setting.',
            };
        }

        // Check for cancel before starting assembly
        if (this.cancelRequested) {
            return { success: false, artifacts: [], error: 'Generation canceled.' };
        }

        const framesDir = path.join(
            request.workspace_path,
            CODECOMFY_DIR,
            RUNS_DIR,
            request.run_id,
            'frames'
        );

        const outputDir = path.join(request.workspace_path, CODECOMFY_DIR, OUTPUTS_DIR);
        const videoFilename = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}.mp4`;
        const videoPath = path.join(outputDir, videoFilename);
        const thumbFilename = videoFilename.replace('.mp4', '.thumb.png');
        const thumbPath = path.join(outputDir, thumbFilename);

        const fps = request.inputs.fps ?? 24;

        const assemblyResult = await assembleVideo({
            ffmpegPath,
            framesDir,
            outputPath: videoPath,
            fps,
            thumbnailPath: thumbPath,
        });

        if (!assemblyResult.success) {
            cleanupPartialVideo(videoPath, thumbPath);
            return { success: false, artifacts: [], error: assemblyResult.error };
        }

        // Check for cancel after assembly (cleanup if canceled)
        if (this.cancelRequested) {
            cleanupPartialVideo(videoPath, thumbPath);
            return { success: false, artifacts: [], error: 'Generation canceled.' };
        }

        // Create video artifact
        const stats = fs.statSync(videoPath);
        const duration = request.inputs.duration_seconds ?? 4;

        const videoArtifact: Artifact = {
            type: 'video',
            path: path.join(CODECOMFY_DIR, OUTPUTS_DIR, videoFilename).replace(/\\/g, '/'),
            size_bytes: stats.size,
            meta: {
                duration_seconds: duration,
                fps,
                mime_type: 'video/mp4',
                thumbnail_path: assemblyResult.thumbnailPath
                    ? path.join(CODECOMFY_DIR, OUTPUTS_DIR, thumbFilename).replace(/\\/g, '/')
                    : undefined,
            },
            provenance: {
                seed: request.inputs.seed,
            },
        };

        return { success: true, artifacts: [videoArtifact] };
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    private handleFailure(
        runDir: string,
        error: string | undefined,
        onProgress?: (run: JobRun) => void,
        onComplete?: (result: GenerationResult, run: JobRun) => void,
    ): GenerationResult {
        if (!this.currentRun) {
            return { success: false, artifacts: [], error };
        }

        if (this.cancelRequested) {
            this.currentRun.status = 'canceled';
        } else {
            this.currentRun.status = 'failed';
        }
        this.currentRun.error = error;
        this.currentRun.ended_at = new Date().toISOString();
        this.writeStatus(runDir, this.currentRun);
        onProgress?.(this.currentRun);

        const stderrPath = path.join(runDir, 'stderr.log');
        if (error) {
            fs.appendFileSync(stderrPath, `${error}\n`);
        }

        const failureResult: GenerationResult = { success: false, artifacts: [], error };
        // Fire onComplete AFTER status.json is written. Guarded so a buggy
        // listener can't prevent us from returning the failure to the caller.
        try {
            onComplete?.(failureResult, this.currentRun);
        } catch (cbErr) {
            this.log.warn('onComplete callback threw (non-fatal)', String(cbErr));
        }

        return failureResult;
    }

    private generateRunId(): string {
        const timestamp = Date.now().toString(36);
        const random = crypto.randomBytes(4).toString('hex');
        return `${timestamp}_${random}`;
    }

    private ensureDirectories(): void {
        const codecomfyDir = path.join(this.workspacePath, CODECOMFY_DIR);
        const outputsDir = path.join(codecomfyDir, OUTPUTS_DIR);
        const runsDir = path.join(codecomfyDir, RUNS_DIR);

        fs.mkdirSync(outputsDir, { recursive: true });
        fs.mkdirSync(runsDir, { recursive: true });
    }

    private getRunDir(runId: string): string {
        return path.join(this.workspacePath, CODECOMFY_DIR, RUNS_DIR, runId);
    }

    private writeJson(filePath: string, data: unknown): void {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    }

    private writeStatus(runDir: string, run: JobRun): void {
        this.writeJson(path.join(runDir, 'status.json'), run);
    }

    /**
     * Atomically update the output index.
     *
     * If the existing index is unreadable/unparseable, we log a warning
     * explaining WHERE the user's run data still lives on disk and fall
     * back to an empty index so the current run is not lost. If the
     * atomic rename fails (EACCES on Windows, antivirus locks), we retry
     * with backoff and clean up the temp file on final failure.
     */
    private updateIndex(runId: string, artifacts: Artifact[], request: JobRequest): void {
        const indexPath = path.join(
            this.workspacePath,
            CODECOMFY_DIR,
            OUTPUTS_DIR,
            INDEX_FILENAME
        );
        const runsRelPath = path.join(CODECOMFY_DIR, RUNS_DIR).replace(/\\/g, '/');

        let index: OutputIndex;
        if (fs.existsSync(indexPath)) {
            try {
                const content = fs.readFileSync(indexPath, 'utf-8');
                index = JSON.parse(content);
            } catch (parseErr) {
                const errMsg = parseErr instanceof Error ? parseErr.message : String(parseErr);
                this.log.warn(
                    `${indexPath} could not be parsed: ${errMsg}. Starting with empty index — your previous runs are still on disk at ${runsRelPath}/ but may not appear in the gallery until the index is rebuilt.`,
                );
                index = this.createEmptyIndex();
            }
        } else {
            index = this.createEmptyIndex();
        }

        const timestamp = new Date().toISOString();
        for (let i = 0; i < artifacts.length; i++) {
            const artifact = artifacts[i];
            const indexed: IndexedArtifact = {
                id: `${runId}_${i}`,
                type: artifact.type,
                path: artifact.path,
                created_at: timestamp,
                run_id: runId,
                meta: artifact.meta,
                provenance: {
                    ...artifact.provenance,
                    prompt: request.inputs.prompt,
                    negative_prompt: request.inputs.negative_prompt,
                    seed: request.inputs.seed,
                    preset_id: request.preset_id,
                },
            };

            // TreeView-required fields check — be lenient (warn, don't throw)
            // so legacy data and partial writers don't break generation.
            // Fields TreeView requires on every new entry:
            //   provenance.prompt, provenance.preset_id
            //   (video only) meta.thumbnail_path, meta.duration_seconds, meta.fps
            const missing: string[] = [];
            if (!indexed.provenance?.prompt) {
                missing.push('provenance.prompt');
            }
            if (!indexed.provenance?.preset_id) {
                missing.push('provenance.preset_id');
            }
            if (indexed.type === 'video') {
                if (!indexed.meta?.thumbnail_path) {
                    missing.push('meta.thumbnail_path');
                }
                if (typeof indexed.meta?.duration_seconds !== 'number') {
                    missing.push('meta.duration_seconds');
                }
                if (typeof indexed.meta?.fps !== 'number') {
                    missing.push('meta.fps');
                }
            }
            if (missing.length > 0) {
                this.log.warn(
                    `Run ${runId} artifact ${indexed.id} missing TreeView-required field(s): ${missing.join(', ')}. Entry written anyway; gallery may render it with placeholder labels.`,
                );
            }

            index.items.push(indexed);
        }

        const tempPath = `${indexPath}.tmp.${Date.now()}`;
        fs.writeFileSync(tempPath, JSON.stringify(index, null, 2));
        this.atomicRenameWithRetry(tempPath, indexPath, runId, runsRelPath);
    }

    /**
     * Attempt an atomic rename with up to 3 retries for transient locks
     * (EACCES / EBUSY from antivirus or indexers on Windows).
     * On final failure: clean up temp file, log actionable context, and
     * return without throwing — artifacts still exist on disk under runs/.
     */
    private atomicRenameWithRetry(
        tempPath: string,
        finalPath: string,
        runId: string,
        runsRelPath: string,
    ): void {
        const delays = [50, 200, 500];
        let lastErr: unknown;
        for (let attempt = 0; attempt < delays.length; attempt++) {
            try {
                fs.renameSync(tempPath, finalPath);
                return;
            } catch (err) {
                lastErr = err;
                const errMsg = err instanceof Error ? err.message : String(err);
                const nextDelay = delays[attempt];
                this.log.warn(
                    `Failed to update ${finalPath}: ${errMsg}. Retrying in ${nextDelay}ms...`,
                );
                // Synchronous backoff — updateIndex runs on the finalization
                // path and we want ordering preserved relative to status writes.
                const deadline = Date.now() + nextDelay;
                while (Date.now() < deadline) {
                    // Tight spin; delays are small (≤500ms) so this is fine
                    // and keeps the call synchronous like the surrounding code.
                }
            }
        }

        // Final failure — clean up temp file so we don't leak it.
        const finalErrMsg = lastErr instanceof Error ? lastErr.message : String(lastErr);
        try {
            if (fs.existsSync(tempPath)) {
                fs.unlinkSync(tempPath);
            }
        } catch (cleanupErr) {
            const cleanupMsg = cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr);
            this.log.warn(`Failed to clean up temp index file ${tempPath}: ${cleanupMsg}`);
        }
        this.log.warn(
            `Failed to update ${finalPath} after ${delays.length} retries (${finalErrMsg}). Temp file cleaned up. Your artifacts exist at ${runsRelPath}/${runId} but may not appear in the gallery.`,
        );
    }

    private createEmptyIndex(): OutputIndex {
        return {
            schema_version: INDEX_SCHEMA_VERSION,
            workspace_key: this.computeWorkspaceKey(),
            items: [],
        };
    }

    private computeWorkspaceKey(): string {
        return crypto
            .createHash('sha256')
            .update(this.workspacePath)
            .digest('hex')
            .substring(0, 16);
    }
}
