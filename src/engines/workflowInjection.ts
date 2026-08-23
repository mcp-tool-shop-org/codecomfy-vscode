/**
 * Workflow injection — role-based graph analysis.
 *
 * Replaces the original class-name-matching injection map, which had three
 * defects verified against ComfyUI 0.23.0 source (see
 * `docs/comfy-agent-thread.md`):
 *
 *   1. Positive vs negative conditioning was decided by a string heuristic on
 *      `_meta.title` ("contains the word negative"). `_meta` is frontend
 *      convenience metadata, is not required by `/prompt`, and carries no
 *      platform convention marking a node as negative. Graphs without titles
 *      silently got the positive prompt in both encoders.
 *   2. Model-name injection anchored on `CheckpointLoaderSimple`, which does
 *      not appear in any split-stack graph (Flux, Qwen-Image, SD3.5, Wan,
 *      ACE). The override was a silent no-op on all of them while the UI
 *      reported success.
 *   3. `EmptyLatentImage.batch_size` was used to carry video frame counts.
 *      Real temporal families take `length` (in frames) on a model-specific
 *      video latent node; `batch_size` produces N independent stills.
 *
 * The replacement walks links instead of matching names. Verified anchors:
 *   • `KSampler` / `KSamplerAdvanced` / `SamplerCustom` expose `positive` +
 *     `negative` (nodes.py, nodes_custom_sampler.py).
 *   • `SamplerCustomAdvanced` exposes `noise, guider, sampler, sigmas,
 *     latent_image` — no conditioning slots at all
 *     (nodes_custom_sampler.py:936-944).
 *   • `CFGGuider` = `model, positive, negative, cfg` (:818-825);
 *     `BasicGuider` = `model, conditioning` with NO negative (:796-801) —
 *     the guidance-distilled path.
 *
 * So: sampler → if it has `negative`, follow it; else if it has `guider`,
 * follow that node's `negative`; else the graph has no negative conditioning
 * and the negative prompt must not be silently dropped into the positive.
 */

import { JobRequest } from '../types';

/**
 * Structural subset of the engine's `WorkflowOverrides`. Declared locally
 * rather than imported so this module stays free of a circular dependency on
 * `comfyServerEngine.ts`.
 */
export interface InjectionOverrides {
    checkpoint?: string;
}

/**
 * An API-format input reference to another node's output: `[nodeId, slotIndex]`.
 * Anything else in an `inputs` map is a literal widget value.
 */
export type NodeLink = [string, number];

export interface WorkflowNode {
    class_type?: string;
    inputs?: Record<string, unknown>;
    _meta?: { title?: string };
}

export type ApiWorkflow = Record<string, WorkflowNode>;

/**
 * `*_name` inputs that enumerate an algorithm rather than a file in `models/`.
 * Excluded from model-reference collection so preflight does not try to verify
 * `uni_pc` as though it were a checkpoint.
 */
const NON_MODEL_NAME_INPUTS = new Set(['sampler_name']);

/** Input names that carry a seed on the core sampler family. */
const SEED_INPUT_NAMES = ['seed', 'noise_seed'] as const;

/**
 * Inputs that identify a sampler node. `latent_image` covers the KSampler
 * family and `SamplerCustomAdvanced` alike; `guider` is the custom-sampling
 * marker we follow for conditioning.
 */
const SAMPLER_MARKER_INPUTS = ['latent_image', 'guider'] as const;

/** True when `v` is an API-format `[nodeId, slot]` link rather than a literal. */
export function isNodeLink(v: unknown): v is NodeLink {
    return (
        Array.isArray(v) &&
        v.length === 2 &&
        typeof v[0] === 'string' &&
        typeof v[1] === 'number'
    );
}

/**
 * Follow `node.inputs[inputName]` to the node it references.
 * Returns `null` when the input is absent, is a literal, or dangles.
 */
export function followLink(
    workflow: ApiWorkflow,
    node: WorkflowNode | undefined,
    inputName: string,
): string | null {
    const v = node?.inputs?.[inputName];
    if (!isNodeLink(v)) return null;
    const targetId = v[0];
    return workflow[targetId] ? targetId : null;
}

export interface GraphAnalysis {
    /** Node ids that look like samplers (have `latent_image` or `guider`). */
    samplerIds: string[];
    /** Node id supplying positive conditioning, if resolvable. */
    positiveNodeId: string | null;
    /** Node id supplying negative conditioning, if the graph has one. */
    negativeNodeId: string | null;
    /**
     * False when the graph provably has no negative conditioning path — a
     * `BasicGuider` / guidance-distilled graph. Callers should hide or
     * disable the negative-prompt input rather than dropping the value.
     */
    supportsNegative: boolean;
    /** Latent-creating node reached from the sampler, if resolvable. */
    latentNodeId: string | null;
    /** True when the latent node takes `length` (frames) — a real video latent. */
    latentHasLength: boolean;
    /** Node ids that assemble frames into a video (`CreateVideo`). */
    videoAssemblerIds: string[];
    /** Node ids that write a video server-side (`SaveVideo`, `SaveWEBM`). */
    videoSaveIds: string[];
}

/**
 * Resolve the conditioning pair for one sampler, following the guider when
 * the sampler has no direct conditioning slots.
 */
function resolveConditioning(
    workflow: ApiWorkflow,
    samplerId: string,
): { positive: string | null; negative: string | null; supportsNegative: boolean } {
    const sampler = workflow[samplerId];

    // Direct path — KSampler / KSamplerAdvanced / SamplerCustom.
    const directPos = followLink(workflow, sampler, 'positive');
    const directNeg = followLink(workflow, sampler, 'negative');
    if (directPos || directNeg) {
        return { positive: directPos, negative: directNeg, supportsNegative: true };
    }

    // Guider path — SamplerCustomAdvanced.
    const guiderId = followLink(workflow, sampler, 'guider');
    if (guiderId) {
        const guider = workflow[guiderId];
        const gPos = followLink(workflow, guider, 'positive');
        const gNeg = followLink(workflow, guider, 'negative');
        if (gPos || gNeg) {
            // CFGGuider — has both.
            return { positive: gPos, negative: gNeg, supportsNegative: true };
        }
        // BasicGuider — single `conditioning`, no negative exists in this graph.
        const single = followLink(workflow, guider, 'conditioning');
        return { positive: single, negative: null, supportsNegative: false };
    }

    return { positive: null, negative: null, supportsNegative: false };
}

/**
 * Walk the graph and locate the nodes that runtime values must be injected
 * into. Pure — does not mutate `workflow`.
 */
export function analyzeGraph(workflow: ApiWorkflow): GraphAnalysis {
    const samplerIds: string[] = [];
    const videoAssemblerIds: string[] = [];
    const videoSaveIds: string[] = [];

    for (const [id, node] of Object.entries(workflow)) {
        const inputs = node?.inputs;
        if (!inputs) continue;

        if (SAMPLER_MARKER_INPUTS.some((k) => k in inputs)) {
            samplerIds.push(id);
        }
        const cls = node.class_type;
        if (cls === 'CreateVideo') videoAssemblerIds.push(id);
        if (cls === 'SaveVideo' || cls === 'SaveWEBM') videoSaveIds.push(id);
    }

    let positiveNodeId: string | null = null;
    let negativeNodeId: string | null = null;
    let supportsNegative = false;
    let latentNodeId: string | null = null;

    for (const samplerId of samplerIds) {
        const c = resolveConditioning(workflow, samplerId);
        positiveNodeId ??= c.positive;
        negativeNodeId ??= c.negative;
        supportsNegative ||= c.supportsNegative;
        latentNodeId ??= followLink(workflow, workflow[samplerId], 'latent_image');
    }

    const latentInputs = latentNodeId ? workflow[latentNodeId]?.inputs : undefined;
    const latentHasLength = !!latentInputs && 'length' in latentInputs;

    return {
        samplerIds,
        positiveNodeId,
        negativeNodeId,
        supportsNegative,
        latentNodeId,
        latentHasLength,
        videoAssemblerIds,
        videoSaveIds,
    };
}

/**
 * Coerce a value destined for an INT-typed ComfyUI input.
 *
 * ComfyUI does NOT reject a fractional float on an INT input — `execution.py`
 * runs `val = int(val)`, which truncates silently. `steps: 30.7` becomes 30
 * with no error anywhere. We therefore round explicitly so a computed value
 * (frame counts, scaled dimensions, randomized seeds) can never be silently
 * truncated in a way the user did not intend.
 */
export function toInt(v: number): number {
    return Math.round(v);
}

/** Snap a frame count up to the nearest legal value on a `4n + 1`-style grid. */
export function snapToFrameGrid(frames: number, step: number): number {
    if (step <= 1) return toInt(frames);
    const n = Math.max(0, Math.ceil((toInt(frames) - 1) / step));
    return n * step + 1;
}

export interface InjectionReport {
    /** Number of nodes whose inputs were modified. */
    injected: number;
    /** Human-readable warnings for the output channel. */
    warnings: string[];
    /** The analysis used, for logging and for the caller's UI decisions. */
    analysis: GraphAnalysis;
}

/**
 * Inject the request's runtime values into an API-format workflow, in place.
 *
 * `workflow` must already be a deep copy — this mutates it.
 */
export function injectRequest(
    workflow: ApiWorkflow,
    request: JobRequest,
    overrides: InjectionOverrides,
): InjectionReport {
    const analysis = analyzeGraph(workflow);
    const warnings: string[] = [];
    let injected = 0;

    // A valid API-format graph always wires its sampler to conditioning and a
    // latent — ComfyUI rejects it otherwise. When no sampler is present at all
    // the graph is degenerate (a fragment, or a hand-written stub), and there
    // is nothing to link-walk from. Fall back to the pre-1.2 class-name +
    // title heuristic so such graphs behave exactly as they used to.
    if (analysis.samplerIds.length === 0) {
        return legacyInject(workflow, request, overrides, analysis);
    }

    const setInput = (nodeId: string | null, key: string, value: unknown): void => {
        if (!nodeId) return;
        const inputs = workflow[nodeId]?.inputs;
        if (!inputs || !(key in inputs)) return;
        inputs[key] = value;
        injected++;
    };

    // ---- Conditioning -------------------------------------------------
    if (analysis.positiveNodeId) {
        setInput(analysis.positiveNodeId, 'text', request.inputs.prompt);
    } else {
        warnings.push(
            'Could not resolve a positive-conditioning node from the sampler. ' +
            'Your prompt was NOT applied — check that the workflow is API-format ' +
            '(exported with "Export (API)") and that its sampler is wired to a text encoder.',
        );
    }

    if (analysis.supportsNegative) {
        setInput(analysis.negativeNodeId, 'text', request.inputs.negative_prompt || '');
    } else if (request.inputs.negative_prompt) {
        warnings.push(
            'This workflow has no negative-conditioning path (guidance-distilled ' +
            'models such as Flux use a single conditioning input). Your negative ' +
            'prompt was ignored rather than silently merged into the positive prompt.',
        );
    }

    // ---- Sampler ------------------------------------------------------
    for (const samplerId of analysis.samplerIds) {
        const inputs = workflow[samplerId]?.inputs;
        if (!inputs) continue;

        if (request.inputs.seed !== undefined) {
            for (const name of SEED_INPUT_NAMES) {
                if (name in inputs) {
                    inputs[name] = toInt(request.inputs.seed);
                    injected++;
                }
            }
        }
        if (request.inputs.steps !== undefined && 'steps' in inputs) {
            inputs.steps = toInt(request.inputs.steps);
            injected++;
        }
        if (request.inputs.cfg_scale !== undefined && 'cfg' in inputs) {
            inputs.cfg = request.inputs.cfg_scale;
            injected++;
        }
    }

    // `cfg` lives on CFGGuider, not the sampler, in custom-sampling graphs.
    if (request.inputs.cfg_scale !== undefined) {
        for (const [, node] of Object.entries(workflow)) {
            if (node.class_type === 'CFGGuider' && node.inputs && 'cfg' in node.inputs) {
                node.inputs.cfg = request.inputs.cfg_scale;
                injected++;
            }
        }
    }

    // ---- Latent -------------------------------------------------------
    if (analysis.latentNodeId) {
        if (request.inputs.width !== undefined) {
            setInput(analysis.latentNodeId, 'width', toInt(request.inputs.width));
        }
        if (request.inputs.height !== undefined) {
            setInput(analysis.latentNodeId, 'height', toInt(request.inputs.height));
        }

        if (request.kind === 'video' && request.inputs.frame_count !== undefined) {
            if (analysis.latentHasLength) {
                setInput(
                    analysis.latentNodeId,
                    'length',
                    toInt(request.inputs.frame_count),
                );
            } else {
                // The v1.1.0 flipbook shape: frames written to `batch_size` on an
                // image latent produce N independent stills, not a video.
                warnings.push(
                    'This video preset has no temporal latent node — its latent takes ' +
                    '`batch_size`, not `length`. A batch of images is NOT a video: every ' +
                    'frame is generated independently with no motion model, so the result ' +
                    'will flicker. Use a preset built on a video model (Wan, LTX, Hunyuan).',
                );
            }
        }
    } else {
        warnings.push(
            'Could not resolve a latent node from the sampler — width, height, and ' +
            'frame count were not applied.',
        );
    }

    // ---- Video assembly ------------------------------------------------
    if (request.kind === 'video' && request.inputs.fps !== undefined) {
        for (const id of analysis.videoAssemblerIds) {
            setInput(id, 'fps', request.inputs.fps);
        }
    }

    // ---- Model overrides ------------------------------------------------
    if (overrides.checkpoint) {
        let applied = 0;
        for (const [, node] of Object.entries(workflow)) {
            if (node.class_type === 'CheckpointLoaderSimple' && node.inputs) {
                node.inputs.ckpt_name = overrides.checkpoint;
                applied++;
                injected++;
            }
        }
        if (applied === 0) {
            // The v1.1.0 silent no-op, now loud. Split-stack graphs load their
            // weights through UNETLoader + CLIPLoader + VAELoader, so there is
            // no single "checkpoint" for the setting to override.
            warnings.push(
                `codecomfy.defaultCheckpoint is set to "${overrides.checkpoint}" but this ` +
                'workflow has no CheckpointLoaderSimple node — it loads weights through a ' +
                'split stack (UNETLoader / CLIPLoader / VAELoader). The override was NOT ' +
                'applied. Edit the model filenames in the preset JSON instead.',
            );
        }
    }

    return { injected, warnings, analysis };
}

/**
 * Pre-1.2 injection: match on `class_type` and decide positive-vs-negative
 * from `_meta.title` / the node id.
 *
 * Retained ONLY for degenerate graphs with no sampler to link-walk from
 * (fragments and hand-written stubs). It is not used for any workflow ComfyUI
 * would actually accept, because those always wire a sampler. Keeping it means
 * the rework cannot regress a graph that worked before.
 */
function legacyInject(
    workflow: ApiWorkflow,
    request: JobRequest,
    overrides: InjectionOverrides,
    analysis: GraphAnalysis,
): InjectionReport {
    const warnings: string[] = [];
    let injected = 0;

    for (const [nodeId, node] of Object.entries(workflow)) {
        const inputs = node?.inputs;
        if (!inputs) continue;
        const cls = node.class_type;
        if (!cls) continue;

        if (cls.includes('CLIPTextEncode')) {
            if (inputs.text === undefined) continue;
            const title = node._meta?.title;
            const isNegative =
                title?.toLowerCase().includes('negative') || nodeId.includes('neg');
            inputs.text = isNegative
                ? (request.inputs.negative_prompt || '')
                : request.inputs.prompt;
            injected++;
        } else if (cls.includes('KSampler')) {
            if (request.inputs.seed !== undefined) {
                inputs.seed = toInt(request.inputs.seed);
            }
            if (request.inputs.steps !== undefined) {
                inputs.steps = toInt(request.inputs.steps);
            }
            if (request.inputs.cfg_scale !== undefined) {
                inputs.cfg = request.inputs.cfg_scale;
            }
            injected++;
        } else if (cls === 'EmptyLatentImage') {
            if (request.inputs.width !== undefined) {
                inputs.width = toInt(request.inputs.width);
            }
            if (request.inputs.height !== undefined) {
                inputs.height = toInt(request.inputs.height);
            }
            if (request.kind === 'video' && request.inputs.frame_count !== undefined) {
                inputs.batch_size = toInt(request.inputs.frame_count);
            }
            injected++;
        } else if (cls === 'CheckpointLoaderSimple') {
            if (overrides.checkpoint) {
                inputs.ckpt_name = overrides.checkpoint;
            }
            injected++;
        }
    }

    return { injected, warnings, analysis };
}

/**
 * Collect every model filename a workflow references, keyed by the input that
 * holds it. Used for preflight so a missing model is reported by name before
 * submission rather than as an opaque ComfyUI node error afterwards.
 */
export function collectModelReferences(
    workflow: ApiWorkflow,
): Array<{ nodeId: string; classType: string; input: string; value: string }> {
    const out: Array<{ nodeId: string; classType: string; input: string; value: string }> = [];
    for (const [nodeId, node] of Object.entries(workflow)) {
        const inputs = node?.inputs;
        if (!inputs) continue;
        for (const [input, value] of Object.entries(inputs)) {
            if (!input.endsWith('_name') || typeof value !== 'string') continue;
            // Not every `*_name` is a file on disk: `sampler_name` is an
            // enumerated algorithm, not something in models/. `type` on
            // DualCLIPLoader is a mode and is filtered by the `_name` suffix
            // already.
            if (NON_MODEL_NAME_INPUTS.has(input)) continue;
            out.push({
                nodeId,
                classType: node.class_type ?? '(unknown)',
                input,
                value,
            });
        }
    }
    return out;
}
