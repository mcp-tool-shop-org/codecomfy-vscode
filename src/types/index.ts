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

export interface IndexedArtifact {
    id: string;
    type: 'image' | 'video';
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

export interface ArtifactProvenance {
    prompt?: string;
    negative_prompt?: string;
    seed?: number;
    model?: string;
    steps?: number;
    cfg_scale?: number;
    preset_id?: string;
    [key: string]: unknown;
}

// =============================================================================
// Job System Types
// =============================================================================

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';
export type GenerationKind = 'image' | 'video';

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

export interface Artifact {
    type: 'image' | 'video';
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
    defaults: Partial<GenerationInputs>;
    /** ComfyUI workflow JSON template */
    workflow?: Record<string, unknown>;
}

// =============================================================================
// Engine Interface
// =============================================================================

export interface GenerationResult {
    success: boolean;
    artifacts: Artifact[];
    error?: string;
}

export interface IGenerationEngine {
    readonly id: string;
    readonly name: string;
    isAvailable(): Promise<boolean>;
    generate(request: JobRequest, preset: Preset): Promise<GenerationResult>;
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
