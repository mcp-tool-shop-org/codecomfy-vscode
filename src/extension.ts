import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';
import { getConfig } from './config';
import { JobRouter } from './router/jobRouter';
import { ComfyServerEngine } from './engines/comfyServerEngine';
import { getPresetRegistry } from './presets/registry';
import { GenerationKind, JobRequestInput, JobRun, Preset, ProgressDetail } from './types';
import {
    PROFILES,
    ProfileId,
    KbPreset,
    kbPresetsForProfile,
    requiredInputs,
    toEnginePreset,
} from './profiles/registry';
import { preflightPreset } from './engines/preflight';
import { readPngWorkflow } from './profiles/metadata';
import { parseSeed, validatePrompt } from './validation/inputs';
import { validateVideoLimits } from './validation/video';
import { createChannelLogger } from './logging/logger';
import { RunHistoryProvider } from './runHistoryProvider';

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
        }),
        // FT-020: QuickPick across bundled + user-authored presets
        vscode.commands.registerCommand('codecomfy.customWorkflow', customWorkflowCommand),
        // FT-023: Re-run a historical job by runId (TreeView action)
        vscode.commands.registerCommand('codecomfy.rerunJob', rerunJobCommand),
        // FT-024: Seed a new user preset file from a bundled HQ template
        vscode.commands.registerCommand('codecomfy.newPresetFromHQ', newPresetFromHQCommand),
        vscode.commands.registerCommand('codecomfy.runProfile', runProfileCommand),
        vscode.commands.registerCommand('codecomfy.clearQueue', clearQueueCommand),
        vscode.commands.registerCommand('codecomfy.readPngWorkflow', readPngWorkflowCommand),
    );

    // FT-022: Run-history TreeView. Registering unconditionally — the
    // provider renders an informative empty state when there's no
    // workspace or no index yet.
    const workspaceFoldersForTree = vscode.workspace.workspaceFolders;
    if (workspaceFoldersForTree && workspaceFoldersForTree.length > 0) {
        const runHistoryProvider = new RunHistoryProvider(workspaceFoldersForTree[0].uri.fsPath);
        context.subscriptions.push(
            vscode.window.registerTreeDataProvider('codecomfy.runHistory', runHistoryProvider),
            { dispose: () => runHistoryProvider.dispose() },
        );
    }
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

// -----------------------------------------------------------------------------
// FT-020: Custom Workflow QuickPick
// -----------------------------------------------------------------------------
/**
 * "CodeComfy: Generate from Custom Workflow" — shows a QuickPick across
 * bundled HQ presets + any user-authored presets loaded from
 * `.codecomfy/presets/`, then funnels the pick through the standard
 * runGeneration path. The preset's `kind` drives whether we prompt for
 * video-specific inputs (duration/fps).
 *
 * FT-025: `preset.description` is consumed as the QuickPick `detail`
 * line when present (falls back to "User preset at <path>" else
 * "Bundled preset"). The `description?: string` field is added by the
 * router agent in src/types/index.ts; until that lands we read it via
 * a structural index to avoid a type error on older Preset shapes.
 */
async function customWorkflowCommand(): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showWarningMessage('Open a folder or workspace first.');
        return;
    }
    if (!canStartGeneration()) return;

    const workspacePath = workspaceFolders[0].uri.fsPath;
    const config = getConfig();

    const registry = getPresetRegistry();
    const all = registry.list();
    if (all.length === 0) {
        const action = await vscode.window.showInformationMessage(
            'No presets loaded. Create one from a bundled HQ template to get started.',
            'Create from HQ Template',
        );
        if (action === 'Create from HQ Template') {
            vscode.commands.executeCommand('codecomfy.newPresetFromHQ');
        }
        return;
    }

    interface PresetPickItem extends vscode.QuickPickItem {
        preset: Preset;
    }
    const items: PresetPickItem[] = all.map((preset) => {
        const description = (preset as unknown as { description?: string }).description;
        const isBundled = preset.id === 'hq-image' || preset.id === 'hq-video';
        return {
            label: preset.name,
            description: preset.kind,
            detail: description ?? (isBundled ? 'Bundled preset' : `User preset (id: ${preset.id})`),
            preset,
        };
    });

    const pick = await vscode.window.showQuickPick(items, {
        title: 'Generate from Custom Workflow',
        placeHolder: 'Select a preset to run',
        matchOnDescription: true,
        matchOnDetail: true,
    });
    if (!pick) return;
    const preset = pick.preset;

    writeCommandHeader(`Custom Workflow · ${preset.name}`, config);
    outputChannel.show(true);

    const preflightEngine = new ComfyServerEngine(config.comfyuiUrl, undefined, { checkpoint: config.defaultCheckpoint });
    const health = await ensureComfyReachable(preflightEngine, config.comfyuiUrl);
    if (!health.ok) {
        vscode.window.showErrorMessage(health.message ?? 'ComfyUI is not reachable.');
        return;
    }

    const inputs = await promptGenerationInputs(preset);
    if (!inputs) return; // user cancelled

    const engine = new ComfyServerEngine(config.comfyuiUrl, undefined, { checkpoint: config.defaultCheckpoint });
    const logger = createChannelLogger('JobRouter', outputChannel);
    const router = new JobRouter(workspacePath, engine, { ffmpegPath: config.ffmpegPath, logger });
    currentRouter = router;

    const requestInput: JobRequestInput = {
        kind: preset.kind,
        preset_id: preset.id,
        inputs: {
            prompt: inputs.prompt,
            negative_prompt: inputs.negativePrompt,
            seed: inputs.seed,
            width: preset.defaults.width,
            height: preset.defaults.height,
            steps: preset.defaults.steps,
            cfg_scale: preset.defaults.cfg_scale,
            ...(preset.kind === 'video'
                ? {
                    fps: preset.defaults.fps ?? 24,
                    duration_seconds: inputs.durationSeconds ?? preset.defaults.duration_seconds ?? 4,
                }
                : {}),
        },
    };

    outputChannel.appendLine(`[${ts()}] Starting ${preset.kind} generation via "${preset.name}"...`);
    outputChannel.appendLine(`Prompt: ${inputs.prompt}`);
    if (inputs.negativePrompt) outputChannel.appendLine(`Negative: ${inputs.negativePrompt}`);
    if (inputs.seed !== undefined) outputChannel.appendLine(`Seed: ${inputs.seed}`);

    await runGeneration(router, requestInput, preset, config, preset.kind);
}

interface CollectedInputs {
    prompt: string;
    negativePrompt: string;
    seed: number | undefined;
    durationSeconds?: number;
}

/**
 * Shared input-collection helper for the custom-workflow path. Mirrors
 * the prompt/negative/seed flow used by the HQ commands but keyed off
 * the preset kind so video presets also get a duration picker.
 *
 * Returns `undefined` if the user cancelled (Escape on any step).
 */
async function promptGenerationInputs(preset: Preset): Promise<CollectedInputs | undefined> {
    const rawPrompt = await vscode.window.showInputBox({
        title: `Prompt · ${preset.name}`,
        prompt: 'Enter your prompt',
        placeHolder: 'A beautiful sunset over mountains...',
    });
    if (rawPrompt === undefined) return undefined;
    const promptResult = validatePrompt(rawPrompt);
    if (!promptResult.valid) {
        vscode.window.showErrorMessage(promptResult.error!);
        return undefined;
    }

    const defaultNeg = vscode.workspace.getConfiguration('codecomfy').get<string>('defaultNegativePrompt', '');
    const rawNegativePrompt = await vscode.window.showInputBox({
        title: 'Negative Prompt (optional)',
        prompt: 'Enter what you want to avoid (press Enter to skip)',
        placeHolder: 'e.g., blurry, distorted, low quality',
        value: defaultNeg,
        validateInput: (v) => v && v.length > 8000 ? 'Must be 8,000 characters or fewer' : null,
    });
    if (rawNegativePrompt === undefined) return undefined;

    const rawSeed = await vscode.window.showInputBox({
        title: 'Seed (optional)',
        prompt: 'Enter a seed for reproducibility, or leave empty for random',
        placeHolder: 'e.g., 12345',
    });
    const seedResult = parseSeed(rawSeed);
    if (!seedResult.valid) {
        vscode.window.showErrorMessage(seedResult.error!);
        return undefined;
    }

    let durationSeconds: number | undefined;
    if (preset.kind === 'video') {
        const durationChoice = await vscode.window.showQuickPick(
            ['2 seconds', '4 seconds (default)', '8 seconds'],
            { title: 'Video Duration', placeHolder: 'Select duration' },
        );
        if (durationChoice === undefined) return undefined;
        if (durationChoice.startsWith('2')) durationSeconds = 2;
        else if (durationChoice.startsWith('8')) durationSeconds = 8;
        else durationSeconds = 4;

        const fps = preset.defaults.fps ?? 24;
        const limitsResult = validateVideoLimits(durationSeconds, fps);
        if (!limitsResult.valid) {
            vscode.window.showErrorMessage(limitsResult.error!);
            return undefined;
        }
    }

    return {
        prompt: promptResult.value!,
        negativePrompt: rawNegativePrompt.trim(),
        seed: seedResult.value,
        durationSeconds,
    };
}

// -----------------------------------------------------------------------------
// FT-023: Re-run an existing job by runId (invoked from the TreeView)
// -----------------------------------------------------------------------------
/**
 * Reads `.codecomfy/runs/<runId>/request.json`, hydrates the original
 * request input + preset, and funnels through the normal runGeneration
 * path. Handles two graceful-degradation cases:
 *
 *   - runId not provided / run folder missing → error toast, no crash
 *   - referenced preset no longer loaded (user deleted it) → error toast
 *
 * A re-run produces a NEW run_id — the router owns id generation, so
 * the history TreeView naturally grows a new node rather than mutating
 * the old one. That matches how users expect "re-run" to behave in
 * most IDE tree views.
 */
async function rerunJobCommand(runId?: string): Promise<void> {
    if (!runId) {
        vscode.window.showErrorMessage('Re-run requires a run id. Right-click a run in the history view.');
        return;
    }
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showWarningMessage('Open a folder or workspace first.');
        return;
    }
    if (!canStartGeneration()) return;

    const workspacePath = workspaceFolders[0].uri.fsPath;
    const requestPath = path.join(workspacePath, '.codecomfy', 'runs', runId, 'request.json');
    if (!fs.existsSync(requestPath)) {
        vscode.window.showErrorMessage(`Cannot re-run ${runId}: request.json not found.`);
        return;
    }

    let originalRequest: JobRequestInput & { preset_id: string };
    try {
        const raw = fs.readFileSync(requestPath, 'utf-8');
        originalRequest = JSON.parse(raw);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Cannot re-run ${runId}: request.json is unreadable (${message}).`);
        return;
    }

    const preset = getPresetRegistry().get(originalRequest.preset_id);
    if (!preset) {
        vscode.window.showErrorMessage(
            `Cannot re-run ${runId}: preset "${originalRequest.preset_id}" is no longer loaded. ` +
            'Restore the preset file or pick a different one via "Generate from Custom Workflow".',
        );
        return;
    }

    const config = getConfig();
    writeCommandHeader(`Re-run · ${runId}`, config);
    outputChannel.show(true);

    const preflightEngine = new ComfyServerEngine(config.comfyuiUrl, undefined, { checkpoint: config.defaultCheckpoint });
    const health = await ensureComfyReachable(preflightEngine, config.comfyuiUrl);
    if (!health.ok) {
        vscode.window.showErrorMessage(health.message ?? 'ComfyUI is not reachable.');
        return;
    }

    const engine = new ComfyServerEngine(config.comfyuiUrl, undefined, { checkpoint: config.defaultCheckpoint });
    const logger = createChannelLogger('JobRouter', outputChannel);
    const router = new JobRouter(workspacePath, engine, { ffmpegPath: config.ffmpegPath, logger });
    currentRouter = router;

    // Strip any router-assigned fields (run_id, created_at, workspace_path)
    // so the router generates a fresh run_id. The original inputs object
    // is what we want to replay exactly.
    const requestInput: JobRequestInput = {
        kind: originalRequest.kind,
        preset_id: originalRequest.preset_id,
        inputs: { ...originalRequest.inputs },
    };

    outputChannel.appendLine(`[${ts()}] Re-running ${runId} with preset "${preset.name}"...`);
    if (typeof requestInput.inputs.prompt === 'string') {
        outputChannel.appendLine(`Prompt: ${requestInput.inputs.prompt}`);
    }

    await runGeneration(router, requestInput, preset, config, preset.kind);
}

// -----------------------------------------------------------------------------
// FT-024: Create a user preset from a bundled HQ template
// -----------------------------------------------------------------------------
/**
 * Seeds `.codecomfy/presets/<user-name>.json` from the bundled HQ
 * image or video preset. Confirms before overwriting an existing file,
 * then opens it in VS Code's JSON editor so the user can tweak
 * defaults + workflow to taste.
 *
 * The new file keeps the bundled `workflow` intact — workflow editing
 * is where users actually want control. Only the `id` is rewritten to
 * the sanitized user-chosen name so the registry treats it as a
 * distinct entry.
 */
async function newPresetFromHQCommand(): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showWarningMessage('Open a folder or workspace first.');
        return;
    }
    const workspacePath = workspaceFolders[0].uri.fsPath;

    const template = await vscode.window.showQuickPick(
        ['Image (HQ)', 'Video (HQ)'],
        { title: 'New Preset from HQ Template', placeHolder: 'Pick a template to copy' },
    );
    if (!template) return;
    const sourceId = template.startsWith('Image') ? 'hq-image' : 'hq-video';

    const rawName = await vscode.window.showInputBox({
        title: 'Preset name',
        prompt: 'Alphanumeric + dash/underscore (e.g. my-portrait, anime_video)',
        placeHolder: 'my-portrait',
        validateInput: (v) => {
            if (!v || v.trim().length === 0) return 'Name cannot be empty';
            if (!/^[a-zA-Z0-9_-]+$/.test(v.trim())) return 'Use only letters, digits, dash, underscore';
            if (v.trim().length > 64) return 'Name must be 64 characters or fewer';
            return null;
        },
    });
    if (!rawName) return;
    const userName = rawName.trim();

    const source = getPresetRegistry().get(sourceId);
    if (!source) {
        vscode.window.showErrorMessage(`Bundled preset "${sourceId}" is missing — reinstall the extension?`);
        return;
    }

    const presetsDir = path.join(workspacePath, '.codecomfy', 'presets');
    const newPath = path.join(presetsDir, `${userName}.json`);

    if (fs.existsSync(newPath)) {
        const overwrite = await vscode.window.showWarningMessage(
            `"${userName}.json" already exists in .codecomfy/presets/. Overwrite?`,
            { modal: true },
            'Overwrite',
        );
        if (overwrite !== 'Overwrite') return;
    }

    // Build the new preset — clone the bundled source and rename the id
    // so the registry doesn't collide with the bundled entry.
    const newPreset: Preset = {
        ...source,
        id: userName,
        name: `${source.name} (${userName})`,
    };

    try {
        fs.mkdirSync(presetsDir, { recursive: true });
        fs.writeFileSync(newPath, JSON.stringify(newPreset, null, 2), 'utf-8');
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Failed to write preset: ${message}`);
        return;
    }

    // Register the new preset immediately so Generate from Custom
    // Workflow sees it without needing a reload.
    try {
        const presetLogger = createChannelLogger('PresetRegistry', outputChannel);
        getPresetRegistry().loadFromDirectory(presetsDir, presetLogger);
    } catch {
        /* non-fatal — next activation will pick it up */
    }

    await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(newPath));
    vscode.window.showInformationMessage(
        'Preset created — edit defaults and workflow to taste.',
    );
}

/**
 * The six-profile entry point.
 *
 * Rather than one command per capability, this walks profile → preset →
 * inputs. The inputs are derived from the placeholder tokens in the chosen
 * preset's own graph, so an image-to-video preset asks for a source image and
 * a text-to-video preset does not, without either being special-cased here.
 */
async function runProfileCommand(): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showWarningMessage('Open a folder or workspace first.');
        return;
    }
    if (!canStartGeneration()) return;

    const workspacePath = workspaceFolders[0].uri.fsPath;
    const config = getConfig();
    const logger = createChannelLogger('JobRouter', outputChannel);

    // --- 1. Profile ---
    const profilePick = await vscode.window.showQuickPick(
        PROFILES.map((p) => ({
            label: `$(${p.icon}) ${p.label}`,
            description: p.description,
            id: p.id,
        })),
        { title: 'CodeComfy — choose a profile', matchOnDescription: true },
    );
    if (!profilePick) return;
    const profileId = profilePick.id as ProfileId;

    // Metadata submits no graph — it reads provenance from a local PNG.
    if (profileId === 'metadata') {
        await readPngWorkflowCommand();
        return;
    }

    // --- 2. Preset ---
    const presets = kbPresetsForProfile(profileId);
    if (presets.length === 0) {
        vscode.window.showWarningMessage(`No presets available for ${profileId}.`);
        return;
    }
    const presetPick = await vscode.window.showQuickPick(
        presets.map((p) => ({
            label: p.name,
            description: p.requires.packs.length
                ? `needs: ${p.requires.packs.join(', ')}`
                : 'core nodes only',
            detail: p.description,
            preset: p,
        })),
        { title: `CodeComfy — ${profileId} preset`, matchOnDetail: true },
    );
    if (!presetPick) return;
    const preset: KbPreset = presetPick.preset;

    writeCommandHeader(`Run ${preset.name}`, config);
    outputChannel.show(true);

    const engine = new ComfyServerEngine(config.comfyuiUrl, logger, {
        checkpoint: config.defaultCheckpoint,
    });

    // --- 3. Reachability, then preflight ---
    const health = await ensureComfyReachable(engine, config.comfyuiUrl);
    if (!health.ok) {
        vscode.window.showErrorMessage(health.message ?? 'ComfyUI is not reachable.');
        return;
    }

    const preflight = await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: `Checking ${preset.name}...`,
        },
        () => preflightPreset(preset, {
            hasClass: (c) => engine.hasClass(c),
            listModels: (f) => engine.listModels(f),
        }),
    );
    for (const skip of preflight.skipped) {
        logger.warn(`Preflight skipped ${skip}`);
    }
    if (!preflight.ok) {
        logger.error(preflight.message);
        const choice = await vscode.window.showErrorMessage(
            `${preset.name} is missing requirements on this server.`,
            'Show details',
        );
        if (choice === 'Show details') outputChannel.show(true);
        return;
    }

    // --- 4. Inputs, derived from the graph's own placeholders ---
    const inputs: Record<string, unknown> = {};
    for (const descriptor of requiredInputs(preset)) {
        if (descriptor.isFile) {
            const picked = await vscode.window.showOpenDialog({
                title: descriptor.label,
                canSelectMany: false,
                openLabel: 'Use this file',
                defaultUri: workspaceFolders[0].uri,
            });
            if (!picked || picked.length === 0) return;

            const uploaded = await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: 'Uploading to ComfyUI...',
                },
                () => engine.uploadFile(picked[0].fsPath),
            );
            if (!uploaded) {
                vscode.window.showErrorMessage(
                    'Upload to ComfyUI failed — see the CodeComfy output channel.',
                );
                return;
            }
            inputs[descriptor.field] = uploaded;
            continue;
        }

        const value = await vscode.window.showInputBox({
            title: `${preset.name} — ${descriptor.label}`,
            prompt: descriptor.optional
                ? `${descriptor.placeholder} (press Enter to skip)`
                : descriptor.placeholder,
            placeHolder: descriptor.placeholder,
            validateInput: (v) =>
                !descriptor.optional && !v.trim() ? `${descriptor.label} is required` : null,
        });
        if (value === undefined) return;
        inputs[descriptor.field] = value.trim();
    }

    // A prompt is the engine's required field even for presets whose graph
    // never names one (stem separation, plain captioning).
    if (typeof inputs.prompt !== 'string') inputs.prompt = '';

    // --- 5. Run ---
    const router = new JobRouter(workspacePath, engine, {
        ffmpegPath: config.ffmpegPath,
        logger,
    });
    const enginePreset = toEnginePreset(preset) as unknown as Preset;
    await runGeneration(
        router,
        {
            kind: preset.kind,
            preset_id: preset.id,
            inputs: inputs as JobRequestInput['inputs'],
        },
        enginePreset,
        config,
        preset.kind,
    );
}

/**
 * Metadata profile — read the workflow ComfyUI embedded in a PNG.
 *
 * Local-only: nothing is submitted and the server is never contacted.
 */
async function readPngWorkflowCommand(): Promise<void> {
    const picked = await vscode.window.showOpenDialog({
        title: 'Read workflow from PNG',
        canSelectMany: false,
        openLabel: 'Read metadata',
        filters: { Images: ['png'] },
    });
    if (!picked || picked.length === 0) return;

    const result = readPngWorkflow(picked[0].fsPath);
    if (!result.ok) {
        vscode.window.showWarningMessage(result.error);
        return;
    }

    const doc = await vscode.workspace.openTextDocument({
        language: 'json',
        content: JSON.stringify(result.value, null, 2),
    });
    await vscode.window.showTextDocument(doc, { preview: false });
    vscode.window.showInformationMessage(
        `Read ${result.chunkKeys.join(' + ')} from ${path.basename(picked[0].fsPath)}.`,
    );
}

/**
 * Drop everything PENDING from the ComfyUI queue.
 *
 * This is the honest version of the "pause" people ask for: mainline ComfyUI
 * has `/interrupt` (abort, no resume) and nothing else — there is no pause and
 * no resume-at-step-N. What a queue-clear *can* do is stop more work from
 * starting, which is usually what was actually wanted.
 *
 * The currently-running job is left alone; `Cancel Generation` stops that.
 */
async function clearQueueCommand(): Promise<void> {
    const config = getConfig();
    const engine = new ComfyServerEngine(config.comfyuiUrl);

    const depth = await engine.getQueueDepth();
    if (depth === null) {
        vscode.window.showErrorMessage(
            `Could not read the ComfyUI queue at ${config.comfyuiUrl}. Is the server running?`,
        );
        return;
    }
    if (depth.pending === 0) {
        vscode.window.showInformationMessage(
            depth.running > 0
                ? 'Nothing pending — 1 job is running. Use "Cancel Generation" to stop it.'
                : 'The ComfyUI queue is empty.',
        );
        return;
    }

    const confirm = await vscode.window.showWarningMessage(
        `Clear ${depth.pending} pending job(s) from the ComfyUI queue?`,
        { modal: true, detail: depth.running > 0
            ? 'The job currently running is NOT affected — use "Cancel Generation" for that.'
            : undefined },
        'Clear queue',
    );
    if (confirm !== 'Clear queue') return;

    const ok = await engine.clearQueue();
    if (ok) {
        vscode.window.showInformationMessage(
            `Cleared ${depth.pending} pending job(s).`,
        );
    } else {
        vscode.window.showErrorMessage('The queue-clear request failed — nothing was changed.');
    }
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
    type: GenerationKind
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
                } else if (detail?.phase === 'generating' && detail.stepTotal) {
                    // Live sampler progress from the ComfyUI event socket.
                    const pct = Math.round(((detail.stepCurrent ?? 0) / detail.stepTotal) * 100);
                    statusBarItem.text =
                        `$(loading~spin) CodeComfy: Step ${detail.stepCurrent ?? 0} / ${detail.stepTotal} (${pct}%)`;
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

            // FT-021: Opt-out + richer completion actions. Errors below
            // still fire regardless of the setting; silencing success
            // notifications shouldn't silence failures.
            const notifyOnComplete = vscode.workspace
                .getConfiguration('codecomfy')
                .get<boolean>('notifyOnComplete', true);

            if (notifyOnComplete) {
                const actions: string[] = ['Open Gallery', 'Open Output'];
                let outputsFolderUri: vscode.Uri | undefined;
                const workspaceFolders = vscode.workspace.workspaceFolders;
                if (result.artifacts.length > 0 && workspaceFolders && workspaceFolders.length > 0) {
                    outputsFolderUri = vscode.Uri.file(
                        path.join(workspaceFolders[0].uri.fsPath, '.codecomfy', 'outputs'),
                    );
                    actions.push('Open Outputs Folder');
                }

                vscode.window.showInformationMessage(
                    `Generated ${artifactCount} ${typeLabel}`,
                    ...actions,
                ).then((action) => {
                    if (action === 'Open Gallery') {
                        vscode.commands.executeCommand('codecomfy.openGallery');
                    } else if (action === 'Open Output') {
                        outputChannel.show(true);
                    } else if (action === 'Open Outputs Folder' && outputsFolderUri) {
                        vscode.commands.executeCommand('revealFileInOS', outputsFolderUri);
                    }
                });
            }

            if (config.autoOpenGalleryOnComplete) {
                vscode.commands.executeCommand('codecomfy.openGallery');
            }
        } else {
            outputChannel.appendLine(`Generation failed: ${result.error}`);
            // FT-021: Errors ALWAYS show, even if notifyOnComplete is false.
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
