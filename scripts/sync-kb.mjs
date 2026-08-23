#!/usr/bin/env node
/**
 * Vendor the verified workflow knowledge base from `comfy-headless` into
 * CodeComfy as a preset library.
 *
 * WHY THIS EXISTS
 * ---------------
 * `comfy-headless` (mcp-tool-shop-org/comfy-headless) publishes an in-repo KB
 * at `kb/`: runnable API-format reference graphs for six profiles, every
 * `class_type` verified against the live ComfyUI catalog, plus the node/pack
 * provenance and the `/history` retrieval contract. Hand-maintaining a second
 * copy of that knowledge in TypeScript would guarantee drift, and drift here
 * is silent — a graph runs green and returns nothing.
 *
 * So CodeComfy does not author workflows. It vendors them, and this script is
 * the only writer of `src/kb/`.
 *
 * USAGE (maintainer task, not part of the build)
 * ----------------------------------------------
 *   node scripts/sync-kb.mjs [--from <path-to-comfy-headless>] [--check]
 *
 *   --from    Path to a comfy-headless checkout. Defaults to a sibling
 *             directory next to this repo.
 *   --check   Verify the vendored copy is current without writing. Exits 1 on
 *             drift, so CI can fail when the two repos diverge.
 *
 * The generated files carry a `source_version` so a stale vendor is visible.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const OUT_DIR = path.join(REPO, 'src', 'kb');

/** Placeholder tokens the reference graphs use for runtime values. */
const PLACEHOLDERS = {
    PROMPT_TEXT: 'prompt',
    NEGATIVE_TEXT: 'negative_prompt',
    PROMPT_TAGS: 'prompt',
    QUERY_TEXT: 'query',
    EDIT_INSTRUCTION: 'prompt',
    'INPUT_IMAGE_REF.png': 'input_image',
    'INPUT_AUDIO_REF.flac': 'input_audio',
};

/** Profile inferred from the KB workflow id prefix. */
const PROFILE_BY_PREFIX = {
    image: 'image',
    video: 'video',
    audio: 'audio',
    '3d': '3d',
    inference: 'inference',
};

function parseArgs(argv) {
    const out = { check: false, from: null };
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--check') out.check = true;
        else if (argv[i] === '--from') out.from = argv[++i];
    }
    return out;
}

function resolveSource(explicit) {
    const candidates = explicit
        ? [explicit]
        : [
            path.resolve(REPO, '..', 'comfy-headless'),
            path.resolve(REPO, '..', '..', 'comfy-headless'),
        ];
    for (const c of candidates) {
        if (fs.existsSync(path.join(c, 'kb', 'index.json'))) return c;
    }
    throw new Error(
        'Could not find a comfy-headless checkout with kb/index.json. ' +
        `Tried:\n  ${candidates.join('\n  ')}\n` +
        'Pass one explicitly with --from <path>.',
    );
}

/** Human-readable name from a KB workflow id. */
function titleFor(id) {
    return id
        .split('_')
        .map((w) => (/^\d/.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
        .join(' ');
}

/** Which placeholder tokens appear anywhere in a graph. */
function findPlaceholders(graph) {
    const serialized = JSON.stringify(graph);
    return Object.keys(PLACEHOLDERS).filter((token) => serialized.includes(token));
}

/**
 * Collect the model filenames a graph references, so preflight can name a
 * missing model instead of surfacing an opaque node error.
 */
function collectModels(graph) {
    const models = [];
    for (const [nodeId, node] of Object.entries(graph)) {
        const inputs = node?.inputs ?? {};
        for (const [input, value] of Object.entries(inputs)) {
            if (!input.endsWith('_name') || typeof value !== 'string') continue;
            if (input === 'sampler_name') continue;
            models.push({ nodeId, classType: node.class_type, input, file: value });
        }
    }
    return models;
}

function build(sourceRoot) {
    const kbDir = path.join(sourceRoot, 'kb');
    const index = JSON.parse(fs.readFileSync(path.join(kbDir, 'index.json'), 'utf8'));
    const nodes = JSON.parse(fs.readFileSync(path.join(kbDir, 'nodes.json'), 'utf8'));

    const workflowDir = path.join(kbDir, 'workflows');
    const files = fs.readdirSync(workflowDir).filter((f) => f.endsWith('.json')).sort();

    const presets = [];
    for (const file of files) {
        const wf = JSON.parse(fs.readFileSync(path.join(workflowDir, file), 'utf8'));
        const id = wf.id ?? path.basename(file, '.json');
        const prefix = id.split('_')[0];
        const profile = PROFILE_BY_PREFIX[prefix];
        if (!profile) {
            console.warn(`  ! skipping ${id} — unknown profile prefix "${prefix}"`);
            continue;
        }

        const graph = wf.graph ?? {};
        const classTypes = wf.class_types ?? [
            ...new Set(Object.values(graph).map((n) => n?.class_type).filter(Boolean)),
        ];

        // Non-core class_types, resolved to the pack that provides them.
        const packs = [];
        for (const cls of classTypes) {
            const pack = nodes.pack_nodes?.[cls];
            if (pack && !packs.includes(pack)) packs.push(pack);
        }

        presets.push({
            id,
            name: titleFor(id),
            profile,
            kind: profile,
            description: (wf.notes ?? []).join(' ') || undefined,
            placeholders: findPlaceholders(graph),
            history_output_keys: wf.history_output_keys ?? [],
            requires: {
                class_types: classTypes,
                packs,
                models: collectModels(graph),
            },
            workflow: graph,
        });
    }

    const packMeta = {};
    for (const preset of presets) {
        for (const pack of preset.requires.packs) {
            if (!packMeta[pack]) packMeta[pack] = nodes.packs?.[pack] ?? {};
        }
    }

    return {
        presets: {
            _generated_by: 'scripts/sync-kb.mjs — do not hand-edit',
            source: 'mcp-tool-shop-org/comfy-headless',
            source_version: index.package_version ?? 'unknown',
            kb_version: index.kb_version ?? 'unknown',
            verified_against_catalog: index.verified_against_catalog ?? null,
            presets,
        },
        nodes: {
            _generated_by: 'scripts/sync-kb.mjs — do not hand-edit',
            source_version: index.package_version ?? 'unknown',
            history_output_keys: nodes.history_output_keys ?? {},
            output_node_classes: nodes.output_node_classes ?? [],
            packs: packMeta,
        },
    };
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    const sourceRoot = resolveSource(args.from);
    console.log(`Source: ${sourceRoot}`);

    const built = build(sourceRoot);
    const targets = [
        { file: path.join(OUT_DIR, 'presets.json'), data: built.presets },
        { file: path.join(OUT_DIR, 'nodes.json'), data: built.nodes },
    ];

    let drifted = false;
    for (const { file, data } of targets) {
        const next = JSON.stringify(data, null, 2) + '\n';
        const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
        if (current === next) {
            console.log(`  = ${path.relative(REPO, file)} (current)`);
            continue;
        }
        drifted = true;
        if (args.check) {
            console.error(`  ! ${path.relative(REPO, file)} is STALE`);
        } else {
            fs.mkdirSync(path.dirname(file), { recursive: true });
            fs.writeFileSync(file, next);
            console.log(`  + ${path.relative(REPO, file)} written`);
        }
    }

    const byProfile = {};
    for (const p of built.presets.presets) {
        byProfile[p.profile] = (byProfile[p.profile] ?? 0) + 1;
    }
    console.log(
        `\n${built.presets.presets.length} presets from comfy-headless ` +
        `v${built.presets.source_version}: ` +
        Object.entries(byProfile).map(([k, v]) => `${k}=${v}`).join(' '),
    );

    if (args.check && drifted) {
        console.error('\nVendored KB is stale — run: node scripts/sync-kb.mjs');
        process.exit(1);
    }
}

main();
