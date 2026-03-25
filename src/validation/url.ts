/**
 * URL validation for ComfyUI server address.
 *
 * Ensures the configured URL is a valid HTTP(S) endpoint before
 * the engine attempts a connection. Invalid URLs produce a clear
 * user-facing message instead of a cryptic network error.
 */

export interface UrlResult {
    valid: boolean;
    /** Normalized URL (trailing slash removed). */
    value?: string;
    error?: string;
}

/**
 * Validate a ComfyUI server URL.
 *
 * Rules:
 *   - Must parse as a valid URL.
 *   - Protocol must be `http:` or `https:`.
 *   - Must include a hostname.
 *   - Trailing slash is stripped for consistency.
 */
export function validateComfyUrl(raw: string | undefined): UrlResult {
    if (raw === undefined || raw.trim() === '') {
        return { valid: false, error: 'ComfyUI URL cannot be empty.' };
    }

    const trimmed = raw.trim();
    let parsed: URL;

    try {
        parsed = new URL(trimmed);
    } catch {
        return {
            valid: false,
            error: `"${trimmed}" is not a valid URL. Expected format: http://127.0.0.1:8188`,
        };
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return {
            valid: false,
            error: `Unsupported protocol "${parsed.protocol}" — only http: and https: are allowed.`,
        };
    }

    if (!parsed.hostname) {
        return {
            valid: false,
            error: `URL is missing a hostname. Expected format: http://127.0.0.1:8188`,
        };
    }

    // Normalize: remove trailing slash
    const normalized = trimmed.replace(/\/+$/, '');

    return { valid: true, value: normalized };
}
