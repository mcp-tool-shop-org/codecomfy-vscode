/**
 * Role-based workflow injection.
 *
 * These tests pin the behaviour that replaced the v1.1.0 class-name matching,
 * and in particular the three defects it fixed (see `docs/comfy-agent-thread.md`
 * for the ComfyUI 0.23.0 source references behind each anchor).
 */

import * as assert from 'assert';
import {
    analyzeGraph,
    injectRequest,
    followLink,
    isNodeLink,
    toInt,
    snapToFrameGrid,
    collectModelReferences,
    ApiWorkflow,
} from '../../src/engines/workflowInjection';
import { JobRequest } from '../../src/types';

function makeRequest(overrides: Partial<JobRequest> = {}): JobRequest {
    return {
        kind: 'image',
        preset_id: 'test',
        run_id: 'run-1',
        workspace_path: '/tmp/ws',
        created_at: new Date().toISOString(),
        inputs: { prompt: 'a cat' },
        ...overrides,
    } as JobRequest;
}

/** Minimal but correctly-wired SDXL-shaped graph. */
function ksamplerGraph(): ApiWorkflow {
    return {
        '4': {
            class_type: 'CheckpointLoaderSimple',
            inputs: { ckpt_name: 'base.safetensors' },
        },
        '6': { class_type: 'CLIPTextEncode', inputs: { clip: ['4', 1], text: '' } },
        '7': { class_type: 'CLIPTextEncode', inputs: { clip: ['4', 1], text: '' } },
        '5': {
            class_type: 'EmptyLatentImage',
            inputs: { width: 512, height: 512, batch_size: 1 },
        },
        '3': {
            class_type: 'KSampler',
            inputs: {
                model: ['4', 0],
                positive: ['6', 0],
                negative: ['7', 0],
                latent_image: ['5', 0],
                seed: 0,
                steps: 20,
                cfg: 7,
            },
        },
    };
}

/** Guidance-distilled graph: SamplerCustomAdvanced → BasicGuider, no negative. */
function basicGuiderGraph(): ApiWorkflow {
    return {
        '10': { class_type: 'UNETLoader', inputs: { unet_name: 'flux.safetensors' } },
        '11': { class_type: 'CLIPTextEncode', inputs: { clip: ['12', 0], text: '' } },
        '12': { class_type: 'DualCLIPLoader', inputs: { clip_name1: 'a', clip_name2: 'b' } },
        '13': {
            class_type: 'BasicGuider',
            inputs: { model: ['10', 0], conditioning: ['11', 0] },
        },
        '14': {
            class_type: 'EmptyLatentImage',
            inputs: { width: 1024, height: 1024, batch_size: 1 },
        },
        '15': {
            class_type: 'SamplerCustomAdvanced',
            inputs: {
                noise: ['16', 0],
                guider: ['13', 0],
                sampler: ['17', 0],
                sigmas: ['18', 0],
                latent_image: ['14', 0],
            },
        },
    };
}

describe('workflowInjection', () => {
    describe('link helpers', () => {
        it('recognises an API-format link', () => {
            assert.strictEqual(isNodeLink(['4', 0]), true);
        });

        it('rejects literals that merely look array-ish', () => {
            assert.strictEqual(isNodeLink([0, 0]), false);
            assert.strictEqual(isNodeLink(['4', 0, 1]), false);
            assert.strictEqual(isNodeLink('4'), false);
        });

        it('returns null for a dangling link', () => {
            const wf: ApiWorkflow = { '1': { inputs: { model: ['99', 0] } } };
            assert.strictEqual(followLink(wf, wf['1'], 'model'), null);
        });
    });

    describe('analyzeGraph', () => {
        it('resolves positive and negative through a KSampler', () => {
            const a = analyzeGraph(ksamplerGraph());
            assert.deepStrictEqual(a.samplerIds, ['3']);
            assert.strictEqual(a.positiveNodeId, '6');
            assert.strictEqual(a.negativeNodeId, '7');
            assert.strictEqual(a.supportsNegative, true);
            assert.strictEqual(a.latentNodeId, '5');
        });

        it('follows the guider when the sampler has no conditioning slots', () => {
            const a = analyzeGraph(basicGuiderGraph());
            assert.deepStrictEqual(a.samplerIds, ['15']);
            assert.strictEqual(a.positiveNodeId, '11');
            assert.strictEqual(a.negativeNodeId, null);
            assert.strictEqual(
                a.supportsNegative,
                false,
                'BasicGuider has no negative input — the graph cannot take one',
            );
        });

        it('resolves negative through a CFGGuider', () => {
            const wf: ApiWorkflow = {
                ...basicGuiderGraph(),
                '13': {
                    class_type: 'CFGGuider',
                    inputs: {
                        model: ['10', 0],
                        positive: ['11', 0],
                        negative: ['19', 0],
                        cfg: 8,
                    },
                },
                '19': { class_type: 'CLIPTextEncode', inputs: { clip: ['12', 0], text: '' } },
            };
            const a = analyzeGraph(wf);
            assert.strictEqual(a.positiveNodeId, '11');
            assert.strictEqual(a.negativeNodeId, '19');
            assert.strictEqual(a.supportsNegative, true);
        });

        it('flags a temporal latent by its `length` input', () => {
            const wf: ApiWorkflow = {
                '55': {
                    class_type: 'Wan22ImageToVideoLatent',
                    inputs: { width: 1280, height: 704, length: 49, batch_size: 1 },
                },
                '3': {
                    class_type: 'KSampler',
                    inputs: { positive: ['6', 0], negative: ['7', 0], latent_image: ['55', 0] },
                },
                '6': { class_type: 'CLIPTextEncode', inputs: { text: '' } },
                '7': { class_type: 'CLIPTextEncode', inputs: { text: '' } },
            };
            assert.strictEqual(analyzeGraph(wf).latentHasLength, true);
            assert.strictEqual(analyzeGraph(ksamplerGraph()).latentHasLength, false);
        });
    });

    describe('injectRequest', () => {
        it('injects prompt and negative via link-walking, ignoring titles', () => {
            // Deliberately mis-titled: node 6 is wired to `positive` but titled
            // "Negative". The old heuristic would have inverted the prompts.
            const wf = ksamplerGraph();
            wf['6']._meta = { title: 'Negative Prompt' };

            injectRequest(
                wf,
                makeRequest({ inputs: { prompt: 'a cat', negative_prompt: 'blurry' } } as Partial<JobRequest>),
                {},
            );

            assert.strictEqual(wf['6'].inputs!.text, 'a cat', 'wiring wins over the title');
            assert.strictEqual(wf['7'].inputs!.text, 'blurry');
        });

        it('does not smuggle the negative prompt into a guidance-distilled graph', () => {
            const wf = basicGuiderGraph();
            const report = injectRequest(
                wf,
                makeRequest({ inputs: { prompt: 'a cat', negative_prompt: 'blurry' } } as Partial<JobRequest>),
                {},
            );

            assert.strictEqual(wf['11'].inputs!.text, 'a cat');
            assert.ok(
                report.warnings.some((w) => w.includes('no negative-conditioning path')),
                'should warn that the negative prompt was ignored',
            );
        });

        it('writes video frames to `length`, never to `batch_size`', () => {
            const wf: ApiWorkflow = {
                '55': {
                    class_type: 'Wan22ImageToVideoLatent',
                    inputs: { width: 1280, height: 704, length: 49, batch_size: 1 },
                },
                '3': {
                    class_type: 'KSampler',
                    inputs: { positive: ['6', 0], negative: ['7', 0], latent_image: ['55', 0] },
                },
                '6': { class_type: 'CLIPTextEncode', inputs: { text: '' } },
                '7': { class_type: 'CLIPTextEncode', inputs: { text: '' } },
            };

            injectRequest(
                wf,
                makeRequest({
                    kind: 'video',
                    inputs: { prompt: 'a cat', frame_count: 121 },
                } as Partial<JobRequest>),
                {},
            );

            assert.strictEqual(wf['55'].inputs!.length, 121);
            assert.strictEqual(wf['55'].inputs!.batch_size, 1, 'batch_size must be left alone');
        });

        it('warns loudly when a video preset has no temporal latent (the flipbook)', () => {
            const wf = ksamplerGraph();
            const report = injectRequest(
                wf,
                makeRequest({
                    kind: 'video',
                    inputs: { prompt: 'a cat', frame_count: 96 },
                } as Partial<JobRequest>),
                {},
            );

            assert.ok(
                report.warnings.some((w) => w.includes('A batch of images is NOT a video')),
                'should name the flipbook defect explicitly',
            );
            assert.strictEqual(
                wf['5'].inputs!.batch_size,
                1,
                'frames must NOT be written to an image latent batch_size',
            );
        });

        it('warns when a checkpoint override has no CheckpointLoaderSimple to apply to', () => {
            const report = injectRequest(
                basicGuiderGraph(),
                makeRequest(),
                { checkpoint: 'other.safetensors' },
            );

            assert.ok(
                report.warnings.some((w) => w.includes('split stack')),
                'the silent no-op on split-stack graphs must now be reported',
            );
        });

        it('applies a checkpoint override when the node does exist', () => {
            const wf = ksamplerGraph();
            injectRequest(wf, makeRequest(), { checkpoint: 'other.safetensors' });
            assert.strictEqual(wf['4'].inputs!.ckpt_name, 'other.safetensors');
        });

        it('injects cfg into a CFGGuider rather than the sampler', () => {
            const wf: ApiWorkflow = {
                ...basicGuiderGraph(),
                '13': {
                    class_type: 'CFGGuider',
                    inputs: { model: ['10', 0], positive: ['11', 0], negative: ['19', 0], cfg: 8 },
                },
                '19': { class_type: 'CLIPTextEncode', inputs: { text: '' } },
            };

            injectRequest(
                wf,
                makeRequest({ inputs: { prompt: 'x', cfg_scale: 3.5 } } as Partial<JobRequest>),
                {},
            );
            assert.strictEqual(wf['13'].inputs!.cfg, 3.5);
        });

        it('coerces INT-typed values so ComfyUI cannot silently truncate them', () => {
            const wf = ksamplerGraph();
            injectRequest(
                wf,
                makeRequest({ inputs: { prompt: 'x', steps: 30.7, seed: 12.9 } } as Partial<JobRequest>),
                {},
            );
            assert.strictEqual(wf['3'].inputs!.steps, 31);
            assert.strictEqual(wf['3'].inputs!.seed, 13);
        });

        it('falls back to the legacy heuristic for a degenerate graph', () => {
            // No sampler at all — nothing to link-walk from.
            const wf: ApiWorkflow = {
                'neg_clip': { class_type: 'CLIPTextEncode', inputs: { text: '' } },
            };
            injectRequest(
                wf,
                makeRequest({ inputs: { prompt: 'a cat', negative_prompt: 'ugly' } } as Partial<JobRequest>),
                {},
            );
            assert.strictEqual(wf['neg_clip'].inputs!.text, 'ugly');
        });
    });

    describe('toInt / snapToFrameGrid', () => {
        it('rounds rather than truncating', () => {
            assert.strictEqual(toInt(30.7), 31);
            assert.strictEqual(toInt(30.2), 30);
            assert.strictEqual(toInt(30), 30);
        });

        it('snaps frame counts up to the 4n+1 grid', () => {
            assert.strictEqual(snapToFrameGrid(1, 4), 1);
            assert.strictEqual(snapToFrameGrid(2, 4), 5);
            assert.strictEqual(snapToFrameGrid(49, 4), 49);
            assert.strictEqual(snapToFrameGrid(96, 4), 97);
            assert.strictEqual(snapToFrameGrid(150, 4), 153);
        });

        it('honours the LTX step-8 grid', () => {
            assert.strictEqual(snapToFrameGrid(97, 8), 97);
            assert.strictEqual(snapToFrameGrid(98, 8), 105);
        });
    });

    describe('collectModelReferences', () => {
        it('finds every *_name model reference across a split stack', () => {
            const refs = collectModelReferences({
                '37': { class_type: 'UNETLoader', inputs: { unet_name: 'wan.safetensors' } },
                '38': {
                    class_type: 'CLIPLoader',
                    inputs: { clip_name: 'umt5.safetensors', type: 'wan' },
                },
                '39': { class_type: 'VAELoader', inputs: { vae_name: 'wan_vae.safetensors' } },
            });

            assert.strictEqual(refs.length, 3);
            assert.ok(
                !refs.some((r) => r.input === 'type'),
                '`type` is a mode, not a filename — must not be reported as a model',
            );
        });

        it('excludes sampler_name, which enumerates an algorithm not a file', () => {
            const refs = collectModelReferences({
                '3': {
                    class_type: 'KSampler',
                    inputs: { sampler_name: 'uni_pc', scheduler: 'simple' },
                },
            });
            assert.deepStrictEqual(refs, []);
        });
    });
});
