/**
 * Shared test helpers.
 *
 * Extracted from duplicated `makeTempFile` / cleanup logic that previously
 * lived in config.test.ts, ffmpeg-utils.test.ts, validation-paths.test.ts,
 * presets-registry.test.ts, and pruner.test.ts.
 *
 * Usage:
 * ```ts
 * import { makeTempFile, registerCleanup, cleanupTempPaths } from '../helpers';
 *
 * after(() => cleanupTempPaths());
 *
 * it('does something', () => {
 *     const p = makeTempFile('data.txt', 'hello');
 *     // ...
 * });
 * ```
 *
 * The registry is process-global so any test file that calls
 * `registerCleanup(p)` or uses `makeTempFile` participates in a shared
 * cleanup pool when its own `after()` hook calls `cleanupTempPaths()`.
 *
 * Each cleanup pass reports any paths it could not remove via
 * `console.warn` so that persistent temp leaks surface loudly rather than
 * silently accumulating in `os.tmpdir()`.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/** Process-global pool of temp paths to clean up. */
const tmpPaths: string[] = [];

// ---------------------------------------------------------------------------
// Module-method patching (replacement for Sinon stubs on built-in modules)
// ---------------------------------------------------------------------------
//
// Node 22 exposes `fs.*Sync` and `child_process.spawn` as properties that
// `__importStar()` re-binds through non-configurable getters in the TS
// CommonJS output. Sinon can't stub those. But the UNDERLYING
// `require('fs')` / `require('child_process')` module objects still have
// writable properties — and the `__importStar` getters forward to them.
// So reassigning on the underlying module object transparently redirects
// BOTH the test's star import AND the source under test.
//
// `patchModule(modName, key, fn)` reassigns `require(modName)[key] = fn` and
// returns a `restore()` function. Pair with try/finally so an exception never
// leaks a patched module into the next test.

interface PatchRestore {
    /** Restore the original method. Safe to call more than once. */
    restore: () => void;
}

/**
 * Replace a method on a built-in module. Returns a `restore()` handle.
 *
 * This is a minimal replacement for `sinon.stub(mod, method)` which stopped
 * working in Node 22 when the TS CommonJS star-import helper started binding
 * module properties as non-configurable getters.
 *
 * Usage:
 * ```ts
 * const patch = patchModule<typeof import('fs')>('fs', 'existsSync', () => true);
 * try {
 *     // ...test body...
 * } finally {
 *     patch.restore();
 * }
 * ```
 */
export function patchModule<M extends object>(
    modName: string,
    key: keyof M,
    replacement: M[keyof M],
): PatchRestore {
    const mod = require(modName) as M;
    const original = mod[key];
    let restored = false;
    mod[key] = replacement;
    return {
        restore: () => {
            if (restored) return;
            mod[key] = original;
            restored = true;
        },
    };
}

/**
 * Convenience: patch many methods at once on a single module. Returns a
 * single `restore()` that rolls everything back in reverse order.
 */
export function patchModuleMany<M extends object>(
    modName: string,
    patches: Partial<M>,
): PatchRestore {
    const restores: PatchRestore[] = [];
    for (const k of Object.keys(patches) as (keyof M)[]) {
        restores.push(patchModule<M>(modName, k, patches[k] as M[keyof M]));
    }
    return {
        restore: () => {
            for (let i = restores.length - 1; i >= 0; i--) {
                restores[i].restore();
            }
        },
    };
}

/**
 * Register a path (file or directory) for later cleanup.
 *
 * Files are removed before directories when `cleanupTempPaths()` runs.
 */
export function registerCleanup(p: string): void {
    tmpPaths.push(p);
}

/**
 * Create a temporary file inside a fresh temp directory and return its path.
 *
 * The directory and file are both registered for cleanup.
 *
 * @param name      Filename inside the new temp directory (e.g. `"ffmpeg.exe"`).
 * @param content   Optional file body (default `""`).
 * @param prefix    Optional `mkdtempSync` prefix (default `"codecomfy-test-"`).
 */
export function makeTempFile(
    name: string,
    content: string = '',
    prefix: string = 'codecomfy-test-',
): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    const filePath = path.join(dir, name);
    fs.writeFileSync(filePath, content);
    tmpPaths.push(filePath);
    tmpPaths.push(dir);
    return filePath;
}

/**
 * Create an empty temp directory registered for cleanup.
 */
export function makeTempDir(prefix: string = 'codecomfy-test-'): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    tmpPaths.push(dir);
    return dir;
}

// ---------------------------------------------------------------------------
// globalThis.fetch stubbing (shared HTTP test helper)
// ---------------------------------------------------------------------------
//
// Extracted from `comfy-server-engine.test.ts` where it lived as a local
// helper across 17 call sites. Any test that needs to replace the global
// `fetch` with a handler should use this so the shape stays consistent and
// future network-touching tests (ComfyUI, NextGallery probe, pollers) share
// the same contract.

/**
 * Record of a single fetch call captured by `stubFetch`.
 *
 * The `url` field is always a string for assertion convenience — if the
 * source passed a `Request` or `URL` object, it is coerced via `String()`.
 */
export interface FetchCall {
    /** URL string the source code passed to `fetch`. */
    url: string;
    /** Init object the source code passed (optional). */
    init?: RequestInit;
}

export interface FetchStub {
    /** Every call recorded in the order it was made. */
    calls: FetchCall[];
    /** Restore the original `globalThis.fetch`. Safe to call more than once. */
    restore: () => void;
}

/**
 * Replace `globalThis.fetch` with a handler and record every call.
 *
 * The handler receives the raw `url` (string | URL | Request) and `init`,
 * and returns anything the source code is willing to await — typically a
 * Response-shaped object. Use `fakeResponse()` in tests to build bodies.
 *
 * Usage:
 * ```ts
 * const stub = stubFetch(async (url) => fakeResponse({ ok: true, status: 200 }));
 * try {
 *     await sut.doNetworkThing();
 *     assert.ok(stub.calls[0].url.endsWith('/system_stats'));
 * } finally {
 *     stub.restore();
 * }
 * ```
 *
 * The handler signature accepts a loose first param (`string | URL | Request`)
 * so it matches both the high-level fetch shape the engine uses and the
 * `fetch(request: Request)` style for future callers.
 */
export function stubFetch(
    handler: (url: string | URL | Request, init?: RequestInit) => Promise<unknown> | unknown,
): FetchStub {
    const g = globalThis as { fetch?: typeof fetch };
    const original = g.fetch;
    const calls: FetchCall[] = [];
    let restored = false;
    g.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: typeof url === 'string' ? url : String(url), init });
        return handler(url, init);
    }) as typeof fetch;
    return {
        calls,
        restore: () => {
            if (restored) return;
            g.fetch = original;
            restored = true;
        },
    };
}

/**
 * Remove all registered temp paths.
 *
 * Returns `{ removed, failed }` so callers can assert on leaks. Also logs
 * a warning for each path that could not be removed — previous cleanup
 * was silent, which let leaks accumulate unseen.
 */
export function cleanupTempPaths(): { removed: number; failed: string[] } {
    let removed = 0;
    const failed: string[] = [];

    // Reverse order: files before directories (LIFO)
    const toClean = tmpPaths.splice(0).reverse();

    for (const p of toClean) {
        try {
            const stat = fs.statSync(p);
            if (stat.isDirectory()) {
                // Recursive so a registered temp root can swallow any
                // nested run folders tests produced along the way.
                fs.rmSync(p, { recursive: true, force: true });
            } else {
                fs.unlinkSync(p);
            }
            removed++;
        } catch (err) {
            // Path may already be gone (e.g. test ran `fs.rmSync` itself).
            // Only surface a real leak — ENOENT is fine.
            const code = (err as NodeJS.ErrnoException).code;
            if (code !== 'ENOENT') {
                failed.push(p);
                console.warn(`[test/helpers] failed to clean up ${p}: ${code ?? err}`);
            }
        }
    }

    return { removed, failed };
}
