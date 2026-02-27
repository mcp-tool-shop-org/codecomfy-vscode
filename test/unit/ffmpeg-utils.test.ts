/**
 * Tests for FFmpeg utility functions.
 *
 * Covers the exported `cleanupPartialVideo` function and verifies
 * the interfaces / types are correctly shaped.
 * Tests that need actual FFmpeg or spawn are not included here —
 * those belong in integration tests.
 */

import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { cleanupPartialVideo } from '../../src/engines/ffmpeg';
import type { AssembleVideoOptions, AssembleVideoResult } from '../../src/engines/ffmpeg';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeTempDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'codecomfy-test-'));
}

function createTempFile(dir: string, name: string): string {
    const filePath = path.join(dir, name);
    fs.writeFileSync(filePath, 'test content');
    return filePath;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('FFmpeg utilities', () => {

    describe('cleanupPartialVideo', () => {
        it('removes the output file if it exists', () => {
            const dir = makeTempDir();
            const outputPath = createTempFile(dir, 'video.mp4');

            assert.ok(fs.existsSync(outputPath));
            cleanupPartialVideo(outputPath);
            assert.ok(!fs.existsSync(outputPath));

            // Cleanup temp dir
            fs.rmdirSync(dir);
        });

        it('removes the thumbnail file if it exists', () => {
            const dir = makeTempDir();
            const outputPath = createTempFile(dir, 'video.mp4');
            const thumbPath = createTempFile(dir, 'thumb.png');

            cleanupPartialVideo(outputPath, thumbPath);
            assert.ok(!fs.existsSync(outputPath));
            assert.ok(!fs.existsSync(thumbPath));

            fs.rmdirSync(dir);
        });

        it('does not throw when output file does not exist', () => {
            cleanupPartialVideo('/nonexistent/path/video.mp4');
            assert.ok(true); // no crash
        });

        it('does not throw when thumbnail does not exist', () => {
            cleanupPartialVideo('/nonexistent/path/video.mp4', '/nonexistent/thumb.png');
            assert.ok(true); // no crash
        });

        it('handles missing thumbnail path gracefully', () => {
            const dir = makeTempDir();
            const outputPath = createTempFile(dir, 'video.mp4');

            cleanupPartialVideo(outputPath, undefined);
            assert.ok(!fs.existsSync(outputPath));

            fs.rmdirSync(dir);
        });

        it('removes output but tolerates missing thumbnail', () => {
            const dir = makeTempDir();
            const outputPath = createTempFile(dir, 'video.mp4');
            const missingThumb = path.join(dir, 'does-not-exist.png');

            cleanupPartialVideo(outputPath, missingThumb);
            assert.ok(!fs.existsSync(outputPath));
            assert.ok(!fs.existsSync(missingThumb));

            fs.rmdirSync(dir);
        });
    });

    describe('AssembleVideoOptions interface', () => {
        it('accepts valid options shape', () => {
            const options: AssembleVideoOptions = {
                ffmpegPath: '/usr/bin/ffmpeg',
                framesDir: '/tmp/frames',
                outputPath: '/tmp/output.mp4',
                fps: 24,
            };
            assert.strictEqual(options.fps, 24);
            assert.strictEqual(options.thumbnailPath, undefined);
        });

        it('accepts optional thumbnailPath', () => {
            const options: AssembleVideoOptions = {
                ffmpegPath: 'ffmpeg',
                framesDir: '/tmp/frames',
                outputPath: '/tmp/out.mp4',
                fps: 30,
                thumbnailPath: '/tmp/thumb.png',
            };
            assert.strictEqual(options.thumbnailPath, '/tmp/thumb.png');
        });
    });

    describe('AssembleVideoResult interface', () => {
        it('success result shape', () => {
            const result: AssembleVideoResult = {
                success: true,
                outputPath: '/out.mp4',
                thumbnailPath: '/thumb.png',
            };
            assert.strictEqual(result.success, true);
            assert.strictEqual(result.error, undefined);
        });

        it('failure result shape', () => {
            const result: AssembleVideoResult = {
                success: false,
                error: 'FFmpeg not found',
            };
            assert.strictEqual(result.success, false);
            assert.ok(result.error);
        });
    });
});
