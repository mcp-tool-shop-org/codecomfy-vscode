/**
 * The six profiles.
 *
 * CodeComfy drives the same six capability profiles that `comfy-headless`
 * exposes headlessly — Image, Video, 3D, Inference, Metadata, Audio — but
 * interactively, from the editor. The workflow graphs are NOT authored here:
 * they are vendored from that repo's verified KB by `scripts/sync-kb.mjs`,
 * because a second hand-maintained copy would drift, and drift in a workflow
 * graph is silent (a graph runs green and returns nothing).
 *
 * What this module adds on top of the vendored graphs is the interactive
 * surface: which runtime inputs a given preset actually needs, derived from
 * the placeholder tokens present in its own graph rather than from a
 * hardcoded per-profile assumption.
 */

import { GenerationKind } from '../types';
import kbPresets from '../kb/presets.json';
import kbNodes from '../kb/nodes.json';

/** Profile identifiers. `metadata` is local-only — it submits no graph. */
export type ProfileId = 'image' | 'video' | 'audio' | '3d' | 'inference' | 'metadata';

export interface ProfileInfo {
    id: ProfileId;
    label: string;
    /** One-line description shown in the profile picker. */
    description: string;
    /** VS Code codicon id used in QuickPick items. */
    icon: string;
    /**
     * False for `metadata`, which reads provenance out of a local PNG and
     * never talks to `/prompt`.
     */
    submitsGraph: boolean;
}

export const PROFILES: readonly ProfileInfo[] = Object.freeze([
    {
        id: 'image',
        label: 'Image',
        description: 'Text-to-image, image edit, and ControlNet',
        icon: 'file-media',
        submitsGraph: true,
    },
    {
        id: 'video',
        label: 'Video',
        description: 'Text- and image-to-video on real temporal models',
        icon: 'device-camera-video',
        submitsGraph: true,
    },
    {
        id: 'audio',
        label: 'Audio',
        description: 'Text-to-music and stem separation',
        icon: 'unmute',
        submitsGraph: true,
    },
    {
        id: '3d',
        label: '3D',
        description: 'Image-to-mesh, exported as GLB',
        icon: 'symbol-structure',
        submitsGraph: true,
    },
    {
        id: 'inference',
        label: 'Inference',
        description: 'Caption, tag, detect, segment, and OCR an image',
        icon: 'search',
        submitsGraph: true,
    },
    {
        id: 'metadata',
        label: 'Metadata',
        description: 'Read the workflow embedded in a PNG and re-run it',
        icon: 'info',
        submitsGraph: false,
    },
]);

export function getProfile(id: ProfileId): ProfileInfo | undefined {
    return PROFILES.find((p) => p.id === id);
}

// =============================================================================
// Runtime inputs, derived from a graph's own placeholder tokens
// =============================================================================

/** What a placeholder token means for the interactive input flow. */
export interface InputDescriptor {
    /** The token as it appears in the vendored graph. */
    token: string;
    /** Which `GenerationInputs` field the collected value populates. */
    field: 'prompt' | 'negative_prompt' | 'query' | 'input_image' | 'input_audio';
    /** Prompt shown in the InputBox / file picker. */
    label: string;
    placeholder: string;
    /** True when the value is a local file that must be uploaded first. */
    isFile: boolean;
    /** Whether the run can proceed without it. */
    optional: boolean;
}

const INPUT_DESCRIPTORS: Readonly<Record<string, InputDescriptor>> = Object.freeze({
    PROMPT_TEXT: {
        token: 'PROMPT_TEXT',
        field: 'prompt',
        label: 'Prompt',
        placeholder: 'Describe what to generate',
        isFile: false,
        optional: false,
    },
    NEGATIVE_TEXT: {
        token: 'NEGATIVE_TEXT',
        field: 'negative_prompt',
        label: 'Negative prompt',
        placeholder: 'What to avoid (optional)',
        isFile: false,
        optional: true,
    },
    PROMPT_TAGS: {
        token: 'PROMPT_TAGS',
        field: 'prompt',
        label: 'Style tags',
        placeholder: 'e.g. lo-fi hip hop, mellow piano, rainy night',
        isFile: false,
        optional: false,
    },
    QUERY_TEXT: {
        token: 'QUERY_TEXT',
        field: 'query',
        label: 'Query',
        placeholder: 'What to look for, e.g. "a dog" or "street sign"',
        isFile: false,
        optional: false,
    },
    EDIT_INSTRUCTION: {
        token: 'EDIT_INSTRUCTION',
        field: 'prompt',
        label: 'Edit instruction',
        placeholder: 'e.g. make it night time, add a red scarf',
        isFile: false,
        optional: false,
    },
    'INPUT_IMAGE_REF.png': {
        token: 'INPUT_IMAGE_REF.png',
        field: 'input_image',
        label: 'Source image',
        placeholder: 'Pick an image from your workspace',
        isFile: true,
        optional: false,
    },
    'INPUT_AUDIO_REF.flac': {
        token: 'INPUT_AUDIO_REF.flac',
        field: 'input_audio',
        label: 'Source audio',
        placeholder: 'Pick an audio file from your workspace',
        isFile: true,
        optional: false,
    },
});

// =============================================================================
// Vendored preset access
// =============================================================================

export interface KbModelRef {
    nodeId: string;
    classType: string;
    input: string;
    file: string;
}

export interface KbPreset {
    id: string;
    name: string;
    profile: ProfileId;
    kind: GenerationKind;
    description?: string;
    placeholders: string[];
    history_output_keys: string[];
    requires: {
        class_types: string[];
        packs: string[];
        models: KbModelRef[];
    };
    workflow: Record<string, unknown>;
}

interface KbPresetsFile {
    source: string;
    source_version: string;
    verified_against_catalog: string | null;
    presets: KbPreset[];
}

interface KbNodesFile {
    source_version: string;
    history_output_keys: Record<string, string[]>;
    output_node_classes: string[];
    packs: Record<string, Record<string, unknown>>;
}

const PRESETS = kbPresets as unknown as KbPresetsFile;
const NODES = kbNodes as unknown as KbNodesFile;

/** Provenance of the vendored KB, for the output-channel header and docs. */
export function kbProvenance(): {
    source: string;
    version: string;
    verifiedAgainstCatalog: string | null;
    presetCount: number;
} {
    return {
        source: PRESETS.source,
        version: PRESETS.source_version,
        verifiedAgainstCatalog: PRESETS.verified_against_catalog,
        presetCount: PRESETS.presets.length,
    };
}

export function allKbPresets(): readonly KbPreset[] {
    return PRESETS.presets;
}

export function kbPresetsForProfile(profile: ProfileId): KbPreset[] {
    return PRESETS.presets.filter((p) => p.profile === profile);
}

export function findKbPreset(id: string): KbPreset | undefined {
    return PRESETS.presets.find((p) => p.id === id);
}

/** Install metadata for a node pack, used in the "missing pack" message. */
export function packInfo(pack: string): Record<string, unknown> | undefined {
    return NODES.packs[pack];
}

/**
 * The ordered set of runtime inputs a preset needs, derived from the
 * placeholder tokens present in its own graph.
 *
 * This is why the interactive flow does not need a per-profile hardcoded form:
 * an image-to-video preset asks for a source image because its graph contains
 * `INPUT_IMAGE_REF.png`, while a text-to-video preset in the same profile does
 * not.
 */
export function requiredInputs(preset: KbPreset): InputDescriptor[] {
    const seen = new Set<string>();
    const out: InputDescriptor[] = [];
    for (const token of preset.placeholders) {
        const descriptor = INPUT_DESCRIPTORS[token];
        if (!descriptor || seen.has(descriptor.field)) continue;
        seen.add(descriptor.field);
        out.push(descriptor);
    }
    // Stable, sensible order: files first (the user picks before typing),
    // then required text, then optional text.
    return out.sort((a, b) => {
        if (a.isFile !== b.isFile) return a.isFile ? -1 : 1;
        if (a.optional !== b.optional) return a.optional ? 1 : -1;
        return 0;
    });
}

/**
 * Convert a vendored KB preset into the `Preset` envelope the engine consumes.
 * `defaults` stays empty — the reference graphs already carry the verified
 * sampler recipe for their model, and overriding it from generic defaults is
 * how a tuned template gets silently detuned.
 */
export function toEnginePreset(preset: KbPreset): {
    id: string;
    name: string;
    kind: GenerationKind;
    description?: string;
    defaults: Record<string, never>;
    workflow: Record<string, unknown>;
} {
    return {
        id: preset.id,
        name: preset.name,
        kind: preset.kind,
        description: preset.description,
        defaults: {},
        workflow: preset.workflow,
    };
}
