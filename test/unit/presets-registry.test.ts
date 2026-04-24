/**
 * Unit tests for src/presets/registry.ts
 *
 * Tests the PresetRegistry class directly (not the singleton) to ensure
 * bundled presets load correctly, lookups behave, and loadFromDirectory
 * handles edge cases.
 */

import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import * as sinon from 'sinon';
import { PresetRegistry } from '../../src/presets/registry';
import { Logger } from '../../src/logging/logger';
import { makeTempDir as sharedMakeTempDir, cleanupTempPaths } from '../helpers';

// ---------------------------------------------------------------------------
// Helpers — defer to shared helpers for temp-dir management.
// ---------------------------------------------------------------------------

function makeTempDir(): string {
    return sharedMakeTempDir('codecomfy-presets-');
}

function writePresetFile(dir: string, filename: string, content: object): void {
    fs.writeFileSync(path.join(dir, filename), JSON.stringify(content));
}

after(() => {
    const { failed } = cleanupTempPaths();
    if (failed.length > 0) {
        console.warn(`[presets-registry.test] ${failed.length} temp path(s) left behind:`, failed);
    }
});

// =============================================================================
// Bundled presets
// =============================================================================

describe('PresetRegistry — bundled presets', () => {
    let registry: PresetRegistry;

    before(() => {
        registry = new PresetRegistry();
    });

    it('loads hq-image preset', () => {
        const preset = registry.get('hq-image');
        assert.ok(preset, 'hq-image preset should exist');
        assert.strictEqual(preset.id, 'hq-image');
        assert.strictEqual(preset.kind, 'image');
    });

    it('loads hq-video preset', () => {
        const preset = registry.get('hq-video');
        assert.ok(preset, 'hq-video preset should exist');
        assert.strictEqual(preset.id, 'hq-video');
        assert.strictEqual(preset.kind, 'video');
    });

    it('hq-image preset has required defaults', () => {
        const preset = registry.get('hq-image')!;
        assert.ok(preset.defaults.width, 'should have width');
        assert.ok(preset.defaults.height, 'should have height');
        assert.ok(preset.defaults.steps, 'should have steps');
        assert.ok(preset.defaults.cfg_scale !== undefined, 'should have cfg_scale');
    });

    it('hq-video preset has required defaults', () => {
        const preset = registry.get('hq-video')!;
        assert.ok(preset.defaults.width, 'should have width');
        assert.ok(preset.defaults.height, 'should have height');
        assert.ok(preset.defaults.steps, 'should have steps');
        assert.ok(preset.defaults.fps, 'should have fps');
        assert.ok(preset.defaults.duration_seconds, 'should have duration_seconds');
    });

    it('hq-image preset has a workflow', () => {
        const preset = registry.get('hq-image')!;
        assert.ok(preset.workflow, 'should have workflow');
        assert.ok(typeof preset.workflow === 'object', 'workflow should be object');
    });

    it('hq-video preset has a workflow', () => {
        const preset = registry.get('hq-video')!;
        assert.ok(preset.workflow, 'should have workflow');
    });

    it('list() returns both bundled presets', () => {
        const all = registry.list();
        assert.ok(all.length >= 2, 'should have at least 2 presets');
        const ids = all.map(p => p.id);
        assert.ok(ids.includes('hq-image'));
        assert.ok(ids.includes('hq-video'));
    });

    it('listByKind("image") includes hq-image', () => {
        const images = registry.listByKind('image');
        assert.ok(images.some(p => p.id === 'hq-image'));
        // Should not include video presets
        assert.ok(!images.some(p => p.id === 'hq-video'));
    });

    it('listByKind("video") includes hq-video', () => {
        const videos = registry.listByKind('video');
        assert.ok(videos.some(p => p.id === 'hq-video'));
        assert.ok(!videos.some(p => p.id === 'hq-image'));
    });

    it('returns undefined for unknown preset ID', () => {
        const preset = registry.get('nonexistent-preset');
        assert.strictEqual(preset, undefined);
    });
});

// =============================================================================
// loadFromDirectory
// =============================================================================

describe('PresetRegistry — loadFromDirectory', () => {
    it('loads a valid preset from a directory', () => {
        const dir = makeTempDir();
        writePresetFile(dir, 'custom.json', {
            id: 'custom-test',
            name: 'Custom Test',
            kind: 'image',
            defaults: { width: 512, height: 512, steps: 20 },
        });

        const registry = new PresetRegistry();
        registry.loadFromDirectory(dir);

        const preset = registry.get('custom-test');
        assert.ok(preset, 'custom preset should be loaded');
        assert.strictEqual(preset.id, 'custom-test');
        assert.strictEqual(preset.kind, 'image');
        assert.strictEqual(preset.defaults.width, 512);
    });

    it('does nothing for a non-existent directory', () => {
        const registry = new PresetRegistry();
        const before = registry.list().length;
        registry.loadFromDirectory('/does/not/exist/codecomfy');
        const after = registry.list().length;
        assert.strictEqual(before, after, 'should not add any presets');
    });

    it('skips invalid JSON files without crashing', () => {
        const dir = makeTempDir();
        fs.writeFileSync(path.join(dir, 'broken.json'), 'NOT VALID JSON {{{');

        const registry = new PresetRegistry();
        const before = registry.list().length;
        registry.loadFromDirectory(dir);
        const after = registry.list().length;
        assert.strictEqual(before, after, 'should skip broken file');
    });

    it('skips JSON files missing required fields (id, kind)', () => {
        const dir = makeTempDir();
        writePresetFile(dir, 'no-id.json', {
            name: 'No ID Preset',
            kind: 'image',
            defaults: {},
        });
        writePresetFile(dir, 'no-kind.json', {
            id: 'no-kind',
            name: 'No Kind Preset',
            defaults: {},
        });

        const registry = new PresetRegistry();
        registry.loadFromDirectory(dir);

        assert.strictEqual(registry.get('no-kind'), undefined, 'should skip preset without kind');
        // The one without id wouldn't be retrievable by any known ID
    });

    it('ignores non-JSON files', () => {
        const dir = makeTempDir();
        fs.writeFileSync(path.join(dir, 'readme.txt'), 'not a preset');
        fs.writeFileSync(path.join(dir, 'image.png'), 'fake');

        const registry = new PresetRegistry();
        const before = registry.list().length;
        registry.loadFromDirectory(dir);
        const after = registry.list().length;
        assert.strictEqual(before, after, 'should ignore non-JSON files');
    });

    it('allows directory presets to override bundled presets', () => {
        const dir = makeTempDir();
        writePresetFile(dir, 'override.json', {
            id: 'hq-image',
            name: 'Overridden HQ Image',
            kind: 'image',
            defaults: { width: 2048, height: 2048, steps: 50 },
        });

        const registry = new PresetRegistry();
        registry.loadFromDirectory(dir);

        const preset = registry.get('hq-image')!;
        assert.strictEqual(preset.name, 'Overridden HQ Image');
        assert.strictEqual(preset.defaults.width, 2048);
    });
});

// =============================================================================
// FT-1 / F-904558-034: Logger warn spying + shadowing + corrupt-sibling
//
// Covers the error-path behaviour the bundled-preset tests above do not:
//   - malformed JSON emits a WARN via logger.warn
//   - corrupt preset doesn't break loading of valid siblings
//   - user preset "shadows" bundled preset (confirms override semantics)
//   - workspace-relative `.codecomfy/presets/` loads when used that way
// =============================================================================

describe('PresetRegistry — loader diagnostics and shadowing (FT-1)', () => {
    function makeSpyLogger(): { logger: Logger; warnSpy: sinon.SinonSpy } {
        // The Logger contract only exposes `info | warn | error` → `sink(line)`.
        // We spy the sink directly because that's the integration boundary
        // loadFromDirectory relies on when it emits WARN lines.
        const sink = sinon.spy();
        const logger = new Logger({ component: 'test', sink });
        return { logger, warnSpy: sink };
    }

    it('emits a WARN via logger.warn on malformed JSON', () => {
        const dir = makeTempDir();
        fs.writeFileSync(path.join(dir, 'broken.json'), 'NOT VALID JSON {{{');

        const { logger, warnSpy } = makeSpyLogger();
        const registry = new PresetRegistry();
        registry.loadFromDirectory(dir, logger);

        assert.ok(warnSpy.called, 'logger warn sink should have been called');
        const lines = warnSpy.getCalls().map((c) => c.args[0] as string);
        // WARN lines include the filename so users can jump to the offender.
        assert.ok(
            lines.some((l) => l.includes('broken.json') && l.toUpperCase().includes('WARN')),
            `expected WARN line mentioning broken.json; got: ${JSON.stringify(lines)}`,
        );
    });

    it('emits a WARN when required fields (id/kind) are missing', () => {
        const dir = makeTempDir();
        writePresetFile(dir, 'no-kind.json', {
            id: 'no-kind',
            name: 'No Kind',
            defaults: {},
        });
        const { logger, warnSpy } = makeSpyLogger();
        new PresetRegistry().loadFromDirectory(dir, logger);
        assert.ok(warnSpy.called, 'WARN expected for missing-kind preset');
        const line = warnSpy.firstCall.args[0] as string;
        assert.match(line, /no-kind\.json/);
        assert.match(line, /missing required fields|missing|required/i);
    });

    it('corrupt preset does NOT prevent valid siblings from loading', () => {
        const dir = makeTempDir();
        fs.writeFileSync(path.join(dir, 'broken.json'), '{ not valid');
        writePresetFile(dir, 'good.json', {
            id: 'sibling-good',
            name: 'Good Sibling',
            kind: 'image',
            defaults: { width: 1024, height: 1024, steps: 20 },
        });

        const { logger, warnSpy } = makeSpyLogger();
        const registry = new PresetRegistry();
        registry.loadFromDirectory(dir, logger);

        const good = registry.get('sibling-good');
        assert.ok(good, 'valid sibling should still load');
        assert.strictEqual(good.id, 'sibling-good');
        assert.ok(warnSpy.called, 'broken sibling should have emitted WARN');
    });

    it('user preset shadows bundled preset by id (user wins)', () => {
        // Regression guard: loadFromDirectory overwrites `hq-image` via
        // Map.set — this test prevents a future change from accidentally
        // turning it into "bundled-wins".
        const dir = makeTempDir();
        writePresetFile(dir, 'user-hq-image.json', {
            id: 'hq-image',
            name: 'User Portrait',
            kind: 'image',
            defaults: { width: 3072, height: 3072, steps: 40, cfg_scale: 6 },
        });
        const registry = new PresetRegistry();
        registry.loadFromDirectory(dir);
        const merged = registry.get('hq-image')!;
        assert.strictEqual(merged.name, 'User Portrait');
        assert.strictEqual(merged.defaults.width, 3072);
    });

    it('loads from a workspace-relative `.codecomfy/presets/` layout', () => {
        // Mirrors the real extension activation flow where the user directory
        // is `<workspace>/.codecomfy/presets/`.
        const workspace = makeTempDir();
        const presetsDir = path.join(workspace, '.codecomfy', 'presets');
        fs.mkdirSync(presetsDir, { recursive: true });
        writePresetFile(presetsDir, 'ws-preset.json', {
            id: 'ws-relative',
            name: 'Workspace-Relative Preset',
            kind: 'image',
            defaults: { width: 512, height: 512, steps: 20 },
        });
        const registry = new PresetRegistry();
        registry.loadFromDirectory(presetsDir);
        const preset = registry.get('ws-relative');
        assert.ok(preset, 'workspace-relative preset should load');
        assert.strictEqual(preset.kind, 'image');
    });

    it('invalid workflow shape (FT-027) emits WARN and skips the preset', () => {
        const dir = makeTempDir();
        writePresetFile(dir, 'bad-workflow.json', {
            id: 'bad-workflow',
            name: 'Broken',
            kind: 'image',
            defaults: {},
            workflow: {}, // empty workflow is one of the declared failure modes
        });
        const { logger, warnSpy } = makeSpyLogger();
        const registry = new PresetRegistry();
        registry.loadFromDirectory(dir, logger);

        assert.strictEqual(
            registry.get('bad-workflow'),
            undefined,
            'broken-workflow preset should NOT be registered',
        );
        assert.ok(warnSpy.called, 'WARN expected for broken workflow shape');
        const line = warnSpy.firstCall.args[0] as string;
        assert.match(line, /workflow/i);
    });

    it('without a logger, malformed preset is skipped silently (pre-FT-1 behaviour preserved)', () => {
        const dir = makeTempDir();
        fs.writeFileSync(path.join(dir, 'broken.json'), 'garbage');
        const registry = new PresetRegistry();
        // No logger supplied — must not throw.
        assert.doesNotThrow(() => registry.loadFromDirectory(dir));
    });
});

