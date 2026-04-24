/**
 * Unit tests for src/config.ts
 *
 * Uses the vscode stub to simulate workspace configuration and verifies
 * that getConfig() validates and normalises settings correctly.
 */

import * as assert from 'node:assert/strict';
import * as os from 'os';
import * as path from 'path';

// The vscode stub is resolved via tsconfig paths
import { workspace } from 'vscode';
import { getConfig } from '../../src/config';
import { makeTempFile, cleanupTempPaths } from '../helpers';

// ---------------------------------------------------------------------------
// Shared cleanup
// ---------------------------------------------------------------------------

after(() => {
    const { failed } = cleanupTempPaths();
    if (failed.length > 0) {
        // Surface a leak loudly — better than silent accumulation in tmpdir.
        console.warn(`[config.test] ${failed.length} temp path(s) left behind:`, failed);
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
            const p = makeTempFile('ffmpeg.exe', 'fake', 'codecomfy-cfg-');
            (workspace as any)._setFakeConfig({ ffmpegPath: p });
            const cfg = getConfig();
            assert.strictEqual(cfg.ffmpegPath, path.normalize(p));
        });
    }

    // Platform-independent equivalent (F-863253-020): verify absolute-path
    // acceptance WITHOUT fs stubbing. Node 22 + the TS `__importStar` helper
    // bind `fs.*Sync` as non-configurable getters that Sinon cannot stub,
    // so we just create a real file with the right extension in a temp dir.
    it('accepts absolute-path acceptance logic on the current platform', () => {
        // On Windows we need an executable extension (looksExecutable); on
        // non-Windows any existing file is accepted.
        const fname = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
        const realPath = makeTempFile(fname, 'fake', 'codecomfy-abs-');

        (workspace as any)._setFakeConfig({ ffmpegPath: realPath });
        const cfg = getConfig();

        assert.strictEqual(cfg.ffmpegPath, path.normalize(realPath));
    });

    // Negative side of F-863253-020: a non-existent absolute path is rejected.
    it('rejects an absolute path whose file does not exist', () => {
        const fakePath = process.platform === 'win32'
            ? path.join(os.tmpdir(), 'codecomfy-does-not-exist-xyz.exe')
            : path.join(os.tmpdir(), 'codecomfy-does-not-exist-xyz');
        (workspace as any)._setFakeConfig({ ffmpegPath: fakePath });
        const cfg = getConfig();
        assert.strictEqual(cfg.ffmpegPath, undefined);
    });

    // --- nextGalleryPath ---

    it('returns undefined nextGalleryPath when not set', () => {
        const cfg = getConfig();
        assert.strictEqual(cfg.nextGalleryPath, undefined);
    });
});
