/**
 * Unit tests for src/presets/registry.ts
 *
 * Tests the PresetRegistry class directly (not the singleton) to ensure
 * bundled presets load correctly, lookups behave, and loadFromDirectory
 * handles edge cases.
 */

import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PresetRegistry } from '../../src/presets/registry';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const tmpDirs: string[] = [];

function makeTempDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codecomfy-presets-'));
    tmpDirs.push(dir);
    return dir;
}

function writePresetFile(dir: string, filename: string, content: object): void {
    fs.writeFileSync(path.join(dir, filename), JSON.stringify(content));
}

after(() => {
    for (const dir of tmpDirs.reverse()) {
        try {
            // Remove all files in dir, then dir itself
            const files = fs.readdirSync(dir);
            for (const f of files) {
                fs.unlinkSync(path.join(dir, f));
            }
            fs.rmdirSync(dir);
        } catch {
            // Best effort
        }
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
