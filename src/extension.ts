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
 * Common install locations for NextGallery on Windows
 */
const COMMON_PATHS = [
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'NextGallery', 'NextGallery.exe'),
    path.join(process.env.PROGRAMFILES || '', 'NextGallery', 'NextGallery.exe'),
    path.join(process.env['PROGRAMFILES(X86)'] || '', 'NextGallery', 'NextGallery.exe'),
];

let statusBarItem: vscode.StatusBarItem;
let outputChannel: vscode.OutputChannel;
let currentRouter: JobRouter | null = null;

// ---------------------------------------------------------------------------
// Concurrency guard — only one generation at a time, with cooldown
// ---------------------------------------------------------------------------
/** Minimum milliseconds between the end of one generation and the start of the next. */
const GENERATION_COOLDOWN_MS = 2_000;

let generationActive = false;
let lastGenerationEndedAt = 0;
let idleTimer: ReturnType<typeof setTimeout> | undefined;

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

    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.text = '$(sparkle) CodeComfy: Idle';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    context.subscriptions.push(
        vscode.commands.registerCommand('codecomfy.openGallery', openGalleryCommand),
        vscode.commands.registerCommand('codecomfy.generateImageHQ', generateImageHQCommand),
        vscode.commands.registerCommand('codecomfy.generateVideoHQ', generateVideoHQCommand),
        vscode.commands.registerCommand('codecomfy.cancelGeneration', cancelGenerationCommand)
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
        const action = await vscode.window.showErrorMessage(
            'NextGallery.exe not found. Set the path in settings.',
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

    const engine = new ComfyServerEngine(config.comfyuiUrl);
    const logger = createChannelLogger('JobRouter', outputChannel);
    const router = new JobRouter(workspacePath, engine, { ffmpegPath: config.ffmpegPath, logger });
    currentRouter = router;

    const requestInput: JobRequestInput = {
        kind: 'image',
        preset_id: preset.id,
        inputs: {
            prompt,
            negative_prompt: '',
            seed,
            width: preset.defaults.width,
            height: preset.defaults.height,
            steps: preset.defaults.steps,
            cfg_scale: preset.defaults.cfg_scale,
        },
    };

    outputChannel.appendLine(`[${new Date().toISOString()}] Starting image generation...`);
    outputChannel.appendLine(`Prompt: ${prompt}`);
    if (seed !== undefined) {
        outputChannel.appendLine(`Seed: ${seed}`);
    }
    outputChannel.show(true);

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

    const engine = new ComfyServerEngine(config.comfyuiUrl);
    const logger = createChannelLogger('JobRouter', outputChannel);
    const router = new JobRouter(workspacePath, engine, { ffmpegPath: config.ffmpegPath, logger });
    currentRouter = router;

    const requestInput: JobRequestInput = {
        kind: 'video',
        preset_id: preset.id,
        inputs: {
            prompt,
            negative_prompt: '',
            seed,
            width: preset.defaults.width,
            height: preset.defaults.height,
            steps: preset.defaults.steps,
            cfg_scale: preset.defaults.cfg_scale,
            fps,
            duration_seconds: duration,
        },
    };

    outputChannel.appendLine(`[${new Date().toISOString()}] Starting video generation...`);
    outputChannel.appendLine(`Prompt: ${prompt}`);
    outputChannel.appendLine(`Duration: ${duration}s @ ${fps}fps (${Math.ceil(duration * fps)} frames)`);
    if (seed !== undefined) {
        outputChannel.appendLine(`Seed: ${seed}`);
    }
    outputChannel.show(true);

    await runGeneration(router, requestInput, preset, config, 'video');
}

async function cancelGenerationCommand(): Promise<void> {
    if (currentRouter) {
        await currentRouter.cancel();
        vscode.window.showInformationMessage('Generation canceled.');
    } else {
        vscode.window.showInformationMessage('No generation in progress.');
    }
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
    const onProgress = (run: JobRun) => {
        switch (run.status) {
            case 'queued':
                statusBarItem.text = '$(loading~spin) CodeComfy: Queued...';
                break;
            case 'running':
                statusBarItem.text = type === 'video'
                    ? '$(loading~spin) CodeComfy: Generating video...'
                    : '$(loading~spin) CodeComfy: Generating...';
                break;
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

    for (const candidatePath of COMMON_PATHS) {
        if (candidatePath && fs.existsSync(candidatePath)) {
            return candidatePath;
        }
    }

    return undefined;
}

export function deactivate() {
    if (outputChannel) {
        outputChannel.dispose();
    }
}
