/**
 * Preset Registry
 *
 * Loads and provides access to generation presets.
 */

import * as path from 'path';
import * as fs from 'fs';
import { Preset } from '../types';

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
     */
    loadFromDirectory(dir: string): void {
        if (!fs.existsSync(dir)) {
            return;
        }

        const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
        for (const file of files) {
            try {
                const content = fs.readFileSync(path.join(dir, file), 'utf-8');
                const preset = JSON.parse(content) as Preset;
                if (preset.id && preset.kind) {
                    this.presets.set(preset.id, preset);
                }
            } catch {
                // Skip invalid presets
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
