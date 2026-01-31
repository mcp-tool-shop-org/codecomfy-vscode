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

export interface JobRouterOptions {
    ffmpegPath?: string;
}

export class JobRouter {
    private workspacePath: string;
    private engine: IGenerationEngine;
    private options: JobRouterOptions;
    private currentRun: JobRun | null = null;
    private cancelRequested = false;

    constructor(workspacePath: string, engine: IGenerationEngine, options: JobRouterOptions = {}) {
        this.workspacePath = workspacePath;
        this.engine = engine;
        this.options = options;
    }

    /**
     * Run a generation job.
     */
    async run(
        input: JobRequestInput,
        preset: Preset,
        onProgress?: (run: JobRun) => void
    ): Promise<GenerationResult> {
        this.cancelRequested = false;

        const runId = this.generateRunId();

        // For video: compute frame_count from fps and duration
        const processedInputs = { ...input.inputs };
        if (input.kind === 'video') {
            const fps = processedInputs.fps ?? preset.defaults.fps ?? 24;
            const duration = processedInputs.duration_seconds ?? preset.defaults.duration_seconds ?? 4;
            processedInputs.fps = fps;
            processedInputs.duration_seconds = duration;
            processedInputs.frame_count = Math.ceil(fps * duration);
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
            const result = await this.engine.generate(request, preset);

            if (!result.success) {
                return this.handleFailure(runDir, result.error, onProgress);
            }

            // For video: assemble frames into MP4
            let finalArtifacts: Artifact[];
            if (request.kind === 'video') {
                const videoResult = await this.assembleVideoFromFrames(request, result.artifacts);
                if (!videoResult.success) {
                    return this.handleFailure(runDir, videoResult.error, onProgress);
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

            return { success: true, artifacts: finalArtifacts };
        } catch (err) {
            return this.handleFailure(
                runDir,
                err instanceof Error ? err.message : String(err),
                onProgress
            );
        } finally {
            this.currentRun = null;
            this.cancelRequested = false;
        }
    }

    /**
     * Cancel the current run.
     */
    async cancel(): Promise<void> {
        if (this.currentRun) {
            this.cancelRequested = true;
            await this.engine.cancel();
        }
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
        frameArtifacts: Artifact[]
    ): Promise<{ success: boolean; artifacts: Artifact[]; error?: string }> {
        // Find FFmpeg
        const ffmpegPath = findFfmpeg(this.options.ffmpegPath);
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
        onProgress?: (run: JobRun) => void
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

        return { success: false, artifacts: [], error };
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
     */
    private updateIndex(runId: string, artifacts: Artifact[], request: JobRequest): void {
        const indexPath = path.join(
            this.workspacePath,
            CODECOMFY_DIR,
            OUTPUTS_DIR,
            INDEX_FILENAME
        );

        let index: OutputIndex;
        if (fs.existsSync(indexPath)) {
            try {
                const content = fs.readFileSync(indexPath, 'utf-8');
                index = JSON.parse(content);
            } catch {
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
            index.items.push(indexed);
        }

        const tempPath = `${indexPath}.tmp.${Date.now()}`;
        fs.writeFileSync(tempPath, JSON.stringify(index, null, 2));
        fs.renameSync(tempPath, indexPath);
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
