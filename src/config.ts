/**
 * Configuration module
 *
 * Reads VS Code settings and provides typed access.
 * Executable-path settings are validated at read time so that downstream
 * code can trust the values without re-checking.
 */

import * as vscode from 'vscode';
import { CodeComfyConfig, DEFAULT_CONFIG } from './types';
import { validateExecutablePath } from './validation/paths';
import { validateComfyUrl } from './validation/url';

/**
 * Read and validate extension configuration.
 *
 * Returns a `CodeComfyConfig` whose `ffmpegPath` is guaranteed to be either:
 *   - `undefined` (meaning "use PATH lookup"), or
 *   - an absolute path to an existing executable.
 *
 * Invalid values are rejected with a user-facing warning and treated as
 * "use PATH".
 */
export function getConfig(): CodeComfyConfig {
    const config = vscode.workspace.getConfiguration('codecomfy');

    // --- FFmpeg path validation ---
    const rawFfmpeg = config.get<string>('ffmpegPath');
    const ffmpegResult = validateExecutablePath(rawFfmpeg, 'codecomfy.ffmpegPath', 'ffmpeg');

    let ffmpegPath: string | undefined;
    if (!ffmpegResult.valid) {
        // Show a one-time warning; fall back to PATH mode
        vscode.window.showWarningMessage(ffmpegResult.error!);
        ffmpegPath = undefined;
    } else if (ffmpegResult.mode === 'explicit') {
        ffmpegPath = ffmpegResult.resolvedPath;
    } else {
        ffmpegPath = undefined; // PATH lookup
    }

    // --- ComfyUI URL validation ---
    const rawComfyUrl = config.get<string>('comfyuiUrl') || DEFAULT_CONFIG.comfyuiUrl;
    const urlResult = validateComfyUrl(rawComfyUrl);

    let comfyuiUrl: string;
    if (!urlResult.valid) {
        vscode.window.showWarningMessage(`Invalid ComfyUI URL: ${urlResult.error} Using default.`);
        comfyuiUrl = DEFAULT_CONFIG.comfyuiUrl;
    } else {
        comfyuiUrl = urlResult.value!;
    }

    // --- Default checkpoint override ---
    // Empty string → use preset's hardcoded ckpt_name (backward-compatible).
    // Non-empty → substituted into every CheckpointLoaderSimple node at
    //              buildWorkflow() time by ComfyServerEngine.
    const rawCheckpoint = (config.get<string>('defaultCheckpoint') ?? '').trim();
    const defaultCheckpoint = rawCheckpoint.length > 0 ? rawCheckpoint : undefined;

    return {
        nextGalleryPath: config.get<string>('nextGalleryPath') || undefined,
        comfyuiUrl,
        autoOpenGalleryOnComplete: config.get<boolean>('autoOpenGalleryOnComplete') ?? DEFAULT_CONFIG.autoOpenGalleryOnComplete,
        ffmpegPath,
        defaultCheckpoint,
    };
}
