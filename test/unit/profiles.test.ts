/**
 * The six-profile layer: retrieval contract, vendored KB, preflight, and the
 * PNG metadata reader.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as zlib from 'zlib';

import {
    collectOutputs,
    classifyArtifact,
    isFrameSequence,
    explainEmptyOutputs,
    defaultExtensionFor,
    TERMINATOR_OUTPUT_KEYS,
} from '../../src/engines/retrieval';
import { validateHistoryEntry } from '../../src/engines/comfyValidation';
import {
    PROFILES,
    allKbPresets,
    kbPresetsForProfile,
    findKbPreset,
    requiredInputs,
    toEnginePreset,
    kbProvenance,
} from '../../src/profiles/registry';
import { preflightPreset } from '../../src/engines/preflight';
import { readPngTextChunks, readPngWorkflow, extractApiGraph } from '../../src/profiles/metadata';

function ref(filename: string) {
    return { filename, subfolder: '', type: 'output' };
}

describe('retrieval contract', () => {
    it('reads every output key, not just images', () => {
        const history = validateHistoryEntry({
            status: { status_str: 'success', completed: true },
            outputs: {
                '1': { images: [ref('a.png')] },
                '2': { gifs: [ref('b.mp4')] },
                '3': { audio: [ref('c.flac')] },
                '4': { '3d': [ref('d.glb')] },
                '5': { text: ['a caption'], files: [ref('e.txt')] },
            },
        });

        const result = collectOutputs(history);
        assert.strictEqual(result.refs.length, 5, 'one ref per saved file');
        assert.deepStrictEqual(
            result.refs.map((r) => r.kind).sort(),
            ['audio', 'image', 'model3d', 'text', 'video'],
        );
        assert.deepStrictEqual(result.inlineText, [{ nodeId: '5', text: 'a caption' }]);
    });

    it('would have found nothing under the pre-1.3 images-only rule', () => {
        // Regression guard: a VHS-terminated video reports under `gifs`.
        const history = validateHistoryEntry({
            status: { status_str: 'success', completed: true },
            outputs: { '14': { gifs: [ref('clip.mp4')] } },
        });
        assert.strictEqual(history.outputs['14'].images, undefined);
        assert.strictEqual(collectOutputs(history).refs.length, 1);
    });

    it('classifies by extension, since `images` carries both stills and video', () => {
        assert.strictEqual(classifyArtifact('x.png', 'images'), 'image');
        assert.strictEqual(classifyArtifact('x.mp4', 'images'), 'video');
        assert.strictEqual(classifyArtifact('x.flac', 'audio'), 'audio');
        assert.strictEqual(classifyArtifact('x.glb', '3d'), 'model3d');
    });

    it('falls back to the key when the extension is unknown', () => {
        assert.strictEqual(classifyArtifact('noext', 'gifs'), 'video');
        assert.strictEqual(classifyArtifact('noext', 'images'), 'image');
    });

    it('distinguishes a frame sequence from a finished container', () => {
        const frames = [
            { ...ref('001.png'), key: 'images' as const, nodeId: '9', kind: 'image' as const },
            { ...ref('002.png'), key: 'images' as const, nodeId: '9', kind: 'image' as const },
        ];
        const container = [
            { ...ref('clip.mp4'), key: 'images' as const, nodeId: '9', kind: 'video' as const },
        ];
        assert.strictEqual(isFrameSequence(frames), true);
        assert.strictEqual(isFrameSequence(container), false);
        assert.strictEqual(isFrameSequence([frames[0]]), false, 'one still is not a sequence');
    });

    it('names the expected key when a graph produced nothing', () => {
        const msg = explainEmptyOutputs(['KSampler', 'SaveAudioAdvanced']);
        assert.ok(msg.includes('SaveAudioAdvanced'));
        assert.ok(msg.includes('audio'));
    });

    it('explains a graph with no output node at all', () => {
        const msg = explainEmptyOutputs(['KSampler', 'VAEDecode']);
        assert.ok(msg.includes('no recognised save node'));
    });

    it('maps every terminator it knows to at least one key', () => {
        for (const [terminator, keys] of Object.entries(TERMINATOR_OUTPUT_KEYS)) {
            assert.ok(keys.length > 0, `${terminator} must declare a key`);
        }
        assert.deepStrictEqual(TERMINATOR_OUTPUT_KEYS.VHS_VideoCombine, ['gifs']);
        assert.deepStrictEqual(TERMINATOR_OUTPUT_KEYS.SaveVideo, ['images']);
    });

    it('supplies a sane fallback extension per kind', () => {
        assert.strictEqual(defaultExtensionFor('audio'), '.flac');
        assert.strictEqual(defaultExtensionFor('model3d'), '.glb');
        assert.strictEqual(defaultExtensionFor('image'), '.png');
    });
});

describe('vendored KB', () => {
    it('carries presets for every generation profile', () => {
        const generation = PROFILES.filter((p) => p.submitsGraph).map((p) => p.id);
        for (const profile of generation) {
            assert.ok(
                kbPresetsForProfile(profile).length > 0,
                `profile ${profile} should have at least one preset`,
            );
        }
    });

    it('records its provenance so a stale vendor is visible', () => {
        const p = kbProvenance();
        assert.ok(p.source.includes('comfy-headless'));
        assert.ok(p.version && p.version !== 'unknown');
        assert.strictEqual(p.presetCount, allKbPresets().length);
    });

    it('gives every preset an API-format graph and a retrieval key', () => {
        for (const preset of allKbPresets()) {
            const nodes = Object.values(preset.workflow as Record<string, { class_type?: string }>);
            assert.ok(nodes.length > 0, `${preset.id} has no nodes`);
            assert.ok(
                nodes.some((n) => typeof n?.class_type === 'string'),
                `${preset.id} is not API-format`,
            );
            assert.ok(
                preset.history_output_keys.length > 0,
                `${preset.id} declares no history output key`,
            );
        }
    });

    it('derives required inputs from each graph, not from its profile', () => {
        const i2v = findKbPreset('video_hunyuan15_i2v');
        assert.ok(i2v, 'expected the Hunyuan i2v preset in the vendored KB');
        const fields = requiredInputs(i2v!).map((d) => d.field);
        assert.ok(fields.includes('input_image'), 'i2v must ask for a source image');
        assert.ok(fields.includes('prompt'));

        // A 3D preset needs an image but no prompt at all.
        const mesh = kbPresetsForProfile('3d')[0];
        const meshFields = requiredInputs(mesh).map((d) => d.field);
        assert.ok(meshFields.includes('input_image'));
        assert.ok(!meshFields.includes('negative_prompt'));
    });

    it('puts file inputs before text inputs so the picker comes first', () => {
        const i2v = findKbPreset('video_hunyuan15_i2v')!;
        const descriptors = requiredInputs(i2v);
        assert.strictEqual(descriptors[0].isFile, true);
    });

    it('converts to an engine preset without inventing defaults', () => {
        const preset = allKbPresets()[0];
        const engine = toEnginePreset(preset);
        assert.deepStrictEqual(
            engine.defaults,
            {},
            'reference graphs carry their own verified recipe — do not override it',
        );
        assert.strictEqual(engine.id, preset.id);
    });
});

describe('preflight', () => {
    const preset = {
        id: 'test',
        name: 'Test Preset',
        profile: 'image' as const,
        kind: 'image' as const,
        placeholders: [],
        history_output_keys: ['images'],
        requires: {
            class_types: ['KSampler', 'Florence2Run'],
            packs: ['comfyui-florence2'],
            models: [
                { nodeId: '4', classType: 'CheckpointLoaderSimple', input: 'ckpt_name', file: 'base.safetensors' },
            ],
        },
        workflow: {},
    };

    it('passes when every node and model is present', async () => {
        const result = await preflightPreset(preset, {
            hasClass: async () => true,
            listModels: async () => ['base.safetensors'],
        });
        assert.strictEqual(result.ok, true);
        assert.strictEqual(result.message, '');
    });

    it('names the missing node and the pack that provides it', async () => {
        const result = await preflightPreset(preset, {
            hasClass: async (c) => c !== 'Florence2Run',
            listModels: async () => ['base.safetensors'],
        });
        assert.strictEqual(result.ok, false);
        assert.strictEqual(result.missingNodes[0].classType, 'Florence2Run');
        assert.ok(result.message.includes('comfyui-florence2'));
        assert.ok(result.message.includes('no GPU time was spent'));
    });

    it('names the missing model and where it belongs', async () => {
        const result = await preflightPreset(preset, {
            hasClass: async () => true,
            listModels: async () => ['something-else.safetensors'],
        });
        assert.strictEqual(result.ok, false);
        assert.strictEqual(result.missingModels[0].file, 'base.safetensors');
        assert.ok(result.message.includes('models/checkpoints/'));
    });

    it('accepts a subfolder-qualified match for a bare filename', async () => {
        const result = await preflightPreset(preset, {
            hasClass: async () => true,
            listModels: async () => ['sdxl/base.safetensors'],
        });
        assert.strictEqual(result.ok, true);
    });

    it('skips rather than fails when the server cannot list models', async () => {
        const result = await preflightPreset(preset, {
            hasClass: async () => true,
            listModels: async () => null,
        });
        assert.strictEqual(result.ok, true, 'an old server must not look like a missing model');
        assert.strictEqual(result.skipped.length, 1);
    });
});

describe('metadata profile (PNG provenance)', () => {
    const tmp: string[] = [];
    after(() => {
        for (const f of tmp) {
            try { fs.unlinkSync(f); } catch { /* best effort */ }
        }
    });

    function writePng(chunks: Array<{ type: string; data: Buffer }>): string {
        const parts: Buffer[] = [
            Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        ];
        for (const { type, data } of chunks) {
            const len = Buffer.alloc(4);
            len.writeUInt32BE(data.length);
            parts.push(len, Buffer.from(type, 'latin1'), data, Buffer.alloc(4));
        }
        const file = path.join(os.tmpdir(), `codecomfy-meta-${Date.now()}-${Math.random().toString(16).slice(2)}.png`);
        fs.writeFileSync(file, Buffer.concat(parts));
        tmp.push(file);
        return file;
    }

    function tEXt(keyword: string, text: string): { type: string; data: Buffer } {
        return {
            type: 'tEXt',
            data: Buffer.concat([Buffer.from(keyword, 'latin1'), Buffer.from([0]), Buffer.from(text, 'utf8')]),
        };
    }

    it('reads an uncompressed tEXt chunk', () => {
        const file = writePng([tEXt('prompt', '{"3":{"class_type":"KSampler","inputs":{}}}')]);
        const chunks = readPngTextChunks(file);
        assert.strictEqual(chunks.length, 1);
        assert.strictEqual(chunks[0].keyword, 'prompt');
    });

    it('reads a zlib-compressed zTXt chunk', () => {
        const payload = '{"1":{"class_type":"SaveImage","inputs":{}}}';
        const data = Buffer.concat([
            Buffer.from('prompt', 'latin1'),
            Buffer.from([0, 0]),
            zlib.deflateSync(Buffer.from(payload, 'utf8')),
        ]);
        const file = writePng([{ type: 'zTXt', data }]);
        const result = readPngWorkflow(file);
        assert.strictEqual(result.ok, true);
    });

    it('returns a clear message for a PNG with no metadata', () => {
        const file = writePng([{ type: 'IEND', data: Buffer.alloc(0) }]);
        const result = readPngWorkflow(file);
        assert.strictEqual(result.ok, false);
        assert.ok(!result.ok && result.error.includes('No text metadata'));
    });

    it('returns a clear message for a non-PNG instead of throwing', () => {
        const file = path.join(os.tmpdir(), `codecomfy-not-a-png-${Date.now()}.png`);
        fs.writeFileSync(file, 'plain text, not a PNG');
        tmp.push(file);
        assert.deepStrictEqual(readPngTextChunks(file), []);
    });

    it('does not read past the buffer on a crafted chunk length', () => {
        const bogus = Buffer.concat([
            Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
            Buffer.from([0xff, 0xff, 0xff, 0xff]), // absurd length
            Buffer.from('tEXt', 'latin1'),
        ]);
        const file = path.join(os.tmpdir(), `codecomfy-bad-len-${Date.now()}.png`);
        fs.writeFileSync(file, bogus);
        tmp.push(file);
        assert.deepStrictEqual(readPngTextChunks(file), [], 'must bail, not over-read');
    });

    it('extracts a re-submittable API graph only from the prompt chunk', () => {
        const api = '{"3":{"class_type":"KSampler","inputs":{"seed":1}}}';
        const file = writePng([tEXt('prompt', api)]);
        const graph = extractApiGraph(file);
        assert.ok(graph);
        assert.strictEqual((graph as Record<string, { class_type: string }>)['3'].class_type, 'KSampler');
    });

    it('refuses an editor-format workflow chunk as an API graph', () => {
        const editor = '{"nodes":[{"id":1,"type":"KSampler"}],"links":[]}';
        const file = writePng([tEXt('workflow', editor)]);
        assert.strictEqual(extractApiGraph(file), null);
    });

    it('falls through to `workflow` when `prompt` is malformed', () => {
        const file = writePng([
            tEXt('prompt', 'not json{{'),
            tEXt('workflow', '{"nodes":[]}'),
        ]);
        const result = readPngWorkflow(file);
        assert.strictEqual(result.ok, true);
        assert.ok(result.ok && result.chunkKeys.includes('workflow'));
    });
});
