/**
 * Video generation limits.
 *
 * Prevents accidental resource bombs (huge frame counts, long durations)
 * that could exhaust disk space, VRAM, or tie up ComfyUI indefinitely.
 */

// ---------------------------------------------------------------------------
// Constants — safe defaults
// ---------------------------------------------------------------------------

/** Maximum video duration in seconds. */
export const MAX_DURATION_SECONDS = 15;

/** Minimum video duration in seconds. */
export const MIN_DURATION_SECONDS = 1;

/** Maximum frames per second. */
export const MAX_FPS = 60;

/** Minimum frames per second. */
export const MIN_FPS = 1;

/** Maximum total frame count (duration × fps). */
export const MAX_FRAME_COUNT = 450;

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface VideoLimitsResult {
    valid: boolean;
    error?: string;
}

/**
 * Validate video generation parameters against hard safety limits.
 *
 * Call this **before** dispatching to the router so the user gets an
 * immediate, actionable error instead of a timeout or OOM deep inside
 * ComfyUI.
 */
export function validateVideoLimits(
    durationSeconds: number,
    fps: number,
): VideoLimitsResult {
    // Duration
    if (!Number.isFinite(durationSeconds) || durationSeconds < MIN_DURATION_SECONDS) {
        return {
            valid: false,
            error: `Video duration must be at least ${MIN_DURATION_SECONDS}s (got ${durationSeconds}s).`,
        };
    }
    if (durationSeconds > MAX_DURATION_SECONDS) {
        return {
            valid: false,
            error: `Video duration exceeds the ${MAX_DURATION_SECONDS}s limit (got ${durationSeconds}s). `
                 + `Reduce the duration to stay within safe resource bounds.`,
        };
    }

    // FPS
    if (!Number.isFinite(fps) || fps < MIN_FPS) {
        return {
            valid: false,
            error: `FPS must be at least ${MIN_FPS} (got ${fps}).`,
        };
    }
    if (fps > MAX_FPS) {
        return {
            valid: false,
            error: `FPS exceeds the ${MAX_FPS} limit (got ${fps}). `
                 + `Reduce the frame rate to stay within safe resource bounds.`,
        };
    }

    // Frame count
    const frameCount = Math.ceil(durationSeconds * fps);
    if (frameCount > MAX_FRAME_COUNT) {
        return {
            valid: false,
            error: `Total frame count (${durationSeconds}s × ${fps}fps = ${frameCount} frames) exceeds `
                 + `the ${MAX_FRAME_COUNT}-frame limit. Reduce duration or FPS.`,
        };
    }

    return { valid: true };
}
