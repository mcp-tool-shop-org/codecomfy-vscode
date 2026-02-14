/**
 * Path validation helpers.
 *
 * Centralises security checks for user-configured executable paths so that
 * settings like `codecomfy.ffmpegPath` and `codecomfy.nextGalleryPath` cannot
 * be used as a shell-injection or path-traversal vector.
 */

import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Primitive helpers
// ---------------------------------------------------------------------------

/** True when `p` is an absolute path on the current OS. */
export function isAbsolutePath(p: string): boolean {
    return path.isAbsolute(p);
}

/** True when `p` points to a file that exists on disk. */
export function existsFile(p: string): boolean {
    try {
        return fs.statSync(p).isFile();
    } catch {
        return false;
    }
}

/**
 * Heuristic: does this look like an executable?
 *
 * On Windows we check for common executable extensions.
 * On other platforms any file that exists is accepted (permissions
 * are handled by the OS at spawn-time).
 */
export function looksExecutable(p: string): boolean {
    if (!existsFile(p)) {
        return false;
    }
    if (process.platform === 'win32') {
        const ext = path.extname(p).toLowerCase();
        return ['.exe', '.cmd', '.bat', '.com'].includes(ext);
    }
    return true; // Non-Windows: rely on OS permission check
}

// ---------------------------------------------------------------------------
// High-level validators
// ---------------------------------------------------------------------------

export interface PathValidationResult {
    valid: boolean;
    /** The normalised path to use, or `undefined` when `mode` is "path-lookup". */
    resolvedPath?: string;
    /** `"explicit"` = user gave an absolute path; `"path-lookup"` = use PATH. */
    mode: 'explicit' | 'path-lookup';
    /** Human-readable error when `valid` is false. */
    error?: string;
}

/**
 * Validate a user-configured executable path.
 *
 * Allowed semantics:
 *   - Empty / `undefined`  → PATH lookup mode (caller probes PATH itself).
 *   - Bare name like `"ffmpeg"` → PATH lookup mode.
 *   - Absolute path to an existing file → explicit mode.
 *   - Anything else (relative path, non-existent file) → rejected.
 *
 * Surrounding double-quotes are stripped (common copy-paste artefact on
 * Windows) and the path is normalised.
 *
 * @param raw         The raw setting value.
 * @param settingKey  The VS Code setting key (for error messages).
 * @param bareName    The bare executable name that signals PATH mode (e.g. `"ffmpeg"`).
 */
export function validateExecutablePath(
    raw: string | undefined,
    settingKey: string,
    bareName: string,
): PathValidationResult {
    // Normalise: trim whitespace and surrounding quotes
    const trimmed = (raw ?? '').trim().replace(/^"+|"+$/g, '');

    // Empty or bare name → PATH lookup
    if (trimmed === '' || trimmed.toLowerCase() === bareName.toLowerCase()) {
        return { valid: true, mode: 'path-lookup' };
    }

    // Reject relative paths
    if (!isAbsolutePath(trimmed)) {
        const example = process.platform === 'win32'
            ? 'C:\\ffmpeg\\bin\\ffmpeg.exe'
            : '/usr/local/bin/ffmpeg';
        return {
            valid: false,
            mode: 'explicit',
            error: `${settingKey} must be an absolute path (got relative: "${trimmed}"). `
                 + `Use an absolute path like "${example}", or leave empty to use PATH.`,
        };
    }

    const normalised = path.normalize(trimmed);

    // File must exist
    if (!existsFile(normalised)) {
        return {
            valid: false,
            mode: 'explicit',
            error: `${settingKey} points to a file that does not exist: "${normalised}".`,
        };
    }

    // Must look like an executable
    if (!looksExecutable(normalised)) {
        const ext = path.extname(normalised);
        return {
            valid: false,
            mode: 'explicit',
            error: `${settingKey} does not look like an executable (extension "${ext}"): "${normalised}".`,
        };
    }

    return { valid: true, mode: 'explicit', resolvedPath: normalised };
}
