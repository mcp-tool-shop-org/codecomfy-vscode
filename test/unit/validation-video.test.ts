/**
 * Unit tests for src/validation/video.ts
 *
 * Covers validateVideoLimits() — pure function, no I/O.
 */

import * as assert from 'node:assert/strict';
import {
    validateVideoLimits,
    MAX_DURATION_SECONDS,
    MIN_DURATION_SECONDS,
    MAX_FPS,
    MIN_FPS,
    MAX_FRAME_COUNT,
} from '../../src/validation/video';

describe('validateVideoLimits', () => {
    // =========================================================================
    // Valid cases
    // =========================================================================

    it('accepts typical values (4s @ 24fps = 96 frames)', () => {
        const r = validateVideoLimits(4, 24);
        assert.strictEqual(r.valid, true);
    });

    it('accepts minimum duration + minimum fps', () => {
        const r = validateVideoLimits(MIN_DURATION_SECONDS, MIN_FPS);
        assert.strictEqual(r.valid, true);
    });

    it('accepts maximum duration + low fps (within frame cap)', () => {
        // 15s × 30fps = 450 frames = exactly the cap
        const r = validateVideoLimits(MAX_DURATION_SECONDS, 30);
        assert.strictEqual(r.valid, true);
    });

    it('accepts max fps with short duration (within frame cap)', () => {
        // 7s × 60fps = 420 frames (under 450)
        const r = validateVideoLimits(7, MAX_FPS);
        assert.strictEqual(r.valid, true);
    });

    it('accepts exactly MAX_FRAME_COUNT', () => {
        // 15s × 30fps = 450 frames exactly
        const r = validateVideoLimits(15, 30);
        assert.strictEqual(r.valid, true);
        // Double-check the math
        assert.strictEqual(Math.ceil(15 * 30), MAX_FRAME_COUNT);
    });

    // =========================================================================
    // Duration rejections
    // =========================================================================

    it('rejects duration below minimum', () => {
        const r = validateVideoLimits(0, 24);
        assert.strictEqual(r.valid, false);
        assert.ok(r.error);
        assert.ok(r.error.includes('at least'));
    });

    it('rejects negative duration', () => {
        const r = validateVideoLimits(-5, 24);
        assert.strictEqual(r.valid, false);
    });

    it('rejects duration above maximum', () => {
        const r = validateVideoLimits(MAX_DURATION_SECONDS + 1, 24);
        assert.strictEqual(r.valid, false);
        assert.ok(r.error);
        assert.ok(r.error.includes('limit'));
    });

    it('rejects NaN duration', () => {
        const r = validateVideoLimits(NaN, 24);
        assert.strictEqual(r.valid, false);
    });

    it('rejects Infinity duration', () => {
        const r = validateVideoLimits(Infinity, 24);
        assert.strictEqual(r.valid, false);
    });

    // =========================================================================
    // FPS rejections
    // =========================================================================

    it('rejects fps below minimum', () => {
        const r = validateVideoLimits(4, 0);
        assert.strictEqual(r.valid, false);
        assert.ok(r.error);
        assert.ok(r.error.includes('FPS'));
    });

    it('rejects negative fps', () => {
        const r = validateVideoLimits(4, -10);
        assert.strictEqual(r.valid, false);
    });

    it('rejects fps above maximum', () => {
        const r = validateVideoLimits(4, MAX_FPS + 1);
        assert.strictEqual(r.valid, false);
        assert.ok(r.error);
        assert.ok(r.error.includes('limit'));
    });

    it('rejects NaN fps', () => {
        const r = validateVideoLimits(4, NaN);
        assert.strictEqual(r.valid, false);
    });

    // =========================================================================
    // Frame count rejections
    // =========================================================================

    it('rejects when total frames exceed MAX_FRAME_COUNT', () => {
        // 15s × 31fps = 465 frames > 450
        const r = validateVideoLimits(15, 31);
        assert.strictEqual(r.valid, false);
        assert.ok(r.error);
        assert.ok(r.error.includes('frame'));
    });

    it('rejects max duration × max fps (would exceed frame cap)', () => {
        // 15s × 60fps = 900 frames >> 450
        const r = validateVideoLimits(MAX_DURATION_SECONDS, MAX_FPS);
        assert.strictEqual(r.valid, false);
        assert.ok(r.error);
        assert.ok(r.error.includes('frame'));
    });

    // =========================================================================
    // Edge: exactly at boundary values
    // =========================================================================

    it('accepts exact MIN_DURATION_SECONDS boundary', () => {
        const r = validateVideoLimits(MIN_DURATION_SECONDS, 24);
        assert.strictEqual(r.valid, true);
    });

    it('accepts exact MAX_DURATION_SECONDS boundary', () => {
        // Need fps low enough that total frames stay ≤ 450
        const r = validateVideoLimits(MAX_DURATION_SECONDS, 30);
        assert.strictEqual(r.valid, true);
    });

    it('accepts exact MIN_FPS boundary', () => {
        const r = validateVideoLimits(4, MIN_FPS);
        assert.strictEqual(r.valid, true);
    });

    it('accepts exact MAX_FPS boundary with short duration', () => {
        // 7s × 60fps = 420 ≤ 450
        const r = validateVideoLimits(7, MAX_FPS);
        assert.strictEqual(r.valid, true);
    });
});
