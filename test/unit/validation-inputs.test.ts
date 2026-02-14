/**
 * Unit tests for src/validation/inputs.ts
 *
 * Covers parseSeed() and validatePrompt() — pure functions, no I/O.
 */

import * as assert from 'node:assert/strict';
import { parseSeed, validatePrompt, SEED_MAX, PROMPT_MAX_LENGTH } from '../../src/validation/inputs';

// =============================================================================
// parseSeed
// =============================================================================

describe('parseSeed', () => {
    // --- Valid cases ---

    it('returns undefined value for undefined input (random)', () => {
        const r = parseSeed(undefined);
        assert.strictEqual(r.valid, true);
        assert.strictEqual(r.value, undefined);
    });

    it('returns undefined value for empty string (random)', () => {
        const r = parseSeed('');
        assert.strictEqual(r.valid, true);
        assert.strictEqual(r.value, undefined);
    });

    it('returns undefined value for whitespace-only string', () => {
        const r = parseSeed('   ');
        assert.strictEqual(r.valid, true);
        assert.strictEqual(r.value, undefined);
    });

    it('accepts 0', () => {
        const r = parseSeed('0');
        assert.strictEqual(r.valid, true);
        assert.strictEqual(r.value, 0);
    });

    it('accepts 1', () => {
        const r = parseSeed('1');
        assert.strictEqual(r.valid, true);
        assert.strictEqual(r.value, 1);
    });

    it('accepts a typical seed', () => {
        const r = parseSeed('12345');
        assert.strictEqual(r.valid, true);
        assert.strictEqual(r.value, 12345);
    });

    it('accepts SEED_MAX (2^31-1)', () => {
        const r = parseSeed(String(SEED_MAX));
        assert.strictEqual(r.valid, true);
        assert.strictEqual(r.value, SEED_MAX);
    });

    it('trims surrounding whitespace', () => {
        const r = parseSeed('  42  ');
        assert.strictEqual(r.valid, true);
        assert.strictEqual(r.value, 42);
    });

    // --- Invalid cases ---

    it('rejects NaN (non-numeric text)', () => {
        const r = parseSeed('hello');
        assert.strictEqual(r.valid, false);
        assert.ok(r.error);
        assert.ok(r.error.includes('hello'));
    });

    it('rejects Infinity', () => {
        const r = parseSeed('Infinity');
        assert.strictEqual(r.valid, false);
        assert.ok(r.error);
    });

    it('rejects fractional numbers', () => {
        const r = parseSeed('3.14');
        assert.strictEqual(r.valid, false);
        assert.ok(r.error);
        assert.ok(r.error.includes('whole number'));
    });

    it('rejects negative numbers', () => {
        const r = parseSeed('-1');
        assert.strictEqual(r.valid, false);
        assert.ok(r.error);
        assert.ok(r.error.includes('range'));
    });

    it('rejects values above SEED_MAX', () => {
        const r = parseSeed(String(SEED_MAX + 1));
        assert.strictEqual(r.valid, false);
        assert.ok(r.error);
        assert.ok(r.error.includes('range'));
    });

    it('rejects very large numbers', () => {
        const r = parseSeed('99999999999999');
        assert.strictEqual(r.valid, false);
    });
});

// =============================================================================
// validatePrompt
// =============================================================================

describe('validatePrompt', () => {
    // --- Valid cases ---

    it('accepts a simple prompt', () => {
        const r = validatePrompt('A beautiful sunset');
        assert.strictEqual(r.valid, true);
        assert.strictEqual(r.value, 'A beautiful sunset');
    });

    it('trims whitespace from a valid prompt', () => {
        const r = validatePrompt('  hello world  ');
        assert.strictEqual(r.valid, true);
        assert.strictEqual(r.value, 'hello world');
    });

    it('accepts a prompt at exactly the max length', () => {
        const prompt = 'x'.repeat(PROMPT_MAX_LENGTH);
        const r = validatePrompt(prompt);
        assert.strictEqual(r.valid, true);
        assert.strictEqual(r.value, prompt);
    });

    // --- Invalid cases ---

    it('rejects undefined', () => {
        const r = validatePrompt(undefined);
        assert.strictEqual(r.valid, false);
        assert.ok(r.error);
        assert.ok(r.error.includes('empty'));
    });

    it('rejects empty string', () => {
        const r = validatePrompt('');
        assert.strictEqual(r.valid, false);
        assert.ok(r.error);
    });

    it('rejects whitespace-only string', () => {
        const r = validatePrompt('   \t\n  ');
        assert.strictEqual(r.valid, false);
        assert.ok(r.error);
    });

    it('rejects a prompt exceeding max length', () => {
        const prompt = 'x'.repeat(PROMPT_MAX_LENGTH + 1);
        const r = validatePrompt(prompt);
        assert.strictEqual(r.valid, false);
        assert.ok(r.error);
        assert.ok(r.error.includes('too long'));
    });

    it('error message includes the actual length', () => {
        const len = PROMPT_MAX_LENGTH + 42;
        const prompt = 'y'.repeat(len);
        const r = validatePrompt(prompt);
        assert.strictEqual(r.valid, false);
        assert.ok(r.error!.includes(String(len)));
    });
});
