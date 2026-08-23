/**
 * Preflight — check a preset against the server BEFORE spending a run on it.
 *
 * Without this, a preset that references a node the user has not installed, or
 * a model file they have not downloaded, fails at submit time as an opaque
 * ComfyUI node error. Both are entirely knowable in advance:
 *
 *   • `GET /object_info/{class_type}` says whether the server can execute a
 *     node at all. Missing classes resolve to the pack that provides them via
 *     the vendored node registry.
 *   • Every loader's model input is a COMBO whose options ARE the live folder
 *     listing, so a referenced filename can be checked against it.
 *
 * Both routes are cheap single-node lookups rather than the multi-megabyte
 * full `/object_info` payload.
 *
 * Verified against ComfyUI 0.23.0: `/object_info/{node_class}` (server.py:769),
 * `/models/{folder}` (server.py:336). Older servers may lack `/models`, so the
 * model check degrades to "skipped" rather than failing the preflight.
 */

import { KbPreset, packInfo } from '../profiles/registry';

export interface MissingNode {
    classType: string;
    /** Pack that provides it, when known. */
    pack?: string;
    /** Install metadata from the vendored registry, when known. */
    packInfo?: Record<string, unknown>;
}

export interface MissingModel {
    file: string;
    classType: string;
    input: string;
    /** Folder the file belongs in, inferred from the loader input name. */
    folder?: string;
}

export interface PreflightResult {
    ok: boolean;
    missingNodes: MissingNode[];
    missingModels: MissingModel[];
    /** Checks that could not be performed (e.g. server too old for /models). */
    skipped: string[];
    /** A ready-to-show, actionable message. Empty when `ok`. */
    message: string;
}

/**
 * Model folder for each known loader input. Mirrors ComfyUI's
 * `folder_paths` naming; used to tell the user where to put a file and to pick
 * the right `/models/{folder}` listing.
 */
const INPUT_TO_FOLDER: Readonly<Record<string, string>> = Object.freeze({
    ckpt_name: 'checkpoints',
    unet_name: 'diffusion_models',
    lora_name: 'loras',
    vae_name: 'vae',
    clip_name: 'text_encoders',
    clip_name1: 'text_encoders',
    clip_name2: 'text_encoders',
    control_net_name: 'controlnet',
    style_model_name: 'style_models',
    gligen_name: 'gligen',
    model_name: 'upscale_models',
});

export interface PreflightDeps {
    /** Resolves to true when the server can execute this class. */
    hasClass(classType: string): Promise<boolean>;
    /**
     * Lists filenames in a model folder, or null when the server does not
     * support the lookup (in which case the model check is skipped).
     */
    listModels(folder: string): Promise<string[] | null>;
}

/**
 * Run preflight for one preset.
 *
 * Node checks run first: if a class is missing there is no point asking the
 * server about a model that only that node would have loaded.
 */
export async function preflightPreset(
    preset: KbPreset,
    deps: PreflightDeps,
): Promise<PreflightResult> {
    const missingNodes: MissingNode[] = [];
    const missingModels: MissingModel[] = [];
    const skipped: string[] = [];

    // --- nodes ---------------------------------------------------------
    const classTypes = [...new Set(preset.requires.class_types)];
    const presence = await Promise.all(
        classTypes.map(async (c) => [c, await deps.hasClass(c)] as const),
    );
    for (const [classType, present] of presence) {
        if (present) continue;
        const pack = preset.requires.packs.find((p) => {
            const info = packInfo(p);
            const nodes = info?.nodes;
            return Array.isArray(nodes) ? nodes.includes(classType) : false;
        }) ?? preset.requires.packs[0];
        missingNodes.push({
            classType,
            pack,
            packInfo: pack ? packInfo(pack) : undefined,
        });
    }

    // --- models --------------------------------------------------------
    const byFolder = new Map<string, typeof preset.requires.models>();
    for (const ref of preset.requires.models) {
        const folder = INPUT_TO_FOLDER[ref.input];
        if (!folder) continue;
        const list = byFolder.get(folder) ?? [];
        list.push(ref);
        byFolder.set(folder, list);
    }

    for (const [folder, refs] of byFolder) {
        const available = await deps.listModels(folder);
        if (available === null) {
            skipped.push(`model check for ${folder} (server did not provide a listing)`);
            continue;
        }
        // COMBO values are exact strings, and a subfolder-qualified entry is a
        // legitimate match for a bare filename the graph names.
        const normalized = new Set(available.map((a) => a.replace(/\\/g, '/')));
        for (const ref of refs) {
            const wanted = ref.file.replace(/\\/g, '/');
            const found =
                normalized.has(wanted) ||
                [...normalized].some((a) => a.endsWith(`/${wanted}`));
            if (!found) {
                missingModels.push({
                    file: ref.file,
                    classType: ref.classType,
                    input: ref.input,
                    folder,
                });
            }
        }
    }

    const ok = missingNodes.length === 0 && missingModels.length === 0;
    return {
        ok,
        missingNodes,
        missingModels,
        skipped,
        message: ok ? '' : formatMessage(preset, missingNodes, missingModels),
    };
}

function formatMessage(
    preset: KbPreset,
    missingNodes: MissingNode[],
    missingModels: MissingModel[],
): string {
    const lines: string[] = [`"${preset.name}" cannot run on this ComfyUI server yet.`];

    if (missingNodes.length > 0) {
        lines.push('', 'Missing nodes:');
        const byPack = new Map<string, string[]>();
        for (const n of missingNodes) {
            const key = n.pack ?? '(unknown pack)';
            byPack.set(key, [...(byPack.get(key) ?? []), n.classType]);
        }
        for (const [pack, classes] of byPack) {
            lines.push(`  • ${classes.join(', ')} — install the "${pack}" node pack`);
            const url = missingNodes.find((n) => n.pack === pack)?.packInfo?.url;
            if (typeof url === 'string') lines.push(`      ${url}`);
        }
    }

    if (missingModels.length > 0) {
        lines.push('', 'Missing models:');
        for (const m of missingModels) {
            lines.push(`  • ${m.file} — put it in ComfyUI/models/${m.folder}/`);
        }
    }

    lines.push(
        '',
        'Nothing was submitted, so no GPU time was spent. Install what is listed ' +
        'above and run the command again.',
    );
    return lines.join('\n');
}
