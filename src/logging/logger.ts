/**
 * Structured logging for CodeComfy.
 *
 * Provides a lightweight, channel-agnostic logger with three levels:
 * `info`, `warn`, and `error`. Each message is prefixed with a
 * timestamp and the source component.
 *
 * The default sink writes to a VS Code OutputChannel, but tests can
 * provide any function that accepts a string to keep things headless.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type LogLevel = 'info' | 'warn' | 'error';

/** Anything that accepts a formatted log line. */
export type LogSink = (line: string) => void;

export interface LoggerOptions {
    /** Component tag shown in brackets, e.g. "JobRouter". */
    component: string;
    /** Where to write formatted lines. */
    sink: LogSink;
}

// ── Logger class ──────────────────────────────────────────────────────────────

export class Logger {
    private component: string;
    private sink: LogSink;

    constructor(opts: LoggerOptions) {
        this.component = opts.component;
        this.sink = opts.sink;
    }

    info(message: string, detail?: string): void {
        this.write('info', message, detail);
    }

    warn(message: string, detail?: string): void {
        this.write('warn', message, detail);
    }

    error(message: string, detail?: string): void {
        this.write('error', message, detail);
    }

    /** Create a child logger with a sub-component tag (e.g. "Engine/poll"). */
    child(subComponent: string): Logger {
        return new Logger({
            component: `${this.component}/${subComponent}`,
            sink: this.sink,
        });
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    private write(level: LogLevel, message: string, detail?: string): void {
        const ts = new Date().toISOString();
        const tag = level.toUpperCase().padEnd(5); // INFO , WARN , ERROR
        let line = `[${ts}] ${tag} [${this.component}] ${message}`;
        if (detail) {
            line += `\n  ${detail}`;
        }
        this.sink(line);
    }
}

// ── Convenience factory ───────────────────────────────────────────────────────

/**
 * Create a Logger that writes to a VS Code `OutputChannel.appendLine`.
 *
 * Usage in `extension.ts`:
 * ```ts
 * const log = createChannelLogger('JobRouter', outputChannel);
 * ```
 */
export function createChannelLogger(
    component: string,
    channel: { appendLine(value: string): void },
): Logger {
    return new Logger({
        component,
        sink: (line) => channel.appendLine(line),
    });
}

// ── Null logger (silent, for tests) ───────────────────────────────────────────

const NOOP: LogSink = () => {};

export function createNullLogger(component = 'test'): Logger {
    return new Logger({ component, sink: NOOP });
}
