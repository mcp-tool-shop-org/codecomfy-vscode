/**
 * Exponential backoff with jitter for polling.
 *
 * Produces a sequence of delay values that grow exponentially up to a ceiling,
 * with random jitter to prevent thundering-herd synchronisation.
 *
 * The module exposes a pure `nextDelay` calculator and a stateful `BackoffTimer`
 * helper that tracks consecutive failures and can be reset on progress.
 */

// ── Defaults ──────────────────────────────────────────────────────────────────

/** Initial delay in ms before the first retry. */
export const DEFAULT_BASE_MS = 1_000;

/** Growth factor per consecutive attempt. */
export const DEFAULT_MULTIPLIER = 1.5;

/** Hard ceiling so delays never exceed this value. */
export const DEFAULT_MAX_DELAY_MS = 8_000;

/** Jitter fraction: ±20 % of the computed delay. */
export const DEFAULT_JITTER = 0.2;

// ── Pure function ─────────────────────────────────────────────────────────────

export interface BackoffOptions {
    /** Starting delay in ms (default 1 000). */
    baseMs?: number;
    /** Exponential multiplier (default 1.5). */
    multiplier?: number;
    /** Maximum delay in ms (default 8 000). */
    maxDelayMs?: number;
    /** Jitter fraction 0–1 (default 0.2 = ±20 %). */
    jitter?: number;
}

/**
 * Compute the delay for the *n*-th retry attempt (0-indexed).
 *
 * Formula (before jitter): `min(base × multiplier ^ attempt, maxDelay)`
 * Jitter is applied symmetrically: `delay × (1 ± jitter × random)`.
 *
 * @param attempt  0-based retry counter (0 = first wait after the initial call).
 * @param opts     Tuning knobs (all optional — sensible defaults provided).
 * @param random   A value in [0, 1) used for jitter; pass explicitly in tests.
 */
export function nextDelay(
    attempt: number,
    opts: BackoffOptions = {},
    random: number = Math.random(),
): number {
    const base = opts.baseMs ?? DEFAULT_BASE_MS;
    const multiplier = opts.multiplier ?? DEFAULT_MULTIPLIER;
    const maxDelay = opts.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
    const jitter = opts.jitter ?? DEFAULT_JITTER;

    // Core exponential ramp, clamped to ceiling
    const raw = Math.min(base * Math.pow(multiplier, attempt), maxDelay);

    // Symmetric jitter: offset ∈ [-jitter, +jitter]
    const offset = jitter * (2 * random - 1);

    return Math.max(0, Math.round(raw * (1 + offset)));
}

// ── Stateful helper ───────────────────────────────────────────────────────────

/**
 * Convenience wrapper that tracks attempt count and exposes `reset()`.
 */
export class BackoffTimer {
    private attempt = 0;
    private opts: BackoffOptions;

    constructor(opts: BackoffOptions = {}) {
        this.opts = opts;
    }

    /** Get the next delay and advance the internal counter. */
    next(): number {
        return nextDelay(this.attempt++, this.opts);
    }

    /** Reset after a successful progress event (so the next poll is fast). */
    reset(): void {
        this.attempt = 0;
    }

    /** Current attempt index (read-only). */
    get currentAttempt(): number {
        return this.attempt;
    }
}
