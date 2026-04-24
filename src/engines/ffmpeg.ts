/**
 * FFmpeg utilities for video assembly.
 *
 * Locates FFmpeg and provides functions to assemble frames into video.
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import type { Logger } from '../logging/logger';

/**
 * Common FFmpeg locations, OS-dependent.
 */
function getCommonFfmpegPaths(): string[] {
    if (process.platform === 'win32') {
        return [
            path.join(process.env.LOCALAPPDATA || '', 'Programs', 'ffmpeg', 'bin', 'ffmpeg.exe'),
            path.join(process.env.PROGRAMFILES || '', 'ffmpeg', 'bin', 'ffmpeg.exe'),
            'C:\\ffmpeg\\bin\\ffmpeg.exe',
        ];
    }
    if (process.platform === 'darwin') {
        return [
            '/opt/homebrew/bin/ffmpeg',
            '/usr/local/bin/ffmpeg',
        ];
    }
    // Linux and other Unix
    return [
        '/usr/bin/ffmpeg',
        '/usr/local/bin/ffmpeg',
    ];
}

/**
 * Check if FFmpeg is reachable on the system PATH (async).
 *
 * On Windows, `spawn` can resolve executables from PATH without `shell: true`
 * because the OS CreateProcess API performs its own PATH search for .exe files.
 * We pass `windowsHide: true` so no console window flashes.
 */
function isFfmpegOnPath(): Promise<boolean> {
    return new Promise((resolve) => {
        try {
            const proc = spawn('ffmpeg', ['-version'], {
                stdio: 'pipe',
                shell: false,
                windowsHide: true,
            });

            const timeout = setTimeout(() => {
                proc.kill();
                resolve(false);
            }, 5000);

            proc.on('error', () => {
                clearTimeout(timeout);
                resolve(false);
            });

            proc.on('close', (code) => {
                clearTimeout(timeout);
                resolve(code === 0);
            });
        } catch {
            resolve(false);
        }
    });
}

/**
 * Find FFmpeg executable.
 *
 * Resolution order:
 *  1. Configured path (if supplied and file exists)
 *  2. Common install locations on disk
 *  3. System PATH lookup (async, no shell)
 *
 * When `logger` is supplied, the first successful resolve also probes
 * `ffmpeg -version` (once per module) and logs the detected version at info
 * level. Old FFmpeg (< 4.0) logs a warn — the `-movflags +faststart` flag
 * used by assembleVideo requires 4.x+ and the user sees a cryptic error
 * otherwise. Missing/unparseable versions are logged at info with
 * "version unknown".
 */
export async function findFfmpeg(
    configuredPath?: string,
    logger?: Logger,
): Promise<string | undefined> {
    // 1. Configured path
    if (configuredPath && configuredPath !== 'ffmpeg' && fs.existsSync(configuredPath)) {
        await maybeReportVersion(configuredPath, logger);
        return configuredPath;
    }

    // 2. Common filesystem locations
    for (const candidate of getCommonFfmpegPaths()) {
        if (candidate && fs.existsSync(candidate)) {
            await maybeReportVersion(candidate, logger);
            return candidate;
        }
    }

    // 3. System PATH — the 'ffmpeg' bare name is safe to pass to spawn()
    //    on Windows because Node's spawn resolves .exe via PATH without shell.
    if (await isFfmpegOnPath()) {
        await maybeReportVersion('ffmpeg', logger);
        return 'ffmpeg';
    }

    return undefined;
}

/**
 * Cached version report keyed by resolved ffmpeg path. Prevents spawning
 * `ffmpeg -version` on every call when the caller re-resolves (e.g. each
 * job). Cache survives for the lifetime of the extension host.
 */
const versionReportCache = new Map<string, string>();

/**
 * Probe `ffmpeg -version` (once per path) and log the detected version.
 * Never throws — version probing is best-effort. If probing fails, logs
 * "version unknown" at info so the user at least knows which binary was
 * picked.
 */
async function maybeReportVersion(ffmpegPath: string, logger?: Logger): Promise<void> {
    if (!logger) return;
    if (versionReportCache.has(ffmpegPath)) return;

    const version = await probeFfmpegVersion(ffmpegPath);
    versionReportCache.set(ffmpegPath, version ?? 'unknown');

    if (!version) {
        logger.info(`FFmpeg detected at ${ffmpegPath} (version unknown — probe failed or output unparseable)`);
        return;
    }

    const major = parseMajorVersion(version);
    if (major !== null && major < 4) {
        logger.warn(
            `FFmpeg ${version} detected at ${ffmpegPath}. ` +
            `CodeComfy uses -movflags +faststart which requires FFmpeg 4.0+. ` +
            `Please upgrade — see https://ffmpeg.org/download.html`,
        );
    } else {
        logger.info(`FFmpeg ${version} detected at ${ffmpegPath}`);
    }
}

/**
 * Spawn `ffmpeg -version` and extract the version string from the first line.
 * Returns null on any failure (spawn error, timeout, non-zero exit, unparseable
 * output). 2-second timeout — an un-responsive ffmpeg binary should not stall
 * the activation path.
 */
function probeFfmpegVersion(ffmpegPath: string): Promise<string | null> {
    return new Promise((resolve) => {
        try {
            const proc = spawn(ffmpegPath, ['-version'], {
                stdio: ['ignore', 'pipe', 'pipe'],
                shell: false,
                windowsHide: true,
            });

            let stdout = '';
            proc.stdout?.on('data', (data) => {
                stdout += data.toString();
            });

            const timeout = setTimeout(() => {
                proc.kill();
                resolve(null);
            }, 2000);

            proc.on('error', () => {
                clearTimeout(timeout);
                resolve(null);
            });

            proc.on('close', (code) => {
                clearTimeout(timeout);
                if (code !== 0) {
                    resolve(null);
                    return;
                }
                resolve(parseFfmpegVersionLine(stdout));
            });
        } catch {
            resolve(null);
        }
    });
}

/**
 * Parse `ffmpeg version 4.4.1 Copyright (c) …` → `4.4.1`.
 * Returns null if the expected shape is absent.
 */
export function parseFfmpegVersionLine(versionOutput: string): string | null {
    const firstLine = versionOutput.split('\n')[0] ?? '';
    const match = firstLine.match(/ffmpeg version\s+(\S+)/i);
    return match ? match[1] : null;
}

/**
 * Extract the major version from a parsed version string.
 * Handles `4.4.1`, `4.4`, `n4.4.1`, `4.4.1-full_build-…`. Returns null
 * if no leading digit is found.
 */
function parseMajorVersion(version: string): number | null {
    const match = version.match(/^[a-zA-Z]?(\d+)/);
    if (!match) return null;
    const n = Number(match[1]);
    return Number.isFinite(n) ? n : null;
}

/**
 * Options for video assembly.
 */
export interface AssembleVideoOptions {
    /** Path to FFmpeg executable */
    ffmpegPath: string;
    /** Directory containing frame_XXXXX.png files */
    framesDir: string;
    /** Output video path */
    outputPath: string;
    /** Frames per second */
    fps: number;
    /** Optional: generate thumbnail */
    thumbnailPath?: string;
}

/**
 * Result of video assembly.
 */
export interface AssembleVideoResult {
    success: boolean;
    error?: string;
    outputPath?: string;
    thumbnailPath?: string;
}

/**
 * Assemble frames into MP4 video.
 */
export async function assembleVideo(options: AssembleVideoOptions): Promise<AssembleVideoResult> {
    const { ffmpegPath, framesDir, outputPath, fps, thumbnailPath } = options;

    // Verify frames exist
    if (!fs.existsSync(framesDir)) {
        return { success: false, error: `Frames directory not found: ${framesDir}` };
    }

    const frames = fs.readdirSync(framesDir).filter(f => f.endsWith('.png')).sort();
    if (frames.length === 0) {
        return { success: false, error: 'No frames found to assemble' };
    }

    // Rename frames to sequential pattern for FFmpeg
    const renameResult = renameFramesSequentially(framesDir, frames);
    if (!renameResult.success) {
        return { success: false, error: renameResult.error };
    }

    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    fs.mkdirSync(outputDir, { recursive: true });

    // Build FFmpeg command for video
    const inputPattern = path.join(framesDir, 'frame_%05d.png');
    const videoArgs = [
        '-y', // Overwrite
        '-framerate', String(fps),
        '-i', inputPattern,
        '-c:v', 'libx264',
        '-preset', 'medium',
        '-crf', '18',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        outputPath,
    ];

    // Run FFmpeg for video
    const videoResult = await runFfmpeg(ffmpegPath, videoArgs);
    if (!videoResult.success) {
        return { success: false, error: `Video assembly failed: ${videoResult.error}` };
    }

    // Verify output exists
    if (!fs.existsSync(outputPath)) {
        return { success: false, error: 'Video file was not created' };
    }

    let finalThumbnailPath: string | undefined;

    // Generate thumbnail if requested
    if (thumbnailPath) {
        const thumbArgs = [
            '-y',
            '-i', outputPath,
            '-vf', 'thumbnail,scale=512:-1',
            '-frames:v', '1',
            thumbnailPath,
        ];

        const thumbResult = await runFfmpeg(ffmpegPath, thumbArgs);
        if (thumbResult.success && fs.existsSync(thumbnailPath)) {
            finalThumbnailPath = thumbnailPath;
        }
        // Thumbnail failure is not fatal
    }

    return {
        success: true,
        outputPath,
        thumbnailPath: finalThumbnailPath,
    };
}

/**
 * Rename frames to sequential pattern: frame_00001.png, frame_00002.png, etc.
 */
function renameFramesSequentially(framesDir: string, frames: string[]): { success: boolean; error?: string } {
    try {
        // Sort frames (they should already be sorted, but be explicit)
        const sortedFrames = [...frames].sort();

        for (let i = 0; i < sortedFrames.length; i++) {
            const oldPath = path.join(framesDir, sortedFrames[i]);
            const newName = `frame_${String(i + 1).padStart(5, '0')}.png`;
            const newPath = path.join(framesDir, newName);

            // Skip if already correct name
            if (oldPath !== newPath) {
                fs.renameSync(oldPath, newPath);
            }
        }

        return { success: true };
    } catch (err) {
        return {
            success: false,
            error: `Failed to rename frames: ${err instanceof Error ? err.message : String(err)}`,
        };
    }
}

/**
 * Run FFmpeg with arguments.
 */
function runFfmpeg(ffmpegPath: string, args: string[]): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
        const proc = spawn(ffmpegPath, args, {
            stdio: ['ignore', 'pipe', 'pipe'],
            shell: false,
            windowsHide: true,
        });

        let stderr = '';

        proc.stderr?.on('data', (data) => {
            stderr += data.toString();
        });

        proc.on('error', (err) => {
            const hint = ffmpegPath === 'ffmpeg'
                ? 'Ensure FFmpeg is installed and on your system PATH, or set codecomfy.ffmpegPath to an absolute path.'
                : `Tried to execute: ${ffmpegPath}`;
            resolve({ success: false, error: `${err.message}. ${hint}` });
        });

        proc.on('close', (code) => {
            if (code === 0) {
                resolve({ success: true });
            } else {
                // Extract last few lines of stderr for error message
                const lines = stderr.trim().split('\n');
                const errorLines = lines.slice(-5).join('\n');
                resolve({ success: false, error: `FFmpeg exited with code ${code}: ${errorLines}` });
            }
        });
    });
}

/**
 * Clean up partial video files on failure/cancel.
 */
export function cleanupPartialVideo(outputPath: string, thumbnailPath?: string): void {
    try {
        if (fs.existsSync(outputPath)) {
            fs.unlinkSync(outputPath);
        }
        if (thumbnailPath && fs.existsSync(thumbnailPath)) {
            fs.unlinkSync(thumbnailPath);
        }
    } catch {
        // Best effort cleanup
    }
}
