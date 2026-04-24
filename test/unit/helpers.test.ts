/**
 * Tests for the shared test helpers themselves.
 *
 * `fakeResponse` and `playbackFetch` are the load-bearing plumbing for every
 * HTTP-touching test — they earn their own suite so future refactors cannot
 * silently drop behaviour and turn green fetch-stubbed tests into false
 * positives.
 *
 * Contract tested here:
 *   - fakeResponse default status 200 / ok=true
 *   - fakeResponse custom status, ok override
 *   - fakeResponse json/text/body round-trip
 *   - playbackFetch replays in order, fails loudly on exhaust/mismatch
 *   - playbackFetch JSON + binary + inline body shapes
 *   - playbackFetch missing index.json / bad JSON surfaces descriptive errors
 */

import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import {
    fakeResponse,
    playbackFetch,
    makeTempDir,
    cleanupTempPaths,
} from '../helpers';

after(() => {
    cleanupTempPaths();
});

describe('fakeResponse', () => {
    it('defaults to status 200 and ok=true', async () => {
        const r = fakeResponse();
        assert.strictEqual(r.status, 200);
        assert.strictEqual(r.ok, true);
    });

    it('derives ok=false for 4xx / 5xx statuses', () => {
        assert.strictEqual(fakeResponse({ status: 404 }).ok, false);
        assert.strictEqual(fakeResponse({ status: 500 }).ok, false);
        // 3xx is not "ok" per the Response spec — the engine only checks
        // 2xx, so 3xx is documented here rather than asserted.
    });

    it('honors explicit ok override', () => {
        // Useful for simulating "ok but body parse will fail" cases where
        // the test wants `.ok` divorced from `.status`.
        assert.strictEqual(fakeResponse({ status: 500, ok: true }).ok, true);
    });

    it('resolves json() to the configured jsonValue', async () => {
        const r = fakeResponse({ jsonValue: { foo: 'bar' } });
        const parsed = await r.json();
        assert.deepStrictEqual(parsed, { foo: 'bar' });
    });

    it('json() rejects with a SyntaxError when no body is configured', async () => {
        const r = fakeResponse();
        await assert.rejects(() => r.json(), /JSON input/);
    });

    it('text() resolves to the configured text (default empty string)', async () => {
        const r = fakeResponse({ text: 'hello world' });
        assert.strictEqual(await r.text(), 'hello world');
        assert.strictEqual(await fakeResponse().text(), '');
    });

    it('passes body through opaquely for binary paths', () => {
        const payload = new Uint8Array([1, 2, 3]);
        const r = fakeResponse({ body: payload });
        assert.strictEqual(r.body, payload);
    });

    it('attaches headers as a plain object (Headers-like)', () => {
        const r = fakeResponse({ headers: { 'content-type': 'image/png' } });
        assert.strictEqual(r.headers['content-type'], 'image/png');
    });
});

// ---------------------------------------------------------------------------
// playbackFetch
// ---------------------------------------------------------------------------

function writeFixture(dir: string, files: Record<string, string | Buffer>): void {
    for (const [name, content] of Object.entries(files)) {
        const full = path.join(dir, name);
        if (Buffer.isBuffer(content)) {
            fs.writeFileSync(full, content);
        } else {
            fs.writeFileSync(full, content, 'utf-8');
        }
    }
}

describe('playbackFetch', () => {
    it('replays JSON entries in order', async () => {
        const dir = makeTempDir('codecomfy-pb-');
        writeFixture(dir, {
            'index.json': JSON.stringify({
                sequence: [
                    {
                        method: 'POST',
                        urlPattern: '*/prompt',
                        status: 200,
                        bodyFile: 'prompt.json',
                        bodyKind: 'json',
                    },
                    {
                        method: 'GET',
                        urlPattern: '*/history/*',
                        status: 200,
                        bodyFile: 'history.json',
                        bodyKind: 'json',
                    },
                ],
            }),
            'prompt.json': JSON.stringify({ prompt_id: 'abc' }),
            'history.json': JSON.stringify({ abc: { outputs: {}, status: { completed: true } } }),
        });

        const stub = playbackFetch(dir);
        try {
            const r1 = await (globalThis.fetch as any)(
                'http://host:8188/prompt',
                { method: 'POST' },
            );
            assert.strictEqual(r1.ok, true);
            assert.deepStrictEqual(await r1.json(), { prompt_id: 'abc' });

            const r2 = await (globalThis.fetch as any)(
                'http://host:8188/history/abc',
                { method: 'GET' },
            );
            assert.strictEqual(r2.ok, true);
            const h = (await r2.json()) as any;
            assert.strictEqual(h.abc.status.completed, true);

            assert.strictEqual(stub.calls.length, 2);
            assert.strictEqual(stub.cursor(), 2);
            assert.strictEqual(stub.remaining().length, 0);
        } finally {
            stub.restore();
        }
    });

    it('serves inline body (no bodyFile) when provided', async () => {
        const dir = makeTempDir('codecomfy-pb-');
        writeFixture(dir, {
            'index.json': JSON.stringify({
                sequence: [
                    {
                        method: 'GET',
                        urlPattern: '*/system_stats',
                        status: 200,
                        body: { system: { os: 'test' } },
                        bodyKind: 'json',
                    },
                ],
            }),
        });
        const stub = playbackFetch(dir);
        try {
            const r = await (globalThis.fetch as any)('http://host:8188/system_stats');
            assert.deepStrictEqual(await r.json(), { system: { os: 'test' } });
        } finally {
            stub.restore();
        }
    });

    it('returns binary body for binary bodyKind entries', async () => {
        const dir = makeTempDir('codecomfy-pb-');
        const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG magic
        writeFixture(dir, {
            'index.json': JSON.stringify({
                sequence: [
                    {
                        method: 'GET',
                        urlPattern: '*/view*',
                        status: 200,
                        bodyFile: 'frame.png',
                        bodyKind: 'binary',
                        headers: { 'content-type': 'image/png' },
                    },
                ],
            }),
            'frame.png': bytes,
        });
        const stub = playbackFetch(dir);
        try {
            const r = await (globalThis.fetch as any)('http://host:8188/view?filename=x');
            assert.ok(Buffer.isBuffer(r.body));
            assert.strictEqual((r.body as Buffer)[0], 0x89);
            assert.strictEqual(r.headers['content-type'], 'image/png');
        } finally {
            stub.restore();
        }
    });

    it('throws descriptively when the sequence is exhausted', async () => {
        const dir = makeTempDir('codecomfy-pb-');
        writeFixture(dir, {
            'index.json': JSON.stringify({ sequence: [] }),
        });
        const stub = playbackFetch(dir);
        try {
            await assert.rejects(
                () => (globalThis.fetch as any)('http://host:8188/anything'),
                /exhausted/,
            );
        } finally {
            stub.restore();
        }
    });

    it('throws on URL pattern mismatch', async () => {
        const dir = makeTempDir('codecomfy-pb-');
        writeFixture(dir, {
            'index.json': JSON.stringify({
                sequence: [
                    {
                        method: 'POST',
                        urlPattern: '*/prompt',
                        status: 200,
                        body: {},
                        bodyKind: 'json',
                    },
                ],
            }),
        });
        const stub = playbackFetch(dir);
        try {
            await assert.rejects(
                () =>
                    (globalThis.fetch as any)('http://host:8188/history/abc', {
                        method: 'GET',
                    }),
                /expected POST/,
            );
        } finally {
            stub.restore();
        }
    });

    it('throws on method mismatch', async () => {
        const dir = makeTempDir('codecomfy-pb-');
        writeFixture(dir, {
            'index.json': JSON.stringify({
                sequence: [
                    { method: 'GET', urlPattern: '*/x', status: 200, body: {}, bodyKind: 'json' },
                ],
            }),
        });
        const stub = playbackFetch(dir);
        try {
            await assert.rejects(
                () => (globalThis.fetch as any)('http://host/x', { method: 'POST' }),
                /expected GET/,
            );
        } finally {
            stub.restore();
        }
    });

    it('throws descriptively when index.json is missing', () => {
        const dir = makeTempDir('codecomfy-pb-');
        assert.throws(() => playbackFetch(dir), /missing index.json/);
    });

    it('throws descriptively when index.json is malformed', () => {
        const dir = makeTempDir('codecomfy-pb-');
        writeFixture(dir, { 'index.json': 'NOT JSON {{{' });
        assert.throws(() => playbackFetch(dir), /failed to parse/);
    });

    it('restore() is idempotent', () => {
        const dir = makeTempDir('codecomfy-pb-');
        writeFixture(dir, { 'index.json': JSON.stringify({ sequence: [] }) });
        const stub = playbackFetch(dir);
        stub.restore();
        stub.restore(); // no throw
        assert.ok(true);
    });
});
