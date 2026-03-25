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
});
