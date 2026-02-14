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
} from './comfyValidation';

export class ComfyServerEngine implements IGenerationEngine {
    readonly id = 'comfy-server';
    readonly name = 'ComfyUI Server';

    private serverUrl: string;
    private currentPromptId: string | null = null;
    private canceled = false;

    constructor(serverUrl: string = 'http://127.0.0.1:8188') {
        this.serverUrl = serverUrl.replace(/\/$/, '');
    }

    async isAvailable(): Promise<boolean> {
        try {
            const response = await fetch(`${this.serverUrl}/system_stats`, {
                method: 'GET',
                signal: AbortSignal.timeout(5000),
            });
            return response.ok;
        } catch {
            return false;
        }
    }

    async generate(request: JobRequest, preset: Preset): Promise<GenerationResult> {
        this.canceled = false;

        if (!(await this.isAvailable())) {
            return {
                success: false,
                artifacts: [],
                error: `ComfyUI server not reachable at ${this.serverUrl}. Start ComfyUI or update codecomfy.comfyuiUrl setting.`,
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
                error: err instanceof Error ? err.message : String(err),
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
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`ComfyUI error (HTTP ${response.status}): ${text}`);
            }

            const body: unknown = await response.json();
            return validatePromptResponse(body);
        } catch (err) {
            if (err instanceof ComfyResponseError) {
                throw new Error(`ComfyUI prompt response invalid: ${err.message}\nRaw: ${err.rawBody}`);
            }
            throw new Error(`Failed to submit prompt: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    private async pollForCompletion(promptId: string, timeoutMs = 300000): Promise<ValidatedHistoryEntry | null> {
        const startTime = Date.now();
        const backoff = new BackoffTimer();

        while (Date.now() - startTime < timeoutMs) {
            if (this.canceled) {
                return null;
            }

            try {
                const response = await fetch(`${this.serverUrl}/history/${promptId}`);
                if (!response.ok) {
                    await this.sleep(backoff.next());
                    continue;
                }

                const body: unknown = await response.json();
                const entry = validateHistoryResponse(body, promptId);

                if (entry?.status?.completed) {
                    return entry;
                }

                // Entry exists but not completed — progress detected, reset backoff
                if (entry) {
                    backoff.reset();
                }
            } catch (err) {
                // ComfyResponseError = shape mismatch — rethrow so the caller sees it
                if (err instanceof ComfyResponseError) {
                    throw new Error(`ComfyUI history response invalid: ${err.message}\nRaw: ${err.rawBody}`);
                }
                // Other errors (network) — let backoff grow
            }

            await this.sleep(backoff.next());
        }

        return null;
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

        for (const nodeId of Object.keys(history.outputs)) {
            const nodeOutput = history.outputs[nodeId];
            if (!nodeOutput.images) continue;

            for (const img of nodeOutput.images) {
                const imageData = await this.downloadImage(img.filename, img.subfolder, img.type);
                if (!imageData) continue;

                const ext = path.extname(img.filename) || '.png';
                const outputFilename = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`;
                const outputPath = path.join(outputDir, outputFilename);

                fs.writeFileSync(outputPath, imageData);

                const relativePath = path.join(CODECOMFY_DIR, OUTPUTS_DIR, outputFilename);
                const stats = fs.statSync(outputPath);

                artifacts.push({
                    type: 'image',
                    path: relativePath.replace(/\\/g, '/'),
                    size_bytes: stats.size,
                    provenance: { seed: request.inputs.seed },
                });
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

        // Download and save each frame
        for (let i = 0; i < allImages.length; i++) {
            const img = allImages[i];
            const imageData = await this.downloadImage(img.filename, img.subfolder, img.type);
            if (!imageData) continue;

            // Save with original filename (will be renamed by FFmpeg assembler)
            const outputPath = path.join(framesDir, img.filename);
            fs.writeFileSync(outputPath, imageData);

            // Relative path for artifact
            const relativePath = path.join(
                CODECOMFY_DIR,
                RUNS_DIR,
                request.run_id,
                'frames',
                img.filename
            );

            artifacts.push({
                type: 'image', // Frames are images; router assembles into video
                path: relativePath.replace(/\\/g, '/'),
                size_bytes: imageData.length,
            });
        }

        return artifacts;
    }

    private async downloadImage(
        filename: string,
        subfolder: string,
        type: string
    ): Promise<Buffer | null> {
        try {
            const params = new URLSearchParams({
                filename,
                subfolder: subfolder || '',
                type: type || 'output',
            });

            const response = await fetch(`${this.serverUrl}/view?${params}`);
            if (!response.ok) {
                return null;
            }

            const arrayBuffer = await response.arrayBuffer();
            return Buffer.from(arrayBuffer);
        } catch {
            return null;
        }
    }

    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
