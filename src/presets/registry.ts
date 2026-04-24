/**
 * Preset Registry
 *
 * Loads and provides access to generation presets.
 */

import * as path from 'path';
import * as fs from 'fs';
import { Preset } from '../types';
import { Logger } from '../logging/logger';

// Import presets (bundled with extension)
import hqImagePreset from './hq-image.json';
import hqVideoPreset from './hq-video.json';

const BUNDLED_PRESETS: Preset[] = [hqImagePreset as Preset, hqVideoPreset as Preset];

/**
 * FT-027: Lightweight workflow shape guard for user-authored presets.
 *
 * Returns `null` when the shape is acceptable, otherwise a short human-
 * readable error describing the first problem found. This is NOT a full
 * ComfyUI workflow validator — it only catches the cheap, load-time
 * mistakes that otherwise surface as cryptic errors at generation:
 *
 *   - workflow is missing / not an object / empty
 *   - at least one node value is not an object
 *   - a node is missing `class_type` (string) or `inputs` (object)
 *
 * Presets without a `workflow` field are accepted: the bundled HQ
 * presets always ship one, but a user-authored preset that only
 * overrides `defaults` and inherits workflow elsewhere is a plausible
 * future shape. Only reject `workflow` when it is PRESENT and broken.
 */
function validateWorkflowShape(preset: Preset): string | null {
    if (preset.workflow === undefined) {
        return null;
    }
    if (preset.workflow === null || typeof preset.workflow !== 'object' || Array.isArray(preset.workflow)) {
        return 'workflow must be a JSON object';
    }
    const nodeIds = Object.keys(preset.workflow);
    if (nodeIds.length === 0) {
        return 'workflow has no nodes';
    }
    for (const nodeId of nodeIds) {
        const node = (preset.workflow as Record<string, unknown>)[nodeId];
        if (!node || typeof node !== 'object' || Array.isArray(node)) {
            return `node "${nodeId}" is not an object`;
        }
        const n = node as Record<string, unknown>;
        if (typeof n.class_type !== 'string' || n.class_type.length === 0) {
            return `node "${nodeId}" is missing a string "class_type"`;
        }
        if (!n.inputs || typeof n.inputs !== 'object' || Array.isArray(n.inputs)) {
            return `node "${nodeId}" is missing an "inputs" object`;
        }
    }
    return null;
}

export class PresetRegistry {
    private presets: Map<string, Preset> = new Map();

    constructor() {
        // Load bundled presets
        for (const preset of BUNDLED_PRESETS) {
            this.presets.set(preset.id, preset);
        }
    }

    /**
     * Get a preset by ID.
     */
    get(id: string): Preset | undefined {
        return this.presets.get(id);
    }

    /**
     * List all available presets.
     */
    list(): Preset[] {
        return Array.from(this.presets.values());
    }

    /**
     * List presets by kind.
     */
    listByKind(kind: 'image' | 'video'): Preset[] {
        return this.list().filter((p) => p.kind === kind);
    }

    /**
     * Load additional presets from a directory.
     *
     * Malformed preset JSON is skipped, but when a logger is provided
     * the user gets a WARN line naming the file and parse error so
     * they can find and fix it instead of silently losing the preset.
     *
     * FT-027: Also runs a lightweight shape guard on `workflow` so broken
     * user-authored presets are surfaced at load time (WARN) instead of
     * failing later with a cryptic ComfyUI error during generation. The
     * guard is intentionally code-side only — ci-docs ships a full JSON
     * Schema separately; we don't pull in a schema library for this.
     */
    loadFromDirectory(dir: string, logger?: Logger): void {
        if (!fs.existsSync(dir)) {
            return;
        }

        const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
        for (const file of files) {
            const fullPath = path.join(dir, file);
            try {
                const content = fs.readFileSync(fullPath, 'utf-8');
                const preset = JSON.parse(content) as Preset;
                if (!preset.id || !preset.kind) {
                    if (logger) {
                        logger.warn(
                            `Preset "${file}" missing required fields (id/kind). Preset skipped.`,
                        );
                    }
                    continue;
                }
                const shapeError = validateWorkflowShape(preset);
                if (shapeError) {
                    if (logger) {
                        logger.warn(
                            `Preset "${file}" has invalid workflow shape: ${shapeError}. Preset skipped.`,
                        );
                    }
                    continue;
                }
                this.presets.set(preset.id, preset);
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                if (logger) {
                    logger.warn(
                        `Preset "${file}" failed to load: ${message}. Preset skipped.`,
                    );
                }
            }
        }
    }
}

// Singleton instance
let instance: PresetRegistry | null = null;

export function getPresetRegistry(): PresetRegistry {
    if (!instance) {
        instance = new PresetRegistry();
    }
    return instance;
}
