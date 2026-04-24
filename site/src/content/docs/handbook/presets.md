---
title: User-Authored Presets
description: Drop any ComfyUI workflow JSON into .codecomfy/presets/ and surface it as a CodeComfy preset.
sidebar:
  order: 4
---

CodeComfy ships with two built-in presets (`hq-image` and `hq-video`), but you are not stuck with them. Any ComfyUI workflow JSON you drop into `.codecomfy/presets/` in your workspace becomes a first-class preset that appears in the generation commands.

## Where presets live

User-authored presets live at `.codecomfy/presets/*.json` in your workspace root. One file per preset. CodeComfy picks them up automatically on activation — no reload needed after you add the file.

```
your-workspace/
  .codecomfy/
    presets/
      my-fast-draft.json
      my-painterly-landscape.json
```

## How to create a preset

The quickest path is to start from a working HQ preset and edit from there.

1. Open the Command Palette (`Ctrl+Shift+P`).
2. Run **`CodeComfy: Create Preset from HQ Template`**.
3. Pick `image` or `video`. The template preset is written to `.codecomfy/presets/` with placeholders you can edit.
4. Adjust the fields (id, name, defaults, workflow). Save the file.

The preset appears in the next generation pick list.

You can also hand-author a preset from scratch. See the shape below.

## Preset shape

A preset is a single JSON object with the following fields:

| Field | Required | Type | Purpose |
|-------|----------|------|---------|
| `id` | yes | string | Unique identifier. Letters, digits, `_`, `-` only. |
| `name` | yes | string | Human-readable name shown in the QuickPick. |
| `description` | no | string | Optional one-liner rendered next to the name. |
| `kind` | yes | `"image"` or `"video"` | Determines which command surfaces the preset. |
| `defaults` | yes | object | Default input values (`width`, `height`, `steps`, `cfg_scale`, `fps` for video, etc). |
| `workflow` | no | object | ComfyUI workflow JSON — a node-id → node object mapping. |

`defaults` are merged with the inputs you provide at generation time. The user-provided prompt always wins over whatever is in `defaults`.

## The workflow field

The `workflow` object is a raw ComfyUI workflow JSON — the same shape you get from ComfyUI's **Save (API Format)** export. Each key is a node id; each value is an object with a `class_type` and an `inputs` map.

Reference: [ComfyUI workflow JSON docs](https://github.com/comfyanonymous/ComfyUI).

CodeComfy **auto-injects values** into the following node types so your prompt, seed, and dimensions flow through without you having to hard-code them:

| Node class_type | What gets injected |
|-----------------|--------------------|
| `CLIPTextEncode` | `text` (positive + negative prompt, by node wiring) |
| `KSampler` | `seed`, `steps`, `cfg`, when supplied |
| `EmptyLatentImage` | `width`, `height` |
| `CheckpointLoaderSimple` | `ckpt_name` (if `codecomfy.defaultCheckpoint` is set) |

Node types **outside this list** (e.g. `VAELoader`, `SaveImage`, custom nodes) are used as-authored — CodeComfy does not touch them. Put any checkpoint-specific, LoRA, or custom-node configuration into those untouched nodes.

## Example preset

A minimal text-to-image preset, 5 nodes:

```json
{
  "id": "my-fast-draft",
  "name": "My Fast Draft",
  "description": "Lower-step image preset for quick iteration.",
  "kind": "image",
  "defaults": {
    "width": 768,
    "height": 768,
    "steps": 15,
    "cfg_scale": 5.5
  },
  "workflow": {
    "1": {
      "class_type": "CheckpointLoaderSimple",
      "inputs": { "ckpt_name": "sd_xl_base_1.0.safetensors" }
    },
    "2": {
      "class_type": "CLIPTextEncode",
      "inputs": { "clip": ["1", 1], "text": "" }
    },
    "3": {
      "class_type": "EmptyLatentImage",
      "inputs": { "width": 768, "height": 768, "batch_size": 1 }
    },
    "4": {
      "class_type": "KSampler",
      "inputs": {
        "model": ["1", 0],
        "positive": ["2", 0],
        "negative": ["2", 0],
        "latent_image": ["3", 0],
        "seed": 0,
        "steps": 15,
        "cfg": 5.5,
        "sampler_name": "dpmpp_2m",
        "scheduler": "karras",
        "denoise": 1.0
      }
    },
    "5": {
      "class_type": "SaveImage",
      "inputs": { "images": ["4", 0], "filename_prefix": "codecomfy" }
    }
  }
}
```

The `CLIPTextEncode` `text` field is empty because CodeComfy fills it with your prompt at generation time.

## Validation

CodeComfy registers a JSON schema for `.codecomfy/presets/*.json` via the `jsonValidation` contribution. That means **VS Code shows errors inline while you are editing**:

- Missing required fields (`id`, `name`, `kind`, `defaults`) are flagged.
- Invalid `id` characters show a squiggle.
- Wrong `kind` values (`"audio"`, typos) show a dropdown of valid options.
- Node objects missing a `class_type` are flagged.

If the file validates in the editor, it will load at activation. If a required field is missing or malformed, the preset is skipped with a WARN in the CodeComfy output channel.

## Troubleshooting

**Preset does not appear in the QuickPick.** Check the CodeComfy output channel (`CodeComfy: Open Output Channel`) for a `preset-skip` WARN. Common causes: duplicate `id`, missing `kind`, or the JSON itself is invalid.

**Generation fails with "node type not supported".** The workflow contains a custom node that your ComfyUI install does not have. Install the custom node in ComfyUI or remove it from the preset.

**Checkpoint not found.** Either set `codecomfy.defaultCheckpoint` to a checkpoint you have, or edit the `ckpt_name` inside the preset's `CheckpointLoaderSimple` node directly.
