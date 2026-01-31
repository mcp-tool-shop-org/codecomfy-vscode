/**
 * Configuration module
 *
 * Reads VS Code settings and provides typed access.
 */

import * as vscode from 'vscode';
import { CodeComfyConfig, DEFAULT_CONFIG } from './types';

export function getConfig(): CodeComfyConfig {
    const config = vscode.workspace.getConfiguration('codecomfy');

    return {
        nextGalleryPath: config.get<string>('nextGalleryPath') || undefined,
        comfyuiUrl: config.get<string>('comfyuiUrl') || DEFAULT_CONFIG.comfyuiUrl,
        autoOpenGalleryOnComplete: config.get<boolean>('autoOpenGalleryOnComplete') ?? DEFAULT_CONFIG.autoOpenGalleryOnComplete,
        ffmpegPath: config.get<string>('ffmpegPath') || undefined,
    };
}
