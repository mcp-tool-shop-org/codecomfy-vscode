/**
 * Tests for the structured logging module.
 */

import * as assert from 'node:assert/strict';
import { Logger, createNullLogger, createChannelLogger } from '../../src/logging/logger';

describe('Logger', () => {
    it('formats info lines with timestamp and component', () => {
        const lines: string[] = [];
        const log = new Logger({ component: 'Test', sink: (l) => lines.push(l) });

        log.info('hello world');

        assert.strictEqual(lines.length, 1);
        assert.match(lines[0], /^\[\d{4}-\d{2}-\d{2}T/); // ISO timestamp
        assert.match(lines[0], /INFO/);
        assert.match(lines[0], /\[Test\]/);
        assert.match(lines[0], /hello world/);
    });

    it('formats warn lines', () => {
        const lines: string[] = [];
        const log = new Logger({ component: 'W', sink: (l) => lines.push(l) });

        log.warn('be careful');

        assert.match(lines[0], /WARN/);
        assert.match(lines[0], /be careful/);
    });

    it('formats error lines', () => {
        const lines: string[] = [];
        const log = new Logger({ component: 'E', sink: (l) => lines.push(l) });

        log.error('oh no');

        assert.match(lines[0], /ERROR/);
        assert.match(lines[0], /oh no/);
    });

    it('includes detail on a new indented line', () => {
        const lines: string[] = [];
        const log = new Logger({ component: 'D', sink: (l) => lines.push(l) });

        log.info('summary', 'extra detail here');

        assert.strictEqual(lines.length, 1);
        assert.ok(lines[0].includes('summary'));
        assert.ok(lines[0].includes('\n  extra detail here'));
    });

    it('omits detail line when detail is undefined', () => {
        const lines: string[] = [];
        const log = new Logger({ component: 'D', sink: (l) => lines.push(l) });

        log.info('no detail');

        assert.ok(!lines[0].includes('\n'));
    });

    it('child logger prefixes component with /', () => {
        const lines: string[] = [];
        const parent = new Logger({ component: 'Engine', sink: (l) => lines.push(l) });
        const child = parent.child('poll');

        child.info('checking');

        assert.match(lines[0], /\[Engine\/poll\]/);
    });

    it('child of child works', () => {
        const lines: string[] = [];
        const root = new Logger({ component: 'A', sink: (l) => lines.push(l) });
        const leaf = root.child('B').child('C');

        leaf.warn('deep');

        assert.match(lines[0], /\[A\/B\/C\]/);
    });
});

describe('createNullLogger', () => {
    it('does not throw on any level', () => {
        const log = createNullLogger();
        assert.doesNotThrow(() => log.info('ignored'));
        assert.doesNotThrow(() => log.warn('ignored'));
        assert.doesNotThrow(() => log.error('ignored'));
    });
});

describe('createChannelLogger', () => {
    it('writes to channel.appendLine', () => {
        const lines: string[] = [];
        const fakeChannel = { appendLine: (v: string) => lines.push(v) };
        const log = createChannelLogger('Chan', fakeChannel);

        log.info('channeled');

        assert.strictEqual(lines.length, 1);
        assert.match(lines[0], /\[Chan\]/);
        assert.match(lines[0], /channeled/);
    });
});
