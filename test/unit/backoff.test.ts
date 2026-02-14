/**
 * Tests for the exponential backoff + jitter module.
 */

import * as assert from 'node:assert/strict';
import {
    nextDelay,
    BackoffTimer,
    DEFAULT_BASE_MS,
    DEFAULT_MULTIPLIER,
    DEFAULT_MAX_DELAY_MS,
} from '../../src/polling/backoff';

describe('nextDelay (pure function)', () => {
    it('returns baseMs on attempt 0 with zero jitter', () => {
        const delay = nextDelay(0, { jitter: 0 }, 0.5);
        assert.strictEqual(delay, DEFAULT_BASE_MS);
    });

    it('grows exponentially with the multiplier', () => {
        const d0 = nextDelay(0, { jitter: 0 }, 0.5);
        const d1 = nextDelay(1, { jitter: 0 }, 0.5);
        const d2 = nextDelay(2, { jitter: 0 }, 0.5);

        assert.strictEqual(d0, 1000);
        assert.strictEqual(d1, Math.round(1000 * DEFAULT_MULTIPLIER));
        assert.strictEqual(d2, Math.round(1000 * DEFAULT_MULTIPLIER ** 2));
    });

    it('caps at maxDelayMs', () => {
        const delay = nextDelay(100, { jitter: 0 }, 0.5);
        assert.strictEqual(delay, DEFAULT_MAX_DELAY_MS);
    });

    it('respects custom maxDelayMs', () => {
        const delay = nextDelay(100, { maxDelayMs: 5000, jitter: 0 }, 0.5);
        assert.strictEqual(delay, 5000);
    });

    it('applies positive jitter when random > 0.5', () => {
        const noJitter = nextDelay(0, { jitter: 0 }, 0.5);
        const withJitter = nextDelay(0, { jitter: 0.2 }, 1.0); // max positive jitter
        assert.ok(withJitter > noJitter, `${withJitter} should be > ${noJitter}`);
        // 1000 * (1 + 0.2 * (2*1.0 - 1)) = 1000 * 1.2 = 1200
        assert.strictEqual(withJitter, 1200);
    });

    it('applies negative jitter when random < 0.5', () => {
        const noJitter = nextDelay(0, { jitter: 0 }, 0.5);
        const withJitter = nextDelay(0, { jitter: 0.2 }, 0.0); // max negative jitter
        assert.ok(withJitter < noJitter, `${withJitter} should be < ${noJitter}`);
        // 1000 * (1 + 0.2 * (2*0.0 - 1)) = 1000 * 0.8 = 800
        assert.strictEqual(withJitter, 800);
    });

    it('returns zero jitter when random is 0.5', () => {
        const delay = nextDelay(0, { jitter: 0.2 }, 0.5);
        assert.strictEqual(delay, 1000);
    });

    it('never returns negative values', () => {
        // Even with very large jitter fraction the result should clamp to 0
        const delay = nextDelay(0, { jitter: 2.0 }, 0.0); // 1000 * (1 + 2*(-1)) = -1000 → 0
        assert.ok(delay >= 0, `Delay should never be negative, got ${delay}`);
        assert.strictEqual(delay, 0);
    });

    it('uses custom baseMs and multiplier', () => {
        const delay = nextDelay(2, { baseMs: 500, multiplier: 2, jitter: 0 }, 0.5);
        // 500 * 2^2 = 2000
        assert.strictEqual(delay, 2000);
    });

    it('produces a plausible sequence with defaults', () => {
        // With random fixed to 0.5 (zero jitter effect), sequence should be:
        // 1000, 1500, 2250, 3375, 5063, 7594, 8000, 8000, ...
        const seq = Array.from({ length: 8 }, (_, i) => nextDelay(i, { jitter: 0 }, 0.5));
        assert.strictEqual(seq[0], 1000);
        assert.strictEqual(seq[1], 1500);
        assert.strictEqual(seq[2], 2250);
        assert.strictEqual(seq[6], DEFAULT_MAX_DELAY_MS);
        assert.strictEqual(seq[7], DEFAULT_MAX_DELAY_MS);

        // Monotonically non-decreasing
        for (let i = 1; i < seq.length; i++) {
            assert.ok(seq[i] >= seq[i - 1], `seq[${i}]=${seq[i]} should >= seq[${i - 1}]=${seq[i - 1]}`);
        }
    });
});

describe('BackoffTimer (stateful wrapper)', () => {
    it('starts at attempt 0', () => {
        const timer = new BackoffTimer({ jitter: 0 });
        assert.strictEqual(timer.currentAttempt, 0);
    });

    it('advances attempt on each next() call', () => {
        const timer = new BackoffTimer({ jitter: 0 });
        timer.next();
        assert.strictEqual(timer.currentAttempt, 1);
        timer.next();
        assert.strictEqual(timer.currentAttempt, 2);
    });

    it('returns increasing delays', () => {
        const timer = new BackoffTimer({ jitter: 0 });
        const d0 = timer.next();
        const d1 = timer.next();
        const d2 = timer.next();
        assert.ok(d0 <= d1, `${d0} should be <= ${d1}`);
        assert.ok(d1 <= d2, `${d1} should be <= ${d2}`);
    });

    it('resets attempt counter to 0', () => {
        const timer = new BackoffTimer({ jitter: 0 });
        timer.next();
        timer.next();
        timer.next();
        assert.strictEqual(timer.currentAttempt, 3);

        timer.reset();
        assert.strictEqual(timer.currentAttempt, 0);
    });

    it('produces short delay again after reset', () => {
        const timer = new BackoffTimer({ jitter: 0 });
        // Advance several times
        for (let i = 0; i < 10; i++) timer.next();
        const delayBeforeReset = timer.next(); // should be capped at max

        timer.reset();
        const delayAfterReset = timer.next(); // should be base again

        assert.ok(
            delayAfterReset < delayBeforeReset,
            `After reset: ${delayAfterReset} should be < ${delayBeforeReset}`,
        );
        assert.strictEqual(delayAfterReset, DEFAULT_BASE_MS);
    });
});
