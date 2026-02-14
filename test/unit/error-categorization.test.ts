/**
 * Tests for error categorisation in ComfyServerEngine.
 */

import * as assert from 'node:assert/strict';
import { categorizeError } from '../../src/engines/comfyServerEngine';

describe('categorizeError', () => {
    it('categorises ECONNREFUSED as Network', () => {
        const result = categorizeError(new Error('connect ECONNREFUSED 127.0.0.1:8188'));
        assert.match(result, /^\[Network\]/);
        assert.ok(result.includes('Check that ComfyUI is running'));
    });

    it('categorises ECONNRESET as Network', () => {
        const result = categorizeError(new Error('ECONNRESET'));
        assert.match(result, /^\[Network\]/);
    });

    it('categorises ETIMEDOUT as Network', () => {
        const result = categorizeError(new Error('ETIMEDOUT'));
        assert.match(result, /^\[Network\]/);
    });

    it('categorises fetch failed as Network', () => {
        const result = categorizeError(new TypeError('fetch failed'));
        assert.match(result, /^\[Network\]/);
    });

    it('categorises HTTP errors as Server', () => {
        const result = categorizeError(new Error('ComfyUI error (HTTP 500): Internal Server Error'));
        assert.match(result, /^\[Server\]/);
        assert.ok(result.includes('ComfyUI console'));
    });

    it('categorises response shape errors as API', () => {
        const result = categorizeError(new Error('ComfyUI history response invalid: Missing "status"'));
        assert.match(result, /^\[API\]/);
        assert.ok(result.includes('incompatible version'));
    });

    it('categorises ENOENT as IO', () => {
        const result = categorizeError(new Error("ENOENT: no such file or directory, open '/tmp/foo'"));
        assert.match(result, /^\[IO\]/);
        assert.ok(result.includes('disk space'));
    });

    it('categorises ENOSPC as IO', () => {
        const result = categorizeError(new Error('ENOSPC: no space left on device'));
        assert.match(result, /^\[IO\]/);
    });

    it('categorises EACCES as IO', () => {
        const result = categorizeError(new Error('EACCES: permission denied'));
        assert.match(result, /^\[IO\]/);
    });

    it('passes through uncategorised errors as-is', () => {
        const result = categorizeError(new Error('something unexpected'));
        assert.strictEqual(result, 'something unexpected');
    });

    it('handles non-Error values', () => {
        const result = categorizeError('plain string error');
        assert.strictEqual(result, 'plain string error');
    });

    it('handles null', () => {
        const result = categorizeError(null);
        assert.strictEqual(result, 'null');
    });
});
