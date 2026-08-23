/**
 * The retrieval contract — which `/history` output key each terminator writes,
 * and what kind of artifact the file it points at actually is.
 *
 * ComfyUI does not use a uniform key for saved files. The mapping below is the
 * same one `comfy-headless` publishes in `kb/nodes.json`
 * (`history_output_keys`), independently confirmed here against ComfyUI 0.23.0
 * source — `PreviewVideo.as_dict()` returns `{"images": …, "animated": …}`,
 * which is why `SaveVideo` shares the `images` key with `SaveImage`.
 *
 * Getting this wrong is silent: a graph runs green, `/history` returns a
 * populated `outputs` object, and the client finds nothing because it looked
 * under the wrong key. Versions through 1.2.0 read only `images`, which
 * discarded the output of every audio, 3D, inference, and VHS-terminated video
 * workflow.
 */

import {
    FILE_OUTPUT_KEYS,
    FileOutputKey,
    ValidatedFileRef,
    ValidatedHistoryEntry,
} from './comfyValidation';

/** The kinds of artifact a workflow can produce. */
export type ArtifactKind = 'image' | 'video' | 'audio' | 'model3d' | 'text';

/**
 * `/history` output keys written by each known terminator class.
 *
 * Mirrors `comfy-headless` `kb/nodes.json → history_output_keys`. Used for
 * preflight ("this preset terminates in X, so expect key Y") and for the
 * "ran green but produced nothing" diagnostic.
 */
export const TERMINATOR_OUTPUT_KEYS: Readonly<Record<string, readonly string[]>> =
    Object.freeze({
        SaveImage: ['images'],
        SaveVideo: ['images'],
        SaveAnimatedWEBP: ['images'],
        SaveAnimatedPNG: ['images'],
        SaveWEBM: ['images'],
        VHS_VideoCombine: ['gifs'],
        SaveAudioAdvanced: ['audio'],
        SaveGLB: ['3d'],
        SaveText: ['text', 'files'],
    });

/** File extensions that identify each artifact kind. */
const EXTENSION_KIND: Array<{ re: RegExp; kind: ArtifactKind }> = [
    { re: /\.(mp4|webm|mkv|mov|avi|m4v|gif)$/i, kind: 'video' },
    { re: /\.(flac|wav|mp3|ogg|opus|m4a)$/i, kind: 'audio' },
    { re: /\.(glb|gltf|obj|ply|stl|fbx|usdz)$/i, kind: 'model3d' },
    { re: /\.(txt|json|md|csv)$/i, kind: 'text' },
    { re: /\.(png|jpg|jpeg|webp|bmp|tiff)$/i, kind: 'image' },
];

/**
 * Default artifact kind per output key, used when the extension is unknown.
 * `images` deliberately falls back to `image` — a `SaveVideo` result carries a
 * container extension and is caught by `EXTENSION_KIND` before reaching here.
 */
const KEY_DEFAULT_KIND: Record<FileOutputKey, ArtifactKind> = {
    images: 'image',
    gifs: 'video',
    audio: 'audio',
    '3d': 'model3d',
    files: 'text',
};

/**
 * Classify one saved file. The extension wins over the key it arrived under,
 * because `images` legitimately carries both stills and video containers.
 */
export function classifyArtifact(filename: string, key: FileOutputKey): ArtifactKind {
    for (const { re, kind } of EXTENSION_KIND) {
        if (re.test(filename)) return kind;
    }
    return KEY_DEFAULT_KIND[key];
}

export interface RetrievedRef extends ValidatedFileRef {
    /** The `/history` output key this reference arrived under. */
    key: FileOutputKey;
    /** The node that produced it. */
    nodeId: string;
    /** What kind of file it is. */
    kind: ArtifactKind;
}

export interface RetrievalResult {
    /** Every downloadable file reference across every output key. */
    refs: RetrievedRef[];
    /** Inline strings from `SaveText`, keyed by node id. */
    inlineText: Array<{ nodeId: string; text: string }>;
    /** Output keys that were actually present, for diagnostics. */
    keysSeen: string[];
}

/**
 * Walk a validated history entry and collect every artifact reference it
 * carries, regardless of which key the producing node used.
 */
export function collectOutputs(history: ValidatedHistoryEntry): RetrievalResult {
    const refs: RetrievedRef[] = [];
    const inlineText: Array<{ nodeId: string; text: string }> = [];
    const keysSeen = new Set<string>();

    for (const [nodeId, nodeOutput] of Object.entries(history.outputs)) {
        for (const key of FILE_OUTPUT_KEYS) {
            const list = nodeOutput[key];
            if (!list || list.length === 0) continue;
            keysSeen.add(key);
            for (const ref of list) {
                refs.push({
                    ...ref,
                    key,
                    nodeId,
                    kind: classifyArtifact(ref.filename, key),
                });
            }
        }

        if (nodeOutput.text && nodeOutput.text.length > 0) {
            keysSeen.add('text');
            for (const text of nodeOutput.text) {
                inlineText.push({ nodeId, text });
            }
        }
    }

    // Stable order so runs are reproducible and frame sequences stay in order.
    refs.sort((a, b) => a.filename.localeCompare(b.filename));

    return { refs, inlineText, keysSeen: Array.from(keysSeen) };
}

/**
 * True when the collected references look like a frame sequence needing local
 * assembly, rather than a container the server already muxed.
 *
 * A single `video`-kind file is a finished container. Many `image`-kind files
 * from one node are frames.
 */
export function isFrameSequence(refs: RetrievedRef[]): boolean {
    if (refs.some((r) => r.kind === 'video')) return false;
    return refs.filter((r) => r.kind === 'image').length > 1;
}

/**
 * Diagnostic for the "ran green but produced nothing" case: names the keys we
 * looked under and what the preset's terminators were expected to write.
 */
export function explainEmptyOutputs(classTypes: string[]): string {
    const terminators = classTypes.filter((c) => c in TERMINATOR_OUTPUT_KEYS);
    if (terminators.length === 0) {
        return (
            'The workflow completed but produced no outputs, and it contains no ' +
            'recognised save node. A graph whose data does not terminate in an ' +
            'output node runs successfully and returns nothing — add a save node ' +
            `(one of: ${Object.keys(TERMINATOR_OUTPUT_KEYS).join(', ')}).`
        );
    }
    const expected = terminators
        .map((t) => `${t} → ${TERMINATOR_OUTPUT_KEYS[t].join(', ')}`)
        .join('; ');
    return (
        'The workflow completed but no outputs were returned. Expected ' +
        `${expected}. If the run looked successful in ComfyUI, the save node may ` +
        'not be connected to the branch that produced the result.'
    );
}

/** Fallback file extension when a reference carries none. */
export function defaultExtensionFor(kind: ArtifactKind): string {
    switch (kind) {
        case 'video': return '.mp4';
        case 'audio': return '.flac';
        case 'model3d': return '.glb';
        case 'text': return '.txt';
        default: return '.png';
    }
}
