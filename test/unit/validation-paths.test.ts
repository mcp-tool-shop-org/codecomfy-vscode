/**
 * Unit tests for src/validation/paths.ts
 *
 * Tests the primitive helpers and the high-level validateExecutablePath().
 * Uses real temp files via os.tmpdir() for existsFile / looksExecutable tests.
 */

import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    isAbsolutePath,
    existsFile,
    looksExecutable,
    validateExecutablePath,
} from '../../src/validation/paths';

// ---------------------------------------------------------------------------
// Helpers — create and clean up temp files
// ---------------------------------------------------------------------------

const tmpFiles: string[] = [];

function makeTempFile(name: string, content = ''): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codecomfy-test-'));
    const filePath = path.join(dir, name);
    fs.writeFileSync(filePath, content);
    tmpFiles.push(filePath);
    tmpFiles.push(dir);
    return filePath;
}

after(() => {
    // Clean up temp files in reverse order (files before dirs)
    for (const p of tmpFiles.reverse()) {
        try {
            const stat = fs.statSync(p);
            if (stat.isDirectory()) {
                fs.rmdirSync(p);
            } else {
                fs.unlinkSync(p);
            }
        } catch {
            // Best effort
        }
    }
});

// =============================================================================
// isAbsolutePath
// =============================================================================

describe('isAbsolutePath', () => {
    it('detects Windows absolute paths', () => {
        assert.strictEqual(isAbsolutePath('C:\\ffmpeg\\bin\\ffmpeg.exe'), true);
        assert.strictEqual(isAbsolutePath('D:\\Programs\\tool.exe'), true);
    });

    it('detects UNC paths as absolute', () => {
        assert.strictEqual(isAbsolutePath('\\\\server\\share\\file'), true);
    });

    it('detects POSIX absolute paths', () => {
        assert.strictEqual(isAbsolutePath('/usr/bin/ffmpeg'), true);
        assert.strictEqual(isAbsolutePath('/home/user/tool'), true);
    });

    it('rejects relative paths', () => {
        assert.strictEqual(isAbsolutePath('ffmpeg'), false);
        assert.strictEqual(isAbsolutePath('bin/ffmpeg'), false);
        assert.strictEqual(isAbsolutePath('./tool.exe'), false);
        assert.strictEqual(isAbsolutePath('../tool.exe'), false);
    });

    it('rejects empty string', () => {
        assert.strictEqual(isAbsolutePath(''), false);
    });
});

// =============================================================================
// existsFile
// =============================================================================

describe('existsFile', () => {
    it('returns true for a real file', () => {
        const p = makeTempFile('real-file.txt', 'content');
        assert.strictEqual(existsFile(p), true);
    });

    it('returns false for a non-existent path', () => {
        assert.strictEqual(existsFile('/does/not/exist/at/all.xyz'), false);
    });

    it('returns false for a directory', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codecomfy-dir-'));
        tmpFiles.push(dir);
        assert.strictEqual(existsFile(dir), false);
    });
});

// =============================================================================
// looksExecutable
// =============================================================================

describe('looksExecutable', () => {
    if (process.platform === 'win32') {
        it('accepts .exe files on Windows', () => {
            const p = makeTempFile('tool.exe', 'fake');
            assert.strictEqual(looksExecutable(p), true);
        });

        it('accepts .cmd files on Windows', () => {
            const p = makeTempFile('script.cmd', 'fake');
            assert.strictEqual(looksExecutable(p), true);
        });

        it('accepts .bat files on Windows', () => {
            const p = makeTempFile('run.bat', 'fake');
            assert.strictEqual(looksExecutable(p), true);
        });

        it('rejects .txt files on Windows', () => {
            const p = makeTempFile('notes.txt', 'content');
            assert.strictEqual(looksExecutable(p), false);
        });

        it('rejects .json files on Windows', () => {
            const p = makeTempFile('data.json', '{}');
            assert.strictEqual(looksExecutable(p), false);
        });
    } else {
        it('accepts any existing file on non-Windows', () => {
            const p = makeTempFile('script', '#!/bin/sh');
            assert.strictEqual(looksExecutable(p), true);
        });
    }

    it('returns false for non-existent file regardless of extension', () => {
        assert.strictEqual(looksExecutable('/does/not/exist.exe'), false);
    });
});

// =============================================================================
// validateExecutablePath
// =============================================================================

describe('validateExecutablePath', () => {
    const KEY = 'codecomfy.ffmpegPath';
    const BARE = 'ffmpeg';

    // --- PATH lookup mode ---

    it('returns path-lookup for undefined', () => {
        const r = validateExecutablePath(undefined, KEY, BARE);
        assert.strictEqual(r.valid, true);
        assert.strictEqual(r.mode, 'path-lookup');
    });

    it('returns path-lookup for empty string', () => {
        const r = validateExecutablePath('', KEY, BARE);
        assert.strictEqual(r.valid, true);
        assert.strictEqual(r.mode, 'path-lookup');
    });

    it('returns path-lookup for bare name "ffmpeg"', () => {
        const r = validateExecutablePath('ffmpeg', KEY, BARE);
        assert.strictEqual(r.valid, true);
        assert.strictEqual(r.mode, 'path-lookup');
    });

    it('returns path-lookup for bare name case-insensitive "FFMPEG"', () => {
        const r = validateExecutablePath('FFMPEG', KEY, BARE);
        assert.strictEqual(r.valid, true);
        assert.strictEqual(r.mode, 'path-lookup');
    });

    it('returns path-lookup for whitespace-only', () => {
        const r = validateExecutablePath('   ', KEY, BARE);
        assert.strictEqual(r.valid, true);
        assert.strictEqual(r.mode, 'path-lookup');
    });

    // --- Quote stripping ---

    it('strips surrounding double quotes', () => {
        // After stripping the empty-looking result → path-lookup
        const r = validateExecutablePath('""', KEY, BARE);
        assert.strictEqual(r.valid, true);
        assert.strictEqual(r.mode, 'path-lookup');
    });

    it('strips quotes from a bare name', () => {
        const r = validateExecutablePath('"ffmpeg"', KEY, BARE);
        assert.strictEqual(r.valid, true);
        assert.strictEqual(r.mode, 'path-lookup');
    });

    // --- Relative path rejection ---

    it('rejects a relative path', () => {
        const r = validateExecutablePath('bin/ffmpeg', KEY, BARE);
        assert.strictEqual(r.valid, false);
        assert.ok(r.error);
        assert.ok(r.error.includes('absolute'));
    });

    it('rejects a dot-relative path', () => {
        const r = validateExecutablePath('./ffmpeg.exe', KEY, BARE);
        assert.strictEqual(r.valid, false);
        assert.ok(r.error);
    });

    // --- Absolute path to existing executable ---

    if (process.platform === 'win32') {
        it('accepts absolute path to existing .exe file', () => {
            const p = makeTempFile('ffmpeg.exe', 'fake-binary');
            const r = validateExecutablePath(p, KEY, BARE);
            assert.strictEqual(r.valid, true);
            assert.strictEqual(r.mode, 'explicit');
            assert.strictEqual(r.resolvedPath, path.normalize(p));
        });

        it('accepts quoted absolute path to existing .exe file', () => {
            const p = makeTempFile('ffmpeg2.exe', 'fake-binary');
            const r = validateExecutablePath(`"${p}"`, KEY, BARE);
            assert.strictEqual(r.valid, true);
            assert.strictEqual(r.mode, 'explicit');
        });

        it('rejects absolute path to non-executable extension', () => {
            const p = makeTempFile('data.json', '{}');
            const r = validateExecutablePath(p, KEY, BARE);
            assert.strictEqual(r.valid, false);
            assert.ok(r.error);
            assert.ok(r.error.includes('executable'));
        });
    }

    it('rejects absolute path to non-existent file', () => {
        const fakePath = path.join(os.tmpdir(), 'codecomfy-does-not-exist-12345.exe');
        const r = validateExecutablePath(fakePath, KEY, BARE);
        assert.strictEqual(r.valid, false);
        assert.ok(r.error);
        assert.ok(r.error.includes('does not exist'));
    });

    // --- Error messages include setting key ---

    it('includes the setting key in error messages', () => {
        const r = validateExecutablePath('some/relative/path', KEY, BARE);
        assert.strictEqual(r.valid, false);
        assert.ok(r.error!.includes(KEY));
    });
});
