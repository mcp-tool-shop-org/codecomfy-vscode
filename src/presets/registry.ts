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
                if (preset.id && preset.kind) {
                    this.presets.set(preset.id, preset);
                } else if (logger) {
                    logger.warn(
                        `Preset "${file}" missing required fields (id/kind). Preset skipped.`,
                    );
                }
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
