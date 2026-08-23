/**
 * CodeComfy Type Definitions (Minimal)
 *
 * Contracts for workspace storage, job execution, and artifact indexing.
 * Changes within a major version must be additive only.
 *
 * Path convention: All paths in persisted JSON are RELATIVE TO WORKSPACE ROOT.
 */

// =============================================================================
// Index Schema (v1.0)
// =============================================================================

export interface OutputIndex {
    schema_version: string;
    workspace_key: string;
    items: IndexedArtifact[];
}

/**
 * An artifact as it appears in the output index (gallery/TreeView).
 *
 * Fields TreeView requires writers to populate (see jobRouter.updateIndex):
 * - `provenance.prompt` — rendered as the primary label
 * - `provenance.preset_id` — TreeView groups by preset
 * - For `type === 'video'`: `meta.thumbnail_path`, `meta.duration_seconds`,
 *   `meta.fps` — needed for thumbnail preview and duration badge
 *
 * These are typed as optional for backward-compat with older index.json
 * files on disk, but writers MUST populate them on new entries. When any
 * of the required fields are missing on a written artifact, jobRouter
 * logs a WARN (it does NOT throw — leniency is intentional for old data).
 */
export interface IndexedArtifact {
    id: string;
    type: ArtifactType;
    /** Relative to workspace root */
    path: string;
    created_at: string;
    run_id: string;
    /** Optional extension point */
    meta?: ArtifactMeta;
    /** Optional extension point */
    provenance?: ArtifactProvenance;
}

export interface ArtifactMeta {
    size_bytes?: number;
    width?: number;
    height?: number;
    /** Video duration in seconds */
    duration_seconds?: number;
    /** Video/animation fps */
    fps?: number;
    /** MIME type */
    mime_type?: string;
    /** Thumbnail path (relative to workspace root) */
    thumbnail_path?: string;
    [key: string]: unknown;
}

/**
 * Provenance fields for a generated artifact.
 *
 * Shape note: several fields are declared optional here for backward-compat
 * with index.json files written by older versions, but the current writer
 * contract (enforced by JobRouter.updateIndex) requires `prompt` and
 * `preset_id` to be populated on every new entry. TreeView groups artifacts
 * by `preset_id` and renders `prompt` as the primary label.
 *
 * `checkpoint` is the effective `ckpt_name` after any `defaultCheckpoint`
 * config override is applied — populate this when known so the gallery
 * can show which model produced the artifact.
 *
 * The index signature keeps this type extensible for engine-specific fields.
 */
export interface ArtifactProvenance {
    prompt?: string;
    negative_prompt?: string;
    seed?: number;
    model?: string;
    steps?: number;
    cfg_scale?: number;
    /** TreeView groups by preset. Writers MUST populate this on new entries. */
    preset_id?: string;
    /** Effective ckpt_name after config overrides, when known. */
    checkpoint?: string;
    /** Extensible tail — keep open-map compatibility for engine-specific fields. */
    [key: string]: unknown;
}

// =============================================================================
// Job System Types
// =============================================================================

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';
/**
 * The six profiles CodeComfy can drive, matching the profile split in
 * `comfy-headless` (Image, Video, 3D, Inference, Metadata, Audio).
 *
 * `image` and `video` predate this and keep their meaning. `metadata` is
 * local-only — it reads provenance out of a PNG and never submits a graph —
 * so it is not a generation kind and does not appear here.
 */
export type GenerationKind = 'image' | 'video' | 'audio' | '3d' | 'inference';

/** What the caller provides (router assigns run_id) */
export interface JobRequestInput {
    kind: GenerationKind;
    preset_id: string;
    inputs: GenerationInputs;
}

/** Full request after router processes it */
export interface JobRequest extends JobRequestInput {
    run_id: string;
    workspace_path: string;
    created_at: string;
}

export interface GenerationInputs {
    prompt: string;
    negative_prompt?: string;
    seed?: number;
    width?: number;
    height?: number;
    steps?: number;
    cfg_scale?: number;
    /** Video: frames per second */
    fps?: number;
    /** Video: duration in seconds */
    duration_seconds?: number;
    /** Video: computed frame count (fps * duration) */
    frame_count?: number;
    /** Inference: what to look for (detect / segment). */
    query?: string;
    /**
     * Server-side filename of an uploaded source image, as returned by
     * `POST /upload/image`. Used by image-to-video, image-to-mesh, edit, and
     * every inference preset.
     */
    input_image?: string;
    /** Server-side filename of an uploaded source audio file. */
    input_audio?: string;
    [key: string]: unknown;
}

/** Run status (persisted as status.json) */
export interface JobRun {
    run_id: string;
    status: JobStatus;
    started_at?: string;
    ended_at?: string;
    error?: string;
    progress?: number;
}

/** Artifacts from a run (persisted as artifacts.json) */
export interface RunArtifacts {
    run_id: string;
    /** Paths are relative to workspace root */
    artifacts: Artifact[];
}

/**
 * What a workflow produced. Extended in 1.3.0 beyond image/video: ComfyUI
 * workflows also emit audio (`SaveAudioAdvanced`), meshes (`SaveGLB`), and
 * text (`SaveText`). Consumers that only understand image/video should treat
 * unknown kinds as opaque files rather than assuming they are images.
 */
export type ArtifactType = 'image' | 'video' | 'audio' | 'model3d' | 'text';

export interface Artifact {
    type: ArtifactType;
    /** Relative to workspace root */
    path: string;
    size_bytes?: number;
    meta?: Partial<ArtifactMeta>;
    provenance?: Partial<ArtifactProvenance>;
}

// =============================================================================
// Preset Types (Minimal)
// =============================================================================

export interface Preset {
    id: string;
    name: string;
    kind: GenerationKind;
    /**
     * Optional human-readable description. Rendered in QuickPick
     * labels and gallery detail views. Pure UI field — no runtime
     * behavior depends on it.
     */
    description?: string;
    defaults: Partial<GenerationInputs>;
    /** ComfyUI workflow JSON template */
    workflow?: Record<string, unknown>;
    /**
     * Model files this preset needs on the ComfyUI server, so a missing model
     * can be reported by name (with a download link) instead of surfacing as
     * an opaque ComfyUI node error after submission.
     *
     * Purely declarative — the workflow still carries the real filenames.
     */
    requires?: PresetRequirements;
}

export interface PresetRequiredModel {
    /** The workflow input holding this filename, e.g. `unet_name`. */
    input: string;
    /** Exact filename as it must appear in the loader's dropdown. */
    file: string;
    /** ComfyUI models/ subfolder the file belongs in, e.g. `diffusion_models`. */
    folder: string;
    /** Direct download URL, shown in the "model missing" message. */
    url?: string;
}

export interface PresetRequirements {
    /** Free-text provenance/licensing note shown in docs and QuickPick detail. */
    note?: string;
    models?: PresetRequiredModel[];
}

// =============================================================================
// Engine Interface
// =============================================================================

export interface GenerationResult {
    success: boolean;
    artifacts: Artifact[];
    error?: string;
}

/**
 * Fine-grained progress for the status bar, threaded engine → router → UI.
 *
 * Populated only when the ComfyUI event socket is available; on a polling
 * fallback the UI keeps its coarse per-status text.
 */
export interface ProgressDetail {
    /** Sampler step within the executing node. */
    stepCurrent?: number;
    stepTotal?: number;
    /** Frames downloaded so far (video frame-assembly path). */
    frameCurrent?: number;
    frameTotal?: number;
    phase?: 'generating' | 'polling' | 'downloading' | 'assembling';
}

export interface IGenerationEngine {
    readonly id: string;
    readonly name: string;
    isAvailable(): Promise<boolean>;
    /**
     * `onComplete` and `onProgress` are additive optional parameters — the
     * two-argument call remains valid, which keeps this a non-breaking
     * extension of the engine contract.
     */
    generate(
        request: JobRequest,
        preset: Preset,
        onComplete?: (result: GenerationResult, metadata: unknown) => void,
        onProgress?: (progress: {
            phase: 'generating';
            stepCurrent: number;
            stepTotal: number;
            node?: string;
        }) => void,
    ): Promise<GenerationResult>;
    cancel(): Promise<void>;
}

// =============================================================================
// Configuration
// =============================================================================

export interface CodeComfyConfig {
    nextGalleryPath?: string;
    comfyuiUrl: string;
    autoOpenGalleryOnComplete: boolean;
    ffmpegPath?: string;
    /**
     * Override the `ckpt_name` baked into the shipped HQ presets. If set and
     * non-empty, buildWorkflow() substitutes this value into every
     * `CheckpointLoaderSimple` node. Empty means "use the preset's
     * hard-coded value as-is" (backward-compatible default).
     */
    defaultCheckpoint?: string;
}

export const DEFAULT_CONFIG: CodeComfyConfig = {
    comfyuiUrl: 'http://127.0.0.1:8188',
    autoOpenGalleryOnComplete: true,
};

// =============================================================================
// Constants
// =============================================================================

export const INDEX_SCHEMA_VERSION = '1.0';
export const CODECOMFY_DIR = '.codecomfy';
export const OUTPUTS_DIR = 'outputs';
export const RUNS_DIR = 'runs';
export const INDEX_FILENAME = 'index.json';
