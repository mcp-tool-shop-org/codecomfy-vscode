/**
 * Tests for src/validation/url.ts — ComfyUI URL validation.
 *
 * ── Security model (documented from reading src/validation/url.ts) ───────
 *
 * `validateComfyUrl` enforces two things only:
 *   1. The string must parse as a URL.
 *   2. The protocol must be `http:` or `https:`.
 *
 * It does NOT restrict the host. Any routable or private IP, any public
 * hostname, and any path are all accepted so long as the protocol passes.
 *
 * This is permissive by design — the extension is user-run locally, and
 * power users point it at self-hosted ComfyUI over HTTPS. However, it
 * means the configured URL is effectively trusted user input that the
 * engine will attempt to reach. A malicious workspace setting could
 * therefore coerce the extension into issuing HTTP(S) requests against
 * arbitrary third-party hosts (mild SSRF via user-controlled config).
 *
 * FIXME (tracked): consider an optional allowlist (loopback / private
 * ranges only) for hardened deployments. For now, the tests below pin
 * the CURRENT permissive behaviour so any future tightening shows up as
 * a deliberate failure rather than a silent behaviour change.
 */

import { describe, it } from 'mocha';
import { strict as assert } from 'node:assert';
import { validateComfyUrl } from '../../src/validation/url';

describe('validateComfyUrl', () => {
    // --- Valid URLs ---

    it('accepts http://127.0.0.1:8188', () => {
        const r = validateComfyUrl('http://127.0.0.1:8188');
        assert.ok(r.valid);
        assert.equal(r.value, 'http://127.0.0.1:8188');
    });

    it('accepts https://comfy.example.com', () => {
        const r = validateComfyUrl('https://comfy.example.com');
        assert.ok(r.valid);
        assert.equal(r.value, 'https://comfy.example.com');
    });

    it('accepts http://localhost:8188', () => {
        const r = validateComfyUrl('http://localhost:8188');
        assert.ok(r.valid);
        assert.equal(r.value, 'http://localhost:8188');
    });

    it('strips trailing slash', () => {
        const r = validateComfyUrl('http://127.0.0.1:8188/');
        assert.ok(r.valid);
        assert.equal(r.value, 'http://127.0.0.1:8188');
    });

    it('strips multiple trailing slashes', () => {
        const r = validateComfyUrl('http://127.0.0.1:8188///');
        assert.ok(r.valid);
        assert.equal(r.value, 'http://127.0.0.1:8188');
    });

    it('accepts URL with path', () => {
        const r = validateComfyUrl('http://127.0.0.1:8188/api');
        assert.ok(r.valid);
        assert.equal(r.value, 'http://127.0.0.1:8188/api');
    });

    it('trims whitespace', () => {
        const r = validateComfyUrl('  http://127.0.0.1:8188  ');
        assert.ok(r.valid);
        assert.equal(r.value, 'http://127.0.0.1:8188');
    });

    // --- Invalid URLs ---

    it('rejects empty string', () => {
        const r = validateComfyUrl('');
        assert.ok(!r.valid);
        assert.ok(r.error!.includes('cannot be empty'));
    });

    it('rejects undefined', () => {
        const r = validateComfyUrl(undefined);
        assert.ok(!r.valid);
        assert.ok(r.error!.includes('cannot be empty'));
    });

    it('rejects non-URL string', () => {
        const r = validateComfyUrl('not-a-url');
        assert.ok(!r.valid);
        assert.ok(r.error!.includes('not a valid URL'));
    });

    it('rejects file:// protocol', () => {
        const r = validateComfyUrl('file:///etc/passwd');
        assert.ok(!r.valid);
        assert.ok(r.error!.includes('Unsupported protocol'));
    });

    it('rejects ftp:// protocol', () => {
        const r = validateComfyUrl('ftp://server.com');
        assert.ok(!r.valid);
        assert.ok(r.error!.includes('Unsupported protocol'));
    });

    // --- Protocol rejection (SSRF-related, F-863253-024) ---
    //
    // These tests pin the full list of protocols currently rejected by the
    // validator. `javascript:` and `data:` URLs cannot reach the engine
    // anyway (no network fetch), but we block them here to give a clear
    // user-facing error instead of a cryptic failure later.

    it('rejects data: URLs', () => {
        const r = validateComfyUrl('data:text/plain,hello');
        assert.ok(!r.valid);
        assert.ok(r.error!.includes('Unsupported protocol'));
    });

    it('rejects javascript: URLs', () => {
        const r = validateComfyUrl('javascript:alert(1)');
        assert.ok(!r.valid);
        assert.ok(r.error!.includes('Unsupported protocol'));
    });

    it('rejects gopher: URLs', () => {
        const r = validateComfyUrl('gopher://evil.example/9/payload');
        assert.ok(!r.valid);
        assert.ok(r.error!.includes('Unsupported protocol'));
    });

    it('rejects ws:// URLs (WebSocket)', () => {
        const r = validateComfyUrl('ws://127.0.0.1:8188/ws');
        assert.ok(!r.valid);
        assert.ok(r.error!.includes('Unsupported protocol'));
    });

    // --- SSRF surface — CURRENT permissive behaviour ---
    //
    // Documents that any routable host is accepted. These tests EXIST to
    // pin the current contract; if the validator is ever hardened to
    // reject non-local hosts, these tests should be updated (not deleted).

    describe('SSRF surface — permissive-host behaviour (pinned)', () => {
        it('accepts a public hostname over HTTPS', () => {
            const r = validateComfyUrl('https://evil.example.com:8188');
            assert.ok(r.valid, 'public host currently accepted — see security model note');
            assert.equal(r.value, 'https://evil.example.com:8188');
        });

        it('accepts a private RFC1918 IP (10.0.0.0/8)', () => {
            const r = validateComfyUrl('http://10.0.0.5:8188');
            assert.ok(r.valid);
        });

        it('accepts a link-local IP (169.254.169.254 — cloud metadata endpoint)', () => {
            // Classic SSRF target — AWS/GCP metadata service.
            // Currently allowed; documenting for future hardening.
            const r = validateComfyUrl('http://169.254.169.254/latest/meta-data/');
            assert.ok(r.valid, 'metadata endpoint currently accepted — SSRF surface');
        });

        it('accepts IPv6 loopback', () => {
            const r = validateComfyUrl('http://[::1]:8188');
            assert.ok(r.valid);
        });
    });
});
