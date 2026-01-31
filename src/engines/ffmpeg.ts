/**
 * FFmpeg utilities for video assembly.
 *
 * Locates FFmpeg and provides functions to assemble frames into video.
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';

/**
 * Common FFmpeg locations on Windows.
 */
const COMMON_FFMPEG_PATHS = [
    'ffmpeg', // On PATH
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'ffmpeg', 'bin', 'ffmpeg.exe'),
    path.join(process.env.PROGRAMFILES || '', 'ffmpeg', 'bin', 'ffmpeg.exe'),
    'C:\\ffmpeg\\bin\\ffmpeg.exe',
];

/**
 * Find FFmpeg executable.
 */
export function findFfmpeg(configuredPath?: string): string | undefined {
    // Check configured path first
    if (configuredPath && fs.existsSync(configuredPath)) {
        return configuredPath;
    }

    // Try common locations
    for (const candidate of COMMON_FFMPEG_PATHS) {
        if (candidate === 'ffmpeg') {
            // Check if on PATH by trying to run it
            try {
                const result = require('child_process').spawnSync('ffmpeg', ['-version'], {
                    stdio: 'pipe',
                    timeout: 5000,
                    shell: true,
                });
                if (result.status === 0) {
                    return 'ffmpeg';
                }
            } catch {
                continue;
            }
        } else if (fs.existsSync(candidate)) {
            return candidate;
        }
    }

    return undefined;
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
            shell: ffmpegPath === 'ffmpeg', // Use shell if just "ffmpeg" (on PATH)
        });

        let stderr = '';

        proc.stderr?.on('data', (data) => {
            stderr += data.toString();
        });

        proc.on('error', (err) => {
            resolve({ success: false, error: err.message });
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
