/**
 * Input validation helpers for generation parameters.
 *
 * Every public function returns a `{ valid, value?, error? }` result so that
 * callers can show an actionable message before dispatching to the engine.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Inclusive upper bound for seed values (2^31 - 1, the signed int32 max). */
export const SEED_MAX = 2_147_483_647;

/** Maximum prompt length in characters. */
export const PROMPT_MAX_LENGTH = 8_000;

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

export interface SeedResult {
    valid: boolean;
    /** Parsed seed, or `undefined` when the user left the field empty (= random). */
    value?: number;
    error?: string;
}

/**
 * Parse and validate a seed string from an input box.
 *
 * Allowed values:
 *   - Empty / `undefined` → random (returns `{ valid: true, value: undefined }`)
 *   - Positive integer 0 … 2 147 483 647
 *
 * Rejects: NaN, negative, fractional, or out-of-range values.
 */
export function parseSeed(raw: string | undefined): SeedResult {
    if (raw === undefined || raw.trim() === '') {
        return { valid: true, value: undefined };
    }

    const trimmed = raw.trim();
    const parsed = Number(trimmed);

    if (!Number.isFinite(parsed) || Number.isNaN(parsed)) {
        return {
            valid: false,
            error: `"${trimmed}" is not a valid number. Enter a whole number between 0 and ${SEED_MAX}, or leave empty for random.`,
        };
    }

    if (!Number.isInteger(parsed)) {
        return {
            valid: false,
            error: `Seed must be a whole number (got ${trimmed}). Enter a value between 0 and ${SEED_MAX}.`,
        };
    }

    if (parsed < 0 || parsed > SEED_MAX) {
        return {
            valid: false,
            error: `Seed out of range (got ${trimmed}). Must be between 0 and ${SEED_MAX}.`,
        };
    }

    return { valid: true, value: parsed };
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

export interface PromptResult {
    valid: boolean;
    /** Trimmed prompt string. */
    value?: string;
    error?: string;
}

/**
 * Validate a prompt string.
 *
 * Rules:
 *   - Must not be empty after trimming.
 *   - Must not exceed `PROMPT_MAX_LENGTH` characters.
 */
export function validatePrompt(raw: string | undefined): PromptResult {
    if (raw === undefined || raw.trim() === '') {
        return { valid: false, error: 'Prompt cannot be empty.' };
    }

    const trimmed = raw.trim();

    if (trimmed.length > PROMPT_MAX_LENGTH) {
        return {
            valid: false,
            error: `Prompt is too long (${trimmed.length} chars). Maximum is ${PROMPT_MAX_LENGTH} characters.`,
        };
    }

    return { valid: true, value: trimmed };
}
