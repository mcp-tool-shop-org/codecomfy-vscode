/**
 * Unit tests for src/config.ts
 *
 * Uses the vscode stub to simulate workspace configuration and verifies
 * that getConfig() validates and normalises settings correctly.
 */

import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// The vscode stub is resolved via tsconfig paths
import { workspace } from 'vscode';
import { getConfig } from '../../src/config';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const tmpFiles: string[] = [];

function makeTempFile(name: string, content = ''): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codecomfy-cfg-'));
    const filePath = path.join(dir, name);
    fs.writeFileSync(filePath, content);
    tmpFiles.push(filePath);
    tmpFiles.push(dir);
    return filePath;
}

after(() => {
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
// getConfig
// =============================================================================

describe('getConfig', () => {
    beforeEach(() => {
        // Reset fake config before each test
        (workspace as any)._setFakeConfig({});
    });

    it('returns default comfyuiUrl when not configured', () => {
        const cfg = getConfig();
        assert.strictEqual(cfg.comfyuiUrl, 'http://127.0.0.1:8188');
    });

    it('reads comfyuiUrl from settings', () => {
        (workspace as any)._setFakeConfig({ comfyuiUrl: 'http://localhost:9999' });
        const cfg = getConfig();
        assert.strictEqual(cfg.comfyuiUrl, 'http://localhost:9999');
    });

    it('returns autoOpenGalleryOnComplete = true by default', () => {
        const cfg = getConfig();
        assert.strictEqual(cfg.autoOpenGalleryOnComplete, true);
    });

    it('reads autoOpenGalleryOnComplete = false', () => {
        (workspace as any)._setFakeConfig({ autoOpenGalleryOnComplete: false });
        const cfg = getConfig();
        assert.strictEqual(cfg.autoOpenGalleryOnComplete, false);
    });

    // --- ffmpegPath validation ---

    it('returns undefined ffmpegPath when not set (PATH mode)', () => {
        const cfg = getConfig();
        assert.strictEqual(cfg.ffmpegPath, undefined);
    });

    it('returns undefined ffmpegPath for empty string (PATH mode)', () => {
        (workspace as any)._setFakeConfig({ ffmpegPath: '' });
        const cfg = getConfig();
        assert.strictEqual(cfg.ffmpegPath, undefined);
    });

    it('returns undefined ffmpegPath for bare "ffmpeg" (PATH mode)', () => {
        (workspace as any)._setFakeConfig({ ffmpegPath: 'ffmpeg' });
        const cfg = getConfig();
        assert.strictEqual(cfg.ffmpegPath, undefined);
    });

    it('falls back to undefined for a relative path (invalid)', () => {
        (workspace as any)._setFakeConfig({ ffmpegPath: 'bin/ffmpeg' });
        const cfg = getConfig();
        // Invalid → warning shown + fallback to PATH mode
        assert.strictEqual(cfg.ffmpegPath, undefined);
    });

    it('falls back to undefined for a non-existent absolute path', () => {
        (workspace as any)._setFakeConfig({
            ffmpegPath: path.join(os.tmpdir(), 'no-such-file-codecomfy.exe'),
        });
        const cfg = getConfig();
        assert.strictEqual(cfg.ffmpegPath, undefined);
    });

    if (process.platform === 'win32') {
        it('returns resolved path for a valid absolute .exe path', () => {
            const p = makeTempFile('ffmpeg.exe', 'fake');
            (workspace as any)._setFakeConfig({ ffmpegPath: p });
            const cfg = getConfig();
            assert.strictEqual(cfg.ffmpegPath, path.normalize(p));
        });
    }

    // --- nextGalleryPath ---

    it('returns undefined nextGalleryPath when not set', () => {
        const cfg = getConfig();
        assert.strictEqual(cfg.nextGalleryPath, undefined);
    });
});
