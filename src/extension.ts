import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';
import { getConfig } from './config';
import { JobRouter } from './router/jobRouter';
import { ComfyServerEngine } from './engines/comfyServerEngine';
import { getPresetRegistry } from './presets/registry';
import { JobRequestInput, JobRun, Preset } from './types';
import { parseSeed, validatePrompt } from './validation/inputs';
import { validateVideoLimits } from './validation/video';
import { createChannelLogger } from './logging/logger';

/**
 * Common install locations for NextGallery, OS-dependent.
 * NextGallery is currently Windows-only; paths for other platforms are
 * included as forward-looking placeholders.
 */
function getCommonNextGalleryPaths(): string[] {
    if (process.platform === 'win32') {
        return [
            path.join(process.env.LOCALAPPDATA || '', 'Programs', 'NextGallery', 'NextGallery.exe'),
            path.join(process.env.PROGRAMFILES || '', 'NextGallery', 'NextGallery.exe'),
            path.join(process.env['PROGRAMFILES(X86)'] || '', 'NextGallery', 'NextGallery.exe'),
        ];
    }
    if (process.platform === 'darwin') {
        return [
            '/Applications/NextGallery.app/Contents/MacOS/NextGallery',
            path.join(process.env.HOME || '', 'Applications', 'NextGallery.app', 'Contents', 'MacOS', 'NextGallery'),
        ];
    }
    // Linux
    return [
        '/usr/local/bin/nextgallery',
        path.join(process.env.HOME || '', '.local', 'bin', 'nextgallery'),
    ];
}

let statusBarItem: vscode.StatusBarItem;
let outputChannel: vscode.OutputChannel;
let currentRouter: JobRouter | null = null;

/** Short ISO timestamp for output-channel lines. */
function ts(): string {
    return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Fine-grained progress detail (UX F-256918-018)
// ---------------------------------------------------------------------------
/**
 * Optional, fine-grained progress detail for the status bar. Threaded from
 * JobRouter to onProgress alongside the coarse JobRun status so long video
 * runs can display "frame 42 / 96" instead of a static "Generating video...".
 *
 * Router/engine must populate these for full effect — see cross_domain_notes
 * on F-256918-018. When absent, the status bar falls back to coarse status.
 */
export interface ProgressDetail {
    frameCurrent?: number;
    frameTotal?: number;
    phase?: 'polling' | 'downloading' | 'assembling';
}

// ---------------------------------------------------------------------------
// Concurrency guard — only one generation at a time, with cooldown
// ---------------------------------------------------------------------------
/** Minimum milliseconds between the end of one generation and the start of the next. */
const GENERATION_COOLDOWN_MS = 2_000;

let generationActive = false;
let lastGenerationEndedAt = 0;
let idleTimer: ReturnType<typeof setTimeout> | undefined;

// ---------------------------------------------------------------------------
// Activation health cache (UX F-256918-015)
// ---------------------------------------------------------------------------
/**
 * Short TTL cache so rapid-fire commands don't re-ping ComfyUI. 60 seconds
 * is long enough to skip the re-check on a second command invocation, short
 * enough that a user who just started ComfyUI will see the recovery on the
 * next attempt.
 */
const HEALTH_CACHE_TTL_MS = 60_000;
let lastHealthOkAt = 0;
let lastHealthUrl: string | undefined;

interface HealthResult {
    ok: boolean;
    message?: string;
}

/**
 * Lightweight pre-flight: ensure ComfyUI is reachable before we prompt the
 * user for input. Cached for {@link HEALTH_CACHE_TTL_MS} ms per URL so the
 * user doesn't pay the latency twice in a row.
 */
async function ensureComfyReachable(engine: ComfyServerEngine, url: string): Promise<HealthResult> {
    const now = Date.now();
    if (lastHealthUrl === url && now - lastHealthOkAt < HEALTH_CACHE_TTL_MS) {
        return { ok: true };
    }

    outputChannel.appendLine(`[${ts()}] Checking ComfyUI at ${url}...`);
    const prevStatus = statusBarItem.text;
    statusBarItem.text = '$(pulse) CodeComfy: Checking ComfyUI...';

    try {
        const ok = await engine.isAvailable();
        if (ok) {
            outputChannel.appendLine(`[${ts()}] ✓ ComfyUI is reachable. Proceeding with generation.`);
            lastHealthOkAt = Date.now();
            lastHealthUrl = url;
            statusBarItem.text = prevStatus;
            return { ok: true };
        }
        const message = `ComfyUI not reachable at ${url}. Start ComfyUI or update codecomfy.comfyuiUrl.`;
        outputChannel.appendLine(`[${ts()}] ✗ ${message}`);
        statusBarItem.text = '$(error) CodeComfy: Not reachable';
        return { ok: false, message };
    } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        const message = `ComfyUI health check failed: ${detail}`;
        outputChannel.appendLine(`[${ts()}] ✗ ${message}`);
        statusBarItem.text = '$(error) CodeComfy: Not reachable';
        return { ok: false, message };
    }
}

// ---------------------------------------------------------------------------
// Output-channel header (UX F-256918-016)
// ---------------------------------------------------------------------------
/**
 * Write a structured, readable-at-a-glance header for a new generation run.
 * Makes back-to-back runs easy to scan in the output channel.
 */
function writeCommandHeader(
    commandLabel: string,
    config: ReturnType<typeof getConfig>,
): void {
    const ffmpegLabel = config.ffmpegPath
        ? config.ffmpegPath
        : 'auto-detect (PATH)';
    const bar = '════════════════════════════════════════';
    outputChannel.appendLine(bar);
    outputChannel.appendLine(` CodeComfy · ${commandLabel}`);
    outputChannel.appendLine(` Started: ${ts()}`);
    outputChannel.appendLine(` ComfyUI: ${config.comfyuiUrl}`);
    outputChannel.appendLine(` FFmpeg:  ${ffmpegLabel}`);
    outputChannel.appendLine(bar);
}

/**
 * Check whether a new generation can start.
 * Shows a message and returns `false` when blocked.
 */
function canStartGeneration(): boolean {
    if (generationActive) {
        vscode.window.showWarningMessage(
            'A generation is already running. Cancel it first or wait for it to finish.',
        );
        return false;
    }

    const elapsed = Date.now() - lastGenerationEndedAt;
    if (elapsed < GENERATION_COOLDOWN_MS) {
        const remaining = Math.ceil((GENERATION_COOLDOWN_MS - elapsed) / 1000);
        vscode.window.showWarningMessage(
            `Please wait ${remaining}s before starting another generation.`,
        );
        return false;
    }

    return true;
}

export function activate(context: vscode.ExtensionContext) {
    outputChannel = vscode.window.createOutputChannel('CodeComfy');
    context.subscriptions.push(outputChannel);

    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.text = '$(sparkle) CodeComfy: Idle';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // Load user-authored presets from the workspace .codecomfy/presets/ folder,
    // if any, and surface malformed-JSON failures in the output channel
    // (UX F-256918-022) instead of silently skipping them.
    try {
        const presetLogger = createChannelLogger('PresetRegistry', outputChannel);
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            const userPresetDir = path.join(
                workspaceFolders[0].uri.fsPath,
                '.codecomfy',
                'presets',
            );
            getPresetRegistry().loadFromDirectory(userPresetDir, presetLogger);
        }
    } catch {
        // Activation must never fail because of user presets. Silent catch
        // here is safe — logger inside loadFromDirectory reports real parse
        // failures; only unexpected FS errors reach this block.
    }

    context.subscriptions.push(
        vscode.commands.registerCommand('codecomfy.openGallery', openGalleryCommand),
        vscode.commands.registerCommand('codecomfy.generateImageHQ', generateImageHQCommand),
        vscode.commands.registerCommand('codecomfy.generateVideoHQ', generateVideoHQCommand),
        vscode.commands.registerCommand('codecomfy.cancelGeneration', cancelGenerationCommand),
        vscode.commands.registerCommand('codecomfy.openOutputChannel', () => {
            outputChannel.show(true);
        })
    );
}

// =============================================================================
// Commands
// =============================================================================

async function openGalleryCommand(): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showWarningMessage('Open a folder or workspace first.');
        return;
    }

    const workspacePath = workspaceFolders[0].uri.fsPath;
    const exePath = findNextGalleryExecutable();

    if (!exePath) {
        const exeName = process.platform === 'win32' ? 'NextGallery.exe' : 'NextGallery';
        const action = await vscode.window.showErrorMessage(
            `${exeName} not found. Set the path in settings.`,
            'Open Settings'
        );
        if (action === 'Open Settings') {
            vscode.commands.executeCommand('workbench.action.openSettings', 'codecomfy.nextGalleryPath');
        }
        return;
    }

    try {
        const child = spawn(exePath, ['--workspace', workspacePath], {
            detached: true,
            stdio: 'ignore',
            windowsHide: false,
        });
        child.unref();
        vscode.window.showInformationMessage('Opening CodeComfy Gallery...');
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Failed to launch NextGallery: ${message}`);
    }
}

async function generateImageHQCommand(): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showWarningMessage('Open a folder or workspace first.');
        return;
    }
    if (!canStartGeneration()) return;

    const workspacePath = workspaceFolders[0].uri.fsPath;
    const config = getConfig();

    // Write the command header first so users see which run started even
    // if they cancel at the prompt (UX F-256918-016).
    writeCommandHeader('Generate Image (HQ)', config);
    outputChannel.show(true);

    // Pre-flight ComfyUI reachability BEFORE prompting for input
    // (UX F-256918-015). Don't make the user type a prompt only to be
    // told ComfyUI is down seconds later.
    const preflightEngine = new ComfyServerEngine(config.comfyuiUrl, undefined, { checkpoint: config.defaultCheckpoint });
    const health = await ensureComfyReachable(preflightEngine, config.comfyuiUrl);
    if (!health.ok) {
        vscode.window.showErrorMessage(health.message ?? 'ComfyUI is not reachable.');
        return;
    }

    // --- Prompt ---
    const rawPrompt = await vscode.window.showInputBox({
        title: 'Generate Image (HQ)',
        prompt: 'Enter your prompt',
        placeHolder: 'A beautiful sunset over mountains...',
    });

    if (rawPrompt === undefined) return; // user pressed Escape

    const promptResult = validatePrompt(rawPrompt);
    if (!promptResult.valid) {
        vscode.window.showErrorMessage(promptResult.error!);
        return;
    }
    const prompt = promptResult.value!;

    // --- Negative Prompt ---
    const defaultNeg = vscode.workspace.getConfiguration('codecomfy').get<string>('defaultNegativePrompt', '');
    const rawNegativePrompt = await vscode.window.showInputBox({
        title: 'Negative Prompt (optional)',
        prompt: 'Enter what you want to avoid (press Enter to skip)',
        placeHolder: 'e.g., blurry, distorted, low quality',
        value: defaultNeg,
        validateInput: (v) => v && v.length > 8000 ? 'Must be 8,000 characters or fewer' : null,
    });
    if (rawNegativePrompt === undefined) return;
    const negativePrompt = rawNegativePrompt.trim();

    // --- Seed ---
    const rawSeed = await vscode.window.showInputBox({
        title: 'Seed (optional)',
        prompt: 'Enter a seed for reproducibility, or leave empty for random',
        placeHolder: 'e.g., 12345',
    });

    const seedResult = parseSeed(rawSeed);
    if (!seedResult.valid) {
        vscode.window.showErrorMessage(seedResult.error!);
        return;
    }
    const seed = seedResult.value;

    const preset = getPresetRegistry().get('hq-image');
    if (!preset) {
        vscode.window.showErrorMessage('HQ Image preset not found.');
        return;
    }

    const engine = new ComfyServerEngine(config.comfyuiUrl, undefined, { checkpoint: config.defaultCheckpoint });
    const logger = createChannelLogger('JobRouter', outputChannel);
    const router = new JobRouter(workspacePath, engine, { ffmpegPath: config.ffmpegPath, logger });
    currentRouter = router;

    const requestInput: JobRequestInput = {
        kind: 'image',
        preset_id: preset.id,
        inputs: {
            prompt,
            negative_prompt: negativePrompt,
            seed,
            width: preset.defaults.width,
            height: preset.defaults.height,
            steps: preset.defaults.steps,
            cfg_scale: preset.defaults.cfg_scale,
        },
    };

    outputChannel.appendLine(`[${ts()}] Starting image generation...`);
    outputChannel.appendLine(`Prompt: ${prompt}`);
    if (negativePrompt) {
        outputChannel.appendLine(`Negative: ${negativePrompt}`);
    }
    if (seed !== undefined) {
        outputChannel.appendLine(`Seed: ${seed}`);
    }

    await runGeneration(router, requestInput, preset, config, 'image');
}

async function generateVideoHQCommand(): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showWarningMessage('Open a folder or workspace first.');
        return;
    }
    if (!canStartGeneration()) return;

    const workspacePath = workspaceFolders[0].uri.fsPath;
    const config = getConfig();

    // Header + pre-flight up front (UX F-256918-015, F-256918-016)
    writeCommandHeader('Generate Video (HQ)', config);
    outputChannel.show(true);

    const preflightEngine = new ComfyServerEngine(config.comfyuiUrl, undefined, { checkpoint: config.defaultCheckpoint });
    const health = await ensureComfyReachable(preflightEngine, config.comfyuiUrl);
    if (!health.ok) {
        vscode.window.showErrorMessage(health.message ?? 'ComfyUI is not reachable.');
        return;
    }

    // --- Prompt ---
    const rawPrompt = await vscode.window.showInputBox({
        title: 'Generate Video (HQ)',
        prompt: 'Enter your prompt',
        placeHolder: 'A cinematic landscape with moving clouds...',
    });

    if (rawPrompt === undefined) return; // user pressed Escape

    const promptResult = validatePrompt(rawPrompt);
    if (!promptResult.valid) {
        vscode.window.showErrorMessage(promptResult.error!);
        return;
    }
    const prompt = promptResult.value!;

    // --- Negative Prompt ---
    const defaultNegV = vscode.workspace.getConfiguration('codecomfy').get<string>('defaultNegativePrompt', '');
    const rawNegativePromptV = await vscode.window.showInputBox({
        title: 'Negative Prompt (optional)',
        prompt: 'Enter what you want to avoid (press Enter to skip)',
        placeHolder: 'e.g., blurry, distorted, low quality',
        value: defaultNegV,
        validateInput: (v) => v && v.length > 8000 ? 'Must be 8,000 characters or fewer' : null,
    });
    if (rawNegativePromptV === undefined) return;
    const negativePromptV = rawNegativePromptV.trim();

    // --- Seed ---
    const rawSeed = await vscode.window.showInputBox({
        title: 'Seed (optional)',
        prompt: 'Enter a seed for reproducibility, or leave empty for random',
        placeHolder: 'e.g., 12345',
    });

    const seedResult = parseSeed(rawSeed);
    if (!seedResult.valid) {
        vscode.window.showErrorMessage(seedResult.error!);
        return;
    }
    const seed = seedResult.value;

    // Duration picker
    const durationChoice = await vscode.window.showQuickPick(
        ['2 seconds', '4 seconds (default)', '8 seconds'],
        { title: 'Video Duration', placeHolder: 'Select duration' }
    );

    let duration = 4;
    if (durationChoice?.startsWith('2')) duration = 2;
    if (durationChoice?.startsWith('8')) duration = 8;

    const preset = getPresetRegistry().get('hq-video');
    if (!preset) {
        vscode.window.showErrorMessage('HQ Video preset not found.');
        return;
    }

    // --- Video safety limits ---
    const fps = preset.defaults.fps ?? 24;
    const limitsResult = validateVideoLimits(duration, fps);
    if (!limitsResult.valid) {
        vscode.window.showErrorMessage(limitsResult.error!);
        return;
    }

    const engine = new ComfyServerEngine(config.comfyuiUrl, undefined, { checkpoint: config.defaultCheckpoint });
    const logger = createChannelLogger('JobRouter', outputChannel);
    const router = new JobRouter(workspacePath, engine, { ffmpegPath: config.ffmpegPath, logger });
    currentRouter = router;

    const requestInput: JobRequestInput = {
        kind: 'video',
        preset_id: preset.id,
        inputs: {
            prompt,
            negative_prompt: negativePromptV,
            seed,
            width: preset.defaults.width,
            height: preset.defaults.height,
            steps: preset.defaults.steps,
            cfg_scale: preset.defaults.cfg_scale,
            fps,
            duration_seconds: duration,
        },
    };

    outputChannel.appendLine(`[${ts()}] Starting video generation...`);
    outputChannel.appendLine(`Prompt: ${prompt}`);
    if (negativePromptV) {
        outputChannel.appendLine(`Negative: ${negativePromptV}`);
    }
    outputChannel.appendLine(`Duration: ${duration}s @ ${fps}fps (${Math.ceil(duration * fps)} frames)`);
    if (seed !== undefined) {
        outputChannel.appendLine(`Seed: ${seed}`);
    }

    await runGeneration(router, requestInput, preset, config, 'video');
}

async function cancelGenerationCommand(): Promise<void> {
    if (!currentRouter) {
        vscode.window.showInformationMessage('No generation in progress.');
        return;
    }

    // Immediate synchronous UI feedback BEFORE awaiting the router
    // (UX F-256918-014). Without this, the status bar stays on
    // "Generating..." for seconds while the async cancel unwinds.
    statusBarItem.text = '$(circle-slash) CodeComfy: Cancelling...';
    statusBarItem.tooltip = 'Waiting for the active run to stop cleanly';
    outputChannel.appendLine(`[${ts()}] ── CodeComfy · Cancel requested by user ──`);

    await currentRouter.cancel();
    // The onProgress handler finalises the status bar to "Canceled" once
    // the router observes the canceled state — we don't overwrite it here.
    vscode.window.showInformationMessage('Generation canceled.');
}

// =============================================================================
// Shared Generation Logic
// =============================================================================

async function runGeneration(
    router: JobRouter,
    requestInput: JobRequestInput,
    preset: Preset,
    config: ReturnType<typeof getConfig>,
    type: 'image' | 'video'
): Promise<void> {
    /**
     * Frame-level status-bar granularity (UX F-256918-018).
     *
     * If the router/engine supplies a `detail` argument populated with
     * frameCurrent/frameTotal/phase, render a specific line such as
     * "Generating... (frame 42 / 96)". If detail is absent (current
     * JobRouter behavior), fall back to the coarse per-status text.
     *
     * See cross_domain_notes — router/engine must start calling
     * onProgress with this second arg for the fine-grained display to
     * appear. Surfacing the hook here is additive and harmless today.
     */
    const onProgress = (run: JobRun, detail?: ProgressDetail) => {
        switch (run.status) {
            case 'queued':
                statusBarItem.text = '$(loading~spin) CodeComfy: Queued...';
                break;
            case 'running': {
                if (detail?.phase === 'downloading' && detail.frameTotal) {
                    statusBarItem.text = `$(loading~spin) CodeComfy: Downloading frame ${detail.frameCurrent ?? '?'} / ${detail.frameTotal}`;
                } else if (detail?.phase === 'assembling') {
                    statusBarItem.text = '$(loading~spin) CodeComfy: Assembling video (FFmpeg)';
                } else if (detail?.frameTotal) {
                    statusBarItem.text = `$(loading~spin) CodeComfy: Generating... (frame ${detail.frameCurrent ?? 0} / ${detail.frameTotal})`;
                } else {
                    statusBarItem.text = type === 'video'
                        ? '$(loading~spin) CodeComfy: Generating video...'
                        : '$(loading~spin) CodeComfy: Generating...';
                }
                break;
            }
            case 'succeeded':
                statusBarItem.text = '$(check) CodeComfy: Done';
                break;
            case 'failed':
                statusBarItem.text = '$(error) CodeComfy: Failed';
                break;
            case 'canceled':
                statusBarItem.text = '$(circle-slash) CodeComfy: Canceled';
                break;
        }
    };

    generationActive = true;

    try {
        const result = await router.run(requestInput, preset, onProgress);

        if (result.success) {
            const artifactCount = result.artifacts.length;
            const typeLabel = type === 'video' ? 'video(s)' : 'image(s)';
            outputChannel.appendLine(`Generation complete! ${artifactCount} ${typeLabel} created.`);

            for (const artifact of result.artifacts) {
                outputChannel.appendLine(`  - ${artifact.path}`);
            }

            vscode.window.showInformationMessage(
                `Generated ${artifactCount} ${typeLabel}`,
                'Open Gallery'
            ).then((action) => {
                if (action === 'Open Gallery') {
                    vscode.commands.executeCommand('codecomfy.openGallery');
                }
            });

            if (config.autoOpenGalleryOnComplete) {
                vscode.commands.executeCommand('codecomfy.openGallery');
            }
        } else {
            outputChannel.appendLine(`Generation failed: ${result.error}`);
            vscode.window.showErrorMessage(`Generation failed: ${result.error}`);
        }
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        outputChannel.appendLine(`Error: ${message}`);
        vscode.window.showErrorMessage(`Generation error: ${message}`);
    } finally {
        currentRouter = null;
        generationActive = false;
        lastGenerationEndedAt = Date.now();

        // Reset status bar after a delay — clear any previous timer first
        // to avoid a stale timer overwriting the status mid-generation.
        if (idleTimer !== undefined) {
            clearTimeout(idleTimer);
        }
        idleTimer = setTimeout(() => {
            statusBarItem.text = '$(sparkle) CodeComfy: Idle';
            idleTimer = undefined;
        }, 3000);
    }
}

// =============================================================================
// Helpers
// =============================================================================

function findNextGalleryExecutable(): string | undefined {
    const config = vscode.workspace.getConfiguration('codecomfy');
    const configuredPath = config.get<string>('nextGalleryPath');

    if (configuredPath && fs.existsSync(configuredPath)) {
        return configuredPath;
    }

    for (const candidatePath of getCommonNextGalleryPaths()) {
        if (candidatePath && fs.existsSync(candidatePath)) {
            return candidatePath;
        }
    }

    return undefined;
}

export function deactivate() {
    // Clear any pending idle timer before disposal so it can't fire
    // against a disposed statusBarItem after deactivate() returns.
    if (idleTimer !== undefined) {
        clearTimeout(idleTimer);
        idleTimer = undefined;
    }
    // outputChannel is managed via context.subscriptions; no manual dispose needed.
}
