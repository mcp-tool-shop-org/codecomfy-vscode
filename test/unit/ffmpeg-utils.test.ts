/**
 * Tests for FFmpeg utility functions in src/engines/ffmpeg.ts.
 *
 * Covers:
 *  - `cleanupPartialVideo` — file-removal best effort (positive + negative paths)
 *  - `findFfmpeg` — resolution order (configured → common locations → PATH)
 *  - `assembleVideo` — integration across verify → rename → spawn → thumbnail
 *  - `runFfmpeg` / `renameFramesSequentially` — private helpers reached via
 *    assembleVideo's call-through so we verify the spawn contract:
 *    shell-injection safety (`shell: false`), correct args (`-i frame_%05d.png`),
 *    stderr capture and truncation, rename sequencing.
 *
 * Module-level stubs use `patchModule()` (not Sinon) because Node 22 binds
 * `fs.*Sync` and `child_process.spawn` through non-configurable getters via
 * the TS `__importStar` helper — Sinon's `sandbox.stub(fs, ...)` would throw
 * `Descriptor for property X is non-configurable and non-writable`.
 * Real temp dirs (`makeTempDir` / `makeTempFile`) are used wherever cheap.
 */

import * as assert from 'node:assert/strict';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import type * as child_process from 'child_process';
import {
    cleanupPartialVideo,
    findFfmpeg,
    assembleVideo,
} from '../../src/engines/ffmpeg';
import type { AssembleVideoOptions, AssembleVideoResult } from '../../src/engines/ffmpeg';
import {
    makeTempDir,
    makeTempFile,
    cleanupTempPaths,
    registerCleanup,
    patchModule,
} from '../helpers';

// ── Fake-process helper ──────────────────────────────────────────────────────

/**
 * Build a minimal ChildProcess-like object. Tests can resolve it by emitting
 * 'close' (with exit code) or 'error' (with Error) on the returned emitter.
 */
function makeFakeProc(opts: {
    stderr?: string;
    exitCode?: number | null;
    error?: Error;
    emitAfter?: number;
} = {}): { proc: any; trigger: () => void } {
    const proc: any = new EventEmitter();
    proc.stderr = new EventEmitter();
    proc.kill = () => {};

    const trigger = () => {
        setImmediate(() => {
            if (opts.stderr) {
                proc.stderr.emit('data', Buffer.from(opts.stderr));
            }
            if (opts.error) {
                proc.emit('error', opts.error);
                return;
            }
            proc.emit('close', opts.exitCode ?? 0);
        });
    };

    return { proc, trigger };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('FFmpeg utilities', () => {

    after(() => { cleanupTempPaths(); });

    // ─────────────────────────────────────────────────────────────────────
    // cleanupPartialVideo (pre-existing tests retained)
    // ─────────────────────────────────────────────────────────────────────

    describe('cleanupPartialVideo', () => {
        it('removes the output file if it exists', () => {
            const outputPath = makeTempFile('video.mp4', 'test content');
            assert.ok(fs.existsSync(outputPath));
            cleanupPartialVideo(outputPath);
            assert.ok(!fs.existsSync(outputPath));
        });

        it('removes the thumbnail file if it exists', () => {
            const dir = makeTempDir();
            const outputPath = path.join(dir, 'video.mp4');
            const thumbPath = path.join(dir, 'thumb.png');
            fs.writeFileSync(outputPath, 'v');
            fs.writeFileSync(thumbPath, 't');

            cleanupPartialVideo(outputPath, thumbPath);
            assert.ok(!fs.existsSync(outputPath));
            assert.ok(!fs.existsSync(thumbPath));
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
            const outputPath = path.join(dir, 'video.mp4');
            fs.writeFileSync(outputPath, 'v');
            cleanupPartialVideo(outputPath, undefined);
            assert.ok(!fs.existsSync(outputPath));
        });

        it('removes output but tolerates missing thumbnail', () => {
            const dir = makeTempDir();
            const outputPath = path.join(dir, 'video.mp4');
            const missingThumb = path.join(dir, 'does-not-exist.png');
            fs.writeFileSync(outputPath, 'v');
            cleanupPartialVideo(outputPath, missingThumb);
            assert.ok(!fs.existsSync(outputPath));
            assert.ok(!fs.existsSync(missingThumb));
        });

        // Negative path (F-863253-025): verify error-swallowing contract.
        it('silently swallows EACCES (or any fs error) — best-effort contract', () => {
            // Patch the underlying `require('fs')` module directly. Node 22's
            // non-configurable getter on the star-imported `fs` blocks Sinon.
            const existsPatch = patchModule<typeof import('fs')>(
                'fs',
                'existsSync',
                (() => true) as typeof fs.existsSync,
            );
            const unlinkPatch = patchModule<typeof import('fs')>(
                'fs',
                'unlinkSync',
                (() => {
                    throw Object.assign(new Error('permission denied'), { code: 'EACCES' });
                }) as typeof fs.unlinkSync,
            );
            try {
                assert.doesNotThrow(
                    () => cleanupPartialVideo('/fake/output.mp4', '/fake/thumb.png'),
                    'cleanupPartialVideo must never throw — it is best-effort',
                );
            } finally {
                unlinkPatch.restore();
                existsPatch.restore();
            }
        });
    });

    // ─────────────────────────────────────────────────────────────────────
    // AssembleVideoOptions / AssembleVideoResult shape (pre-existing)
    // ─────────────────────────────────────────────────────────────────────

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

    // ─────────────────────────────────────────────────────────────────────
    // findFfmpeg (F-863253-013 CRITICAL)
    // ─────────────────────────────────────────────────────────────────────

    describe('findFfmpeg', () => {
        // Per-test state: collected spawn invocations + active patches.
        // We manually patch instead of using Sinon because Node 22's
        // non-configurable getters on star-imported `child_process` / `fs`
        // reject `sinon.stub(child_process, 'spawn')`.
        let spawnCalls: Array<{ cmd: string; args: string[]; opts: any }>;
        let patches: Array<{ restore: () => void }>;

        /**
         * Install a spawn stub that returns a fake ChildProcess. `procOpts`
         * controls how the fake resolves (error / exitCode / stderr).
         */
        function installSpawn(procOpts: {
            stderr?: string;
            exitCode?: number | null;
            error?: Error;
        }): void {
            const spawnFn = ((cmd: string, args: string[], opts: any) => {
                spawnCalls.push({ cmd, args, opts });
                const { proc, trigger } = makeFakeProc(procOpts);
                trigger();
                return proc;
            }) as unknown as typeof child_process.spawn;
            patches.push(patchModule<typeof import('child_process')>(
                'child_process',
                'spawn',
                spawnFn,
            ));
        }

        /** Install an existsSync stub. */
        function installExists(pred: (p: string) => boolean): void {
            patches.push(patchModule<typeof import('fs')>(
                'fs',
                'existsSync',
                ((p: any) => pred(String(p))) as typeof fs.existsSync,
            ));
        }

        beforeEach(() => {
            spawnCalls = [];
            patches = [];
            // Default: simulate "ffmpeg not on PATH". Individual tests may
            // install a different spawn stub AFTER popping this one.
            installSpawn({ error: new Error('ENOENT') });
        });

        afterEach(() => {
            // Restore in reverse order.
            for (let i = patches.length - 1; i >= 0; i--) {
                patches[i].restore();
            }
            patches = [];
        });

        /** Replace the default spawn stub with a new one. */
        function replaceSpawn(procOpts: {
            stderr?: string;
            exitCode?: number | null;
            error?: Error;
        }): void {
            // Pop the last spawn patch (always at the tail per beforeEach).
            const prev = patches.pop();
            prev?.restore();
            installSpawn(procOpts);
        }

        it('returns the configured path first if it exists', async () => {
            installExists((p) => p === '/opt/my-ffmpeg');

            const result = await findFfmpeg('/opt/my-ffmpeg');
            assert.strictEqual(result, '/opt/my-ffmpeg');
            // The configured path short-circuits spawn.
            assert.strictEqual(spawnCalls.length, 0, 'should not probe PATH if configured path exists');
        });

        it('ignores a bare "ffmpeg" configuredPath and continues the search', async () => {
            installExists(() => false);
            replaceSpawn({ exitCode: 0 });

            const result = await findFfmpeg('ffmpeg');
            assert.strictEqual(result, 'ffmpeg', 'should fall back to PATH lookup and return bare name');
        });

        it('returns a common install path when present on disk', async () => {
            const common = process.platform === 'win32'
                ? 'C:\\ffmpeg\\bin\\ffmpeg.exe'
                : '/usr/bin/ffmpeg';

            installExists((p) => p === common);

            const result = await findFfmpeg();
            assert.strictEqual(result, common);
            assert.strictEqual(spawnCalls.length, 0, 'should not probe PATH when a common path matched');
        });

        it('falls back to PATH lookup when no configured or common path matches', async () => {
            installExists(() => false);
            replaceSpawn({ exitCode: 0 });

            const result = await findFfmpeg();
            assert.strictEqual(result, 'ffmpeg');
            assert.strictEqual(spawnCalls.length, 1, 'should spawn once for the PATH probe');

            // Shell-injection safety: spawn must be called with shell: false.
            const { cmd, args, opts } = spawnCalls[0];
            assert.strictEqual(cmd, 'ffmpeg');
            assert.deepStrictEqual(args, ['-version']);
            assert.strictEqual(opts.shell, false, 'spawn must use shell: false');
        });

        it('returns undefined when nothing resolves', async () => {
            installExists(() => false);
            // Default stub already simulates ENOENT on spawn.

            const result = await findFfmpeg();
            assert.strictEqual(result, undefined);
        });

        it('returns undefined when PATH probe exits with non-zero code', async () => {
            installExists(() => false);
            replaceSpawn({ exitCode: 1 });

            const result = await findFfmpeg();
            assert.strictEqual(result, undefined);
        });

        it('handles missing env vars on Windows (LOCALAPPDATA/PROGRAMFILES)', async () => {
            // Not a Windows-specific test of the result (we can't conditionally
            // change process.platform) — we verify findFfmpeg resolves gracefully
            // even if its internal candidate list includes empty-prefix paths.
            const savedLocal = process.env.LOCALAPPDATA;
            const savedPF = process.env.PROGRAMFILES;
            try {
                delete process.env.LOCALAPPDATA;
                delete process.env.PROGRAMFILES;

                installExists(() => false);

                const result = await findFfmpeg();
                // Should resolve (to undefined given no hits) without throwing.
                assert.strictEqual(result, undefined);
            } finally {
                if (savedLocal !== undefined) process.env.LOCALAPPDATA = savedLocal;
                if (savedPF !== undefined) process.env.PROGRAMFILES = savedPF;
            }
        });
    });

    // ─────────────────────────────────────────────────────────────────────
    // assembleVideo + runFfmpeg + renameFramesSequentially
    // (F-863253-014 CRITICAL, F-863253-019 HIGH)
    // ─────────────────────────────────────────────────────────────────────

    describe('assembleVideo', () => {
        /**
         * Per-spawn-call options. Indexed by call order so the first spawn
         * (video) can succeed while the second (thumbnail) fails.
         */
        type SpawnPlan = Array<{
            stderr?: string;
            exitCode?: number | null;
            error?: Error;
        }>;

        let spawnCalls: Array<{ cmd: string; args: string[]; opts: any }>;
        let patches: Array<{ restore: () => void }>;

        function installSpawn(plan: SpawnPlan): void {
            let idx = 0;
            const spawnFn = ((cmd: string, args: string[], opts: any) => {
                spawnCalls.push({ cmd, args, opts });
                const planEntry = plan[idx] ?? plan[plan.length - 1] ?? { exitCode: 0 };
                idx += 1;
                const { proc, trigger } = makeFakeProc(planEntry);
                trigger();
                return proc;
            }) as unknown as typeof child_process.spawn;
            patches.push(patchModule<typeof import('child_process')>(
                'child_process',
                'spawn',
                spawnFn,
            ));
        }

        function installExists(pred: (p: string) => boolean): void {
            const real = fs.existsSync;
            patches.push(patchModule<typeof import('fs')>(
                'fs',
                'existsSync',
                ((p: any) => {
                    // Call-through for paths the predicate doesn't care about
                    // so code paths that rely on real dir existence still pass.
                    const result = pred(String(p));
                    if (result !== undefined) return result;
                    return real(p);
                }) as typeof fs.existsSync,
            ));
        }

        beforeEach(() => {
            spawnCalls = [];
            patches = [];
        });

        afterEach(() => {
            for (let i = patches.length - 1; i >= 0; i--) {
                patches[i].restore();
            }
            patches = [];
        });

        function setupFrames(): { framesDir: string; outputPath: string } {
            // Use a real temp dir (cheaper than stubbing all fs calls, and
            // lets us assert rename behaviour).
            const framesDir = makeTempDir('codecomfy-frames-');
            // Write two "frames" with arbitrary names to prove rename works.
            fs.writeFileSync(path.join(framesDir, 'a.png'), 'frame1');
            fs.writeFileSync(path.join(framesDir, 'b.png'), 'frame2');

            const outDir = makeTempDir('codecomfy-out-');
            const outputPath = path.join(outDir, 'video.mp4');
            registerCleanup(outputPath);
            return { framesDir, outputPath };
        }

        it('happy path: renames frames, spawns ffmpeg with correct args, returns success', async () => {
            const { framesDir, outputPath } = setupFrames();

            installSpawn([{ exitCode: 0 }]);

            // existsSync default behaviour is real — patch only the output-path
            // check so assembleVideo thinks ffmpeg created it.
            installExists((p) => (p === outputPath ? true : undefined as unknown as boolean));

            const result = await assembleVideo({
                ffmpegPath: '/fake/ffmpeg',
                framesDir,
                outputPath,
                fps: 24,
            });

            assert.strictEqual(result.success, true, `expected success, got: ${result.error}`);

            // Frames should have been renamed to frame_00001.png / frame_00002.png
            const renamed = fs.readdirSync(framesDir).sort();
            assert.deepStrictEqual(renamed, ['frame_00001.png', 'frame_00002.png']);

            // Verify spawn got the right args (shell: false for safety).
            assert.strictEqual(spawnCalls.length, 1);
            const { cmd, args, opts } = spawnCalls[0];
            assert.strictEqual(cmd, '/fake/ffmpeg');
            assert.strictEqual(opts.shell, false, 'spawn must use shell: false');
            // Input pattern: frame_%05d.png under framesDir.
            const inputPatternArg = args[args.indexOf('-i') + 1];
            assert.ok(
                inputPatternArg.endsWith(`frame_%05d.png`),
                `expected -i pattern ending frame_%05d.png, got: ${inputPatternArg}`,
            );
            // Framerate argument present.
            const framerateArg = args[args.indexOf('-framerate') + 1];
            assert.strictEqual(framerateArg, '24');
        });

        it('returns error when framesDir does not exist', async () => {
            const result = await assembleVideo({
                ffmpegPath: '/fake/ffmpeg',
                framesDir: '/does/not/exist',
                outputPath: '/tmp/out.mp4',
                fps: 24,
            });
            assert.strictEqual(result.success, false);
            assert.match(result.error || '', /not found/i);
        });

        it('returns error when framesDir is empty', async () => {
            const framesDir = makeTempDir('codecomfy-empty-');
            const outDir = makeTempDir('codecomfy-out-');
            const result = await assembleVideo({
                ffmpegPath: '/fake/ffmpeg',
                framesDir,
                outputPath: path.join(outDir, 'out.mp4'),
                fps: 24,
            });
            assert.strictEqual(result.success, false);
            assert.match(result.error || '', /no frames/i);
        });

        it('surfaces FFmpeg non-zero exit with stderr tail', async () => {
            const { framesDir, outputPath } = setupFrames();

            installSpawn([{
                exitCode: 1,
                stderr: 'ffmpeg: error line 1\nerror line 2\nfinal fatal error',
            }]);

            const result = await assembleVideo({
                ffmpegPath: '/fake/ffmpeg',
                framesDir,
                outputPath,
                fps: 24,
            });

            assert.strictEqual(result.success, false);
            // Error message includes the FFmpeg exit code and the stderr tail
            // (proves stderr capture + truncation path).
            assert.match(result.error || '', /exited with code 1/);
            assert.match(result.error || '', /final fatal error/);
        });

        it('surfaces spawn error (e.g. ffmpeg not found) with installation hint', async () => {
            const { framesDir, outputPath } = setupFrames();

            installSpawn([{
                error: Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }),
            }]);

            const result = await assembleVideo({
                ffmpegPath: 'ffmpeg',
                framesDir,
                outputPath,
                fps: 24,
            });

            assert.strictEqual(result.success, false);
            assert.match(result.error || '', /ENOENT|spawn/i);
            // The hint-message path kicks in when ffmpegPath === 'ffmpeg'.
            assert.match(result.error || '', /PATH|codecomfy\.ffmpegPath/i);
        });

        it('returns error when output file is not created despite ffmpeg success', async () => {
            const { framesDir, outputPath } = setupFrames();

            installSpawn([{ exitCode: 0 }]);
            // existsSync: pretend framesDir exists but outputPath does NOT
            // after spawn returns — this is the "file was not created" branch.
            installExists((p) => (p === outputPath ? false : undefined as unknown as boolean));

            const result = await assembleVideo({
                ffmpegPath: '/fake/ffmpeg',
                framesDir,
                outputPath,
                fps: 24,
            });

            assert.strictEqual(result.success, false);
            assert.match(result.error || '', /was not created/i);
        });

        it('generates thumbnail when thumbnailPath is provided (second spawn)', async () => {
            const { framesDir, outputPath } = setupFrames();
            const thumbPath = outputPath.replace('.mp4', '.thumb.png');

            // First call = video assembly, second = thumbnail. Both succeed.
            installSpawn([{ exitCode: 0 }, { exitCode: 0 }]);

            // Pretend output + thumb both exist after spawn.
            installExists((p) => {
                if (p === outputPath || p === thumbPath) return true;
                return undefined as unknown as boolean;
            });

            const result = await assembleVideo({
                ffmpegPath: '/fake/ffmpeg',
                framesDir,
                outputPath,
                fps: 24,
                thumbnailPath: thumbPath,
            });

            assert.strictEqual(result.success, true);
            assert.strictEqual(result.thumbnailPath, thumbPath);

            assert.strictEqual(spawnCalls.length, 2, 'spawn should be called twice — video + thumbnail');

            // Thumbnail spawn args: should include the video as input and thumbnail as output.
            const thumbArgs = spawnCalls[1].args;
            assert.ok(thumbArgs.includes(outputPath), 'thumbnail args should reference the video');
            assert.ok(thumbArgs.includes(thumbPath), 'thumbnail args should include thumbnail output path');
        });

        it('tolerates thumbnail failure (video success still returned)', async () => {
            const { framesDir, outputPath } = setupFrames();
            const thumbPath = outputPath.replace('.mp4', '.thumb.png');

            installSpawn([
                { exitCode: 0 },
                { exitCode: 1, stderr: 'thumb failure' },
            ]);

            installExists((p) => {
                if (p === outputPath) return true;
                if (p === thumbPath) return false; // thumb never materialised
                return undefined as unknown as boolean;
            });

            const result = await assembleVideo({
                ffmpegPath: '/fake/ffmpeg',
                framesDir,
                outputPath,
                fps: 24,
                thumbnailPath: thumbPath,
            });

            assert.strictEqual(result.success, true, 'video should still succeed when thumbnail fails');
            assert.strictEqual(result.thumbnailPath, undefined, 'thumbnailPath should be omitted on failure');
        });
    });

    // ─────────────────────────────────────────────────────────────────────
    // renameFramesSequentially — exercised via assembleVideo
    // (F-863253-019 HIGH — the rename helper's contract)
    // ─────────────────────────────────────────────────────────────────────

    describe('renameFramesSequentially (via assembleVideo)', () => {
        let patches: Array<{ restore: () => void }>;

        beforeEach(() => { patches = []; });
        afterEach(() => {
            for (let i = patches.length - 1; i >= 0; i--) {
                patches[i].restore();
            }
            patches = [];
        });

        it('renames in sorted order to frame_%05d.png pattern', async () => {
            const framesDir = makeTempDir('codecomfy-frames-');
            // Create three frames with out-of-order-ish names.
            fs.writeFileSync(path.join(framesDir, 'c.png'), '3');
            fs.writeFileSync(path.join(framesDir, 'a.png'), '1');
            fs.writeFileSync(path.join(framesDir, 'b.png'), '2');

            const outDir = makeTempDir('codecomfy-out-');
            const outputPath = path.join(outDir, 'v.mp4');
            registerCleanup(outputPath);

            // Stub spawn: succeed immediately.
            const spawnFn = (() => {
                const { proc, trigger } = makeFakeProc({ exitCode: 0 });
                trigger();
                return proc;
            }) as unknown as typeof child_process.spawn;
            patches.push(patchModule<typeof import('child_process')>(
                'child_process',
                'spawn',
                spawnFn,
            ));

            // Patch existsSync so assembleVideo believes the output was created.
            const realExists = fs.existsSync;
            patches.push(patchModule<typeof import('fs')>(
                'fs',
                'existsSync',
                ((p: any) => {
                    if (p === outputPath) return true;
                    return realExists(p);
                }) as typeof fs.existsSync,
            ));

            const result = await assembleVideo({
                ffmpegPath: '/fake/ffmpeg',
                framesDir,
                outputPath,
                fps: 24,
            });
            assert.strictEqual(result.success, true);

            const dirContents = fs.readdirSync(framesDir).sort();
            assert.deepStrictEqual(dirContents, [
                'frame_00001.png',
                'frame_00002.png',
                'frame_00003.png',
            ], 'frames should be renamed to zero-padded sequential pattern');

            // Verify content preserved: a→1, b→2, c→3 (sorted order).
            assert.strictEqual(fs.readFileSync(path.join(framesDir, 'frame_00001.png'), 'utf-8'), '1');
            assert.strictEqual(fs.readFileSync(path.join(framesDir, 'frame_00002.png'), 'utf-8'), '2');
            assert.strictEqual(fs.readFileSync(path.join(framesDir, 'frame_00003.png'), 'utf-8'), '3');
        });

        it('surfaces rename failure as an assembly error', async () => {
            const framesDir = makeTempDir('codecomfy-frames-');
            fs.writeFileSync(path.join(framesDir, 'x.png'), '1');

            const outDir = makeTempDir('codecomfy-out-');
            const outputPath = path.join(outDir, 'v.mp4');

            // Force renameSync to throw.
            patches.push(patchModule<typeof import('fs')>(
                'fs',
                'renameSync',
                (() => {
                    throw new Error('EACCES: permission denied');
                }) as typeof fs.renameSync,
            ));

            const result = await assembleVideo({
                ffmpegPath: '/fake/ffmpeg',
                framesDir,
                outputPath,
                fps: 24,
            });
            assert.strictEqual(result.success, false);
            assert.match(result.error || '', /Failed to rename frames/);
        });
    });
});
