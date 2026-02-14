/**
 * Smoke test — verifies the test harness itself works.
 */

import * as assert from 'node:assert/strict';

describe('Test harness', () => {
    it('runs a basic assertion', () => {
        assert.strictEqual(1 + 1, 2);
    });

    it('handles async tests', async () => {
        const result = await Promise.resolve('ok');
        assert.strictEqual(result, 'ok');
    });
});
