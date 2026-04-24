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

// ---------------------------------------------------------------------------
// fakeResponse — minimal Response-shaped object the engine is willing to consume
// ---------------------------------------------------------------------------
//
// F-904559-038: every test previously hand-built an object with `.ok`, `.status`,
// `.json()`, `.text()`, `.body`. That duplication lives in one place now.
//
// Node 22 exposes a real `Response` global, but tests often want:
//   - JSON bodies without hand-stringifying
//   - to control `ok`/`status` independently
//   - a throwing `.json()` to simulate parse failures
//   - a binary body (Uint8Array) for /view responses
//
// The helper favours that flexibility over strict Response fidelity. If a
// test needs strict fidelity it can pass a real `Response` through — code
// under test works with either shape because it only reads a small surface.

/**
 * Options for `fakeResponse()`.
 *
 * Pass exactly as much as the code under test reads — nothing more.
 * For the ComfyUI engine that means `.ok`, `.status`, `.json()`, `.text()`,
 * and for binary endpoints (`/view`) `.body` (any — the engine pipes it).
 */
export interface FakeResponseInit {
    /** Override the default `.ok` derivation from status. */
    ok?: boolean;
    /** HTTP status code. Default 200. */
    status?: number;
    /** Custom `.json()` — if provided, overrides `jsonValue`. */
    json?: () => Promise<unknown>;
    /** Value `.json()` should resolve to. */
    jsonValue?: unknown;
    /** Value `.text()` should resolve to. Default `''`. */
    text?: string;
    /** Raw body — opaque pass-through for binary streaming paths. */
    body?: unknown;
    /** Response headers, attached to `.headers` (plain object, Headers-like). */
    headers?: Record<string, string>;
}

/** Duck-typed Response for tests. Matches the slice of `Response` the engine reads. */
export interface FakeResponse {
    ok: boolean;
    status: number;
    headers: Record<string, string>;
    text(): Promise<string>;
    json(): Promise<unknown>;
    body: unknown;
}

/**
 * Build a Response-shaped object for test fetch stubs.
 *
 * Typical usage in a test:
 * ```ts
 * const stub = stubFetch(async () => fakeResponse({ jsonValue: { ok: true } }));
 * ```
 *
 * Passing a raw JSON value (as `jsonValue`) is the common case — `fakeResponse`
 * will mark `.ok = true` unless `status >= 400` or `ok` is explicitly set.
 */
export function fakeResponse(init: FakeResponseInit = {}): FakeResponse {
    const status = init.status ?? 200;
    const ok = init.ok ?? (status >= 200 && status < 300);
    const text = init.text ?? '';
    const headers = init.headers ?? {};
    const jsonFn =
        init.json ??
        (async () => {
            if ('jsonValue' in init) return init.jsonValue;
            throw new SyntaxError('Unexpected end of JSON input');
        });

    return {
        ok,
        status,
        headers,
        text: async () => text,
        json: jsonFn,
        body: init.body,
    };
}

// ---------------------------------------------------------------------------
// playbackFetch — replay recorded ComfyUI HTTP responses (FT-5 / F-904558-033)
// ---------------------------------------------------------------------------
//
// Record the ComfyUI wire protocol once (against Mike's live server), replay
// forever in CI. Fixture layout on disk:
//
//   test/fixtures/comfy/<preset-id>/
//     index.json               # sequence of {method, urlPattern, body-or-file}
//     01-prompt-response.json  # referenced by index.json entries
//     02-history-poll-01.json
//     ...
//     04-view-frame_00001.png
//     04-view-frame_00001.meta.json
//
// index.json shape:
// ```json
// {
//   "sequence": [
//     {
//       "method": "POST",
//       "urlPattern": "*/prompt",
//       "status": 200,
//       "bodyFile": "01-prompt-response.json",
//       "bodyKind": "json"
//     },
//     {
//       "method": "GET",
//       "urlPattern": "*/history/*",
//       "status": 200,
//       "bodyFile": "02-history-poll-01.json",
//       "bodyKind": "json"
//     },
//     {
//       "method": "GET",
//       "urlPattern": "*/view*",
//       "status": 200,
//       "bodyFile": "04-view-frame_00001.png",
//       "bodyKind": "binary",
//       "headers": { "content-type": "image/png" }
//     }
//   ]
// }
// ```
//
// urlPattern is a glob: `*` matches any run of non-`/` characters by default
// (simple substring match for fixtures). The playbackFetch loop walks entries
// in order; each live fetch() call shifts the next entry, fails loudly on a
// mismatch (so re-records are noticed instead of silently breaking tests).

interface PlaybackEntry {
    /** HTTP method — match is exact, case-insensitive. */
    method: string;
    /** Glob pattern for the URL. `*` is a permissive "anything" wildcard. */
    urlPattern: string;
    /** Status to return. Default 200. */
    status?: number;
    /** Inline JSON body (overrides bodyFile). */
    body?: unknown;
    /** Relative filename under fixtureDir. */
    bodyFile?: string;
    /** `json` (default) → parsed; `binary` → Buffer; `text` → string. */
    bodyKind?: 'json' | 'binary' | 'text';
    /** Headers to attach. */
    headers?: Record<string, string>;
}

interface PlaybackIndex {
    sequence: PlaybackEntry[];
}

export interface PlaybackFetchCall {
    /** The URL the source code requested, coerced to a string. */
    url: string;
    /** The method the source code supplied (defaults to GET when init absent). */
    method: string;
}

export interface PlaybackFetchStub {
    /** Every call recorded in the order it was made. */
    calls: PlaybackFetchCall[];
    /** Replay cursor — the index of the next entry to serve. */
    cursor(): number;
    /** Remaining entries not yet consumed. */
    remaining(): PlaybackEntry[];
    /** Restore `globalThis.fetch`. */
    restore: () => void;
}

/**
 * Minimal glob: supports `*` as "any characters up to next literal". Used for
 * fixtures where full regex is overkill. Matches greedily from left to right.
 */
function globMatch(pattern: string, value: string): boolean {
    // Escape regex metacharacters except `*`, then replace `*` with `.*`.
    const re = new RegExp(
        '^' +
            pattern
                .split('*')
                .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
                .join('.*') +
            '$',
    );
    return re.test(value);
}

/**
 * Replay recorded ComfyUI HTTP responses from a fixture directory.
 *
 * See the fixture README at `test/fixtures/comfy/README.md` for the
 * recording protocol. `fixtureDir` must contain an `index.json` with a
 * `sequence` array; binary `bodyFile` entries are read raw and attached to
 * the response's `.body` as a `Uint8Array`, JSON entries are parsed.
 *
 * Usage:
 * ```ts
 * const stub = playbackFetch(path.join(__dirname, '../fixtures/comfy/hq-image'));
 * try {
 *   await runGeneration();
 *   assert.strictEqual(stub.remaining().length, 0, 'all fixture entries consumed');
 * } finally {
 *   stub.restore();
 * }
 * ```
 *
 * Failure modes that throw descriptively:
 *   - `index.json` missing or malformed
 *   - fixture directory missing
 *   - incoming fetch() doesn't match the next entry (method or pattern mismatch)
 *   - sequence exhausted but source still calls fetch()
 */
export function playbackFetch(fixtureDir: string): PlaybackFetchStub {
    const indexPath = path.join(fixtureDir, 'index.json');
    if (!fs.existsSync(indexPath)) {
        throw new Error(`[playbackFetch] missing index.json at ${indexPath}`);
    }
    let parsed: PlaybackIndex;
    try {
        parsed = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`[playbackFetch] failed to parse ${indexPath}: ${message}`);
    }
    if (!parsed || !Array.isArray(parsed.sequence)) {
        throw new Error(`[playbackFetch] index.json must have a "sequence" array`);
    }

    const sequence = parsed.sequence.slice();
    let cursor = 0;
    const calls: PlaybackFetchCall[] = [];
    const g = globalThis as { fetch?: typeof fetch };
    const original = g.fetch;
    let restored = false;

    g.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        const urlStr = typeof url === 'string' ? url : String(url);
        const method = (init?.method ?? 'GET').toUpperCase();
        calls.push({ url: urlStr, method });
        // The returned object is a duck-typed Response — same surface used by
        // stubFetch. Cast through `unknown` to silence the strictness-check
        // without losing the real-fetch signature for callers.

        if (cursor >= sequence.length) {
            throw new Error(
                `[playbackFetch] fixture exhausted; extra call: ${method} ${urlStr}`,
            );
        }
        const entry = sequence[cursor++];
        const expectedMethod = entry.method.toUpperCase();
        if (expectedMethod !== method) {
            throw new Error(
                `[playbackFetch] expected ${expectedMethod} ${entry.urlPattern}, got ${method} ${urlStr}`,
            );
        }
        if (!globMatch(entry.urlPattern, urlStr)) {
            throw new Error(
                `[playbackFetch] URL mismatch at entry ${cursor - 1}: pattern "${entry.urlPattern}" vs actual "${urlStr}"`,
            );
        }

        const status = entry.status ?? 200;
        const kind = entry.bodyKind ?? 'json';
        let text = '';
        let jsonFn: (() => Promise<unknown>) | undefined;
        let body: unknown = undefined;

        if (entry.body !== undefined) {
            if (kind === 'binary') {
                body = entry.body;
            } else {
                text = typeof entry.body === 'string' ? entry.body : JSON.stringify(entry.body);
                jsonFn = async () => entry.body;
            }
        } else if (entry.bodyFile) {
            const filePath = path.join(fixtureDir, entry.bodyFile);
            if (!fs.existsSync(filePath)) {
                throw new Error(`[playbackFetch] bodyFile missing: ${filePath}`);
            }
            if (kind === 'binary') {
                body = fs.readFileSync(filePath);
            } else if (kind === 'text') {
                text = fs.readFileSync(filePath, 'utf-8');
            } else {
                const raw = fs.readFileSync(filePath, 'utf-8');
                text = raw;
                jsonFn = async () => JSON.parse(raw);
            }
        }

        return fakeResponse({
            status,
            body,
            text,
            json: jsonFn,
            headers: entry.headers,
        });
    }) as unknown as typeof fetch;

    return {
        calls,
        cursor: () => cursor,
        remaining: () => sequence.slice(cursor),
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
