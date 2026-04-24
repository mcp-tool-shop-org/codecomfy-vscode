/**
 * Adversarial tests for `sanitizeComfyFilename`.
 *
 * ComfyUI returns filenames in its history response. Those strings cross
 * a trust boundary: a compromised or malicious server could craft names
 * that escape the intended run folder (`../../../etc/shadow`, absolute
 * Windows paths, null bytes, etc.). The sanitizer is the choke point —
 * these tests cover the adversarial cases that matter.
 *
 * Carry-over from Wave 5 (dogfood swarm). The sanitizer itself was added
 * to `src/engines/comfyValidation.ts` in Stage A.
 *
 * Coverage philosophy:
 *   - Happy path (plain filenames accepted)
 *   - Traversal — Unix + Windows
 *   - Absolute paths — POSIX, Windows drive letters, UNC shares
 *   - Null bytes
 *   - Unicode curiosities — zero-width, bidi, NFD — DOCUMENT behaviour
 *     (the sanitizer currently treats these as literals; if that changes
 *     the tests flip too)
 *   - Empty / whitespace
 *   - Length boundaries
 *   - Control characters
 *   - Round-trip basename invariant (defence-in-depth)
 */

import * as assert from 'node:assert/strict';
import { sanitizeComfyFilename, ComfyResponseError } from '../../src/engines/comfyValidation';

/** Convenience: assert that `raw` is rejected with a ComfyResponseError. */
function assertRejected(raw: unknown, label: string): void {
    assert.throws(
        () => sanitizeComfyFilename(raw),
        (err: unknown) => {
            assert.ok(
                err instanceof ComfyResponseError,
                `[${label}] expected ComfyResponseError, got ${err instanceof Error ? err.constructor.name : typeof err}`,
            );
            assert.strictEqual((err as ComfyResponseError).responseKind, 'filename');
            return true;
        },
        `[${label}] input should have been rejected: ${JSON.stringify(raw)}`,
    );
}

describe('sanitizeComfyFilename (adversarial)', () => {

    // ── 1. Happy path ────────────────────────────────────────────────────────

    describe('happy path', () => {
        it('accepts plain .png filenames', () => {
            assert.strictEqual(sanitizeComfyFilename('foo.png'), 'foo.png');
        });

        it('accepts numbered .jpg filenames', () => {
            assert.strictEqual(sanitizeComfyFilename('image_001.jpg'), 'image_001.jpg');
        });

        it('accepts short .txt filenames', () => {
            assert.strictEqual(sanitizeComfyFilename('a.txt'), 'a.txt');
        });

        it('accepts filenames with dashes and underscores', () => {
            assert.strictEqual(
                sanitizeComfyFilename('frame-00042_render.png'),
                'frame-00042_render.png',
            );
        });

        it('accepts filenames with spaces (not a separator)', () => {
            // Spaces are filesystem-legal on every OS we target.
            assert.strictEqual(
                sanitizeComfyFilename('my output.png'),
                'my output.png',
            );
        });
    });

    // ── 2. Unix traversal ────────────────────────────────────────────────────

    describe('Unix-style path traversal', () => {
        it('rejects ../etc/passwd', () => {
            assertRejected('../etc/passwd', 'unix-traversal-1');
        });

        it('rejects ../../secret', () => {
            assertRejected('../../secret', 'unix-traversal-2');
        });

        it('rejects foo/../bar', () => {
            assertRejected('foo/../bar', 'unix-traversal-3');
        });

        it('rejects bare ".."', () => {
            assertRejected('..', 'unix-traversal-4');
        });

        it('rejects bare "."', () => {
            assertRejected('.', 'unix-traversal-5');
        });
    });

    // ── 3. Windows traversal ─────────────────────────────────────────────────

    describe('Windows-style path traversal', () => {
        it('rejects ..\\\\system32', () => {
            assertRejected('..\\system32', 'win-traversal-1');
        });

        it('rejects ..\\\\..\\\\boot.ini', () => {
            assertRejected('..\\..\\boot.ini', 'win-traversal-2');
        });

        it('rejects foo\\\\..\\\\bar', () => {
            assertRejected('foo\\..\\bar', 'win-traversal-3');
        });
    });

    // ── 4. Absolute paths ────────────────────────────────────────────────────

    describe('absolute paths', () => {
        it('rejects POSIX absolute /etc/passwd', () => {
            assertRejected('/etc/passwd', 'abs-posix');
        });

        it('rejects Windows absolute C:\\\\file.png', () => {
            assertRejected('C:\\file.png', 'abs-win-drive');
        });

        it('rejects Windows absolute D:/file.png (forward slashes)', () => {
            assertRejected('D:/file.png', 'abs-win-drive-fwd');
        });

        it('rejects Windows UNC share \\\\\\\\server\\\\share\\\\evil', () => {
            assertRejected('\\\\server\\share\\evil', 'abs-unc');
        });

        it('rejects a bare leading slash', () => {
            assertRejected('/foo', 'abs-bare-slash');
        });
    });

    // ── 5. Null bytes ────────────────────────────────────────────────────────

    describe('null bytes', () => {
        it('rejects foo\\0.png', () => {
            assertRejected('foo\0.png', 'null-byte-1');
        });

        it('rejects a lone null byte', () => {
            assertRejected('\0', 'null-byte-2');
        });

        it('rejects null byte followed by extension', () => {
            assertRejected('\0.txt', 'null-byte-3');
        });

        it('rejects null byte in the middle of a name', () => {
            assertRejected('safe\0name.png', 'null-byte-4');
        });
    });

    // ── 6. Unicode curiosities ───────────────────────────────────────────────
    //
    // These aren't necessarily malicious — but they're the kind of thing a
    // security reviewer asks about. The sanitizer currently treats them as
    // literal bytes and relies on the `path.basename` round-trip for its
    // final guard. We DOCUMENT that behaviour so a future rejection-stance
    // change is a conscious one.

    describe('Unicode curiosities (document current behaviour)', () => {
        it('accepts zero-width space in a filename (treated as literal)', () => {
            // U+200B is not a path separator — the sanitizer passes it
            // through. If a future hardening pass chooses to reject, flip
            // this to assertRejected.
            const name = 'foo\u200B.png';
            assert.strictEqual(sanitizeComfyFilename(name), name);
        });

        it('accepts bidi override (U+202E) in a filename (treated as literal)', () => {
            // Right-to-Left Override is a UI spoofing vector but not a
            // path-traversal vector. Documented as accepted.
            const name = '\u202Efoo.png';
            assert.strictEqual(sanitizeComfyFilename(name), name);
        });

        it('accepts NFD-decomposed accented filename (treated as literal)', () => {
            // "café.png" NFD-decomposed — the combining acute (U+0301) is
            // a regular code point. basename round-trip succeeds.
            const nfd = 'cafe\u0301.png';
            assert.strictEqual(sanitizeComfyFilename(nfd), nfd);
        });

        it('accepts non-ASCII filename (Japanese)', () => {
            const name = '画像_001.png';
            assert.strictEqual(sanitizeComfyFilename(name), name);
        });
    });

    // ── 7. Empty / whitespace ────────────────────────────────────────────────

    describe('empty and whitespace-only', () => {
        it('rejects empty string', () => {
            assertRejected('', 'empty');
        });

        it('rejects 3 spaces', () => {
            assertRejected('   ', 'whitespace-spaces');
        });

        it('rejects tab', () => {
            assertRejected('\t', 'whitespace-tab');
        });

        it('rejects newline', () => {
            assertRejected('\n', 'whitespace-newline');
        });

        it('rejects mixed whitespace', () => {
            assertRejected(' \t\n\r ', 'whitespace-mixed');
        });
    });

    // ── 8. Length boundaries ─────────────────────────────────────────────────
    //
    // The sanitizer does not enforce a max length itself — the filesystem
    // does. We document behaviour at 255 / 256 / 1000 so a future policy
    // change is visible.

    describe('length boundaries', () => {
        it('accepts a 255-char filename (typical NAME_MAX)', () => {
            const name = 'a'.repeat(251) + '.png'; // 255 chars
            assert.strictEqual(name.length, 255);
            assert.strictEqual(sanitizeComfyFilename(name), name);
        });

        it('accepts a 256-char filename (sanitizer does not enforce length)', () => {
            const name = 'a'.repeat(252) + '.png'; // 256 chars
            assert.strictEqual(name.length, 256);
            assert.strictEqual(sanitizeComfyFilename(name), name);
        });

        it('accepts a 1000-char filename (filesystem will reject at write-time)', () => {
            const name = 'a'.repeat(996) + '.png'; // 1000 chars
            assert.strictEqual(name.length, 1000);
            // Sanitizer policy: pass through; writing it to disk is the
            // caller's problem. If policy tightens, flip to assertRejected.
            assert.strictEqual(sanitizeComfyFilename(name), name);
        });
    });

    // ── 9. Control characters ────────────────────────────────────────────────
    //
    // The sanitizer does not blanket-reject control chars — only null.
    // Others are documented as accepted so any future tightening is
    // explicit.

    describe('control characters (document current behaviour)', () => {
        it('accepts SOH (U+0001) in a filename', () => {
            const name = 'foo\x01.png';
            assert.strictEqual(sanitizeComfyFilename(name), name);
        });

        it('accepts US (U+001F) in a filename', () => {
            const name = 'file\x1F.txt';
            assert.strictEqual(sanitizeComfyFilename(name), name);
        });

        it('still rejects NUL specifically', () => {
            // Reaffirm that NUL is the single rejected control char —
            // everything else above passes through.
            assertRejected('foo\0.png', 'ctrl-nul');
        });
    });

    // ── 10. basename round-trip invariant ────────────────────────────────────

    describe('path.basename round-trip', () => {
        it('rejects inputs where path.basename(x) !== x', () => {
            // Any value containing a separator fails this invariant.
            // The separator checks would already catch these, but this
            // assertion documents the defence-in-depth layer.
            assertRejected('dir/file.png', 'basename-slash');
            assertRejected('dir\\file.png', 'basename-backslash');
        });
    });

    // ── 11. Non-string inputs ────────────────────────────────────────────────

    describe('non-string inputs', () => {
        it('rejects null', () => {
            assertRejected(null, 'non-string-null');
        });

        it('rejects undefined', () => {
            assertRejected(undefined, 'non-string-undefined');
        });

        it('rejects a number', () => {
            assertRejected(42, 'non-string-number');
        });

        it('rejects an object', () => {
            assertRejected({ filename: 'x' }, 'non-string-object');
        });

        it('rejects an array', () => {
            assertRejected(['x.png'], 'non-string-array');
        });
    });
});
