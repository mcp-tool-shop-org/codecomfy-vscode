---
title: Profiles
description: The six capability profiles, their presets, and what each one asks you for.
sidebar:
  order: 2
---

CodeComfy covers six capability profiles. One command reaches all of them:

**`Ctrl+Shift+P` → `CodeComfy: Run… (all profiles)`**

The flow is always the same — **profile → preset → inputs**.

## Inputs come from the preset, not the profile

The questions you get asked are derived from the chosen preset's *own workflow
graph*, not from a form hardcoded per profile.

That means two presets in the same profile can ask for different things. An
image-to-video preset asks you for a source image because its graph needs one;
a text-to-video preset sitting right next to it does not. Nothing is
special-cased — the graph is the source of truth.

The inputs you may be asked for:

| Input | When |
|-------|------|
| **Prompt** | The graph has a text-conditioning node |
| **Negative prompt** | The graph has a reachable negative-conditioning path |
| **Style tags** | Audio presets — genre, instrumentation, mood |
| **Edit instruction** | Image-edit presets |
| **Query** | Inference detect / segment — what to look for |
| **Source image** | Image-to-video, image-to-mesh, edit, and every inference preset |
| **Source audio** | Stem separation |

Files are uploaded to your ComfyUI server automatically. CodeComfy uses the
filename the **server** reports back, not the one it sent — with overwrite off,
ComfyUI renames on collision, so the returned name is the only reliable handle.

## Nothing is submitted before it can succeed

Before any graph is sent, CodeComfy checks it against your server:

- **Node types** — via `GET /object_info/{class}`. A missing node names the
  pack that provides it.
- **Model files** — via `GET /models/{folder}`. A missing model names the file
  and the folder it belongs in.

If anything is missing, nothing is submitted and no GPU time is spent. If your
ComfyUI is too old to list models, the model check is skipped rather than
reported as a failure — an old server should never look like a missing file.

---

## The profiles

### Image

Text-to-image, image editing, and ControlNet.

| Preset | Notes |
|--------|-------|
| Qwen txt2img (2512) | UNETLoader path, 16-channel latent |
| Qwen edit (2511) | Takes reference images into the edit encoder |
| ControlNet union — Qwen | Union ControlNet, optional core Canny preprocess |
| ControlNet union — SDXL | Same code path, SDXL stack |

### Video

Text- and image-to-video on real temporal models. These take **`length` in
frames**, not a batch of stills — the frame count is snapped to the legal
`4n + 1` grid before submission, because ComfyUI accepts an off-grid value
without complaint and the model then mishandles it.

| Preset | Notes |
|--------|-------|
| Hunyuan 1.5 i2v | Requires a start image |
| Hunyuan 1.5 720p | Higher resolution |
| Wan 14B | |
| LTX standard | |
| Mochi | |
| Core output | Ends in `CreateVideo` → `SaveVideo` — **no FFmpeg needed** |

Most video presets terminate in `VHS_VideoCombine`, which needs the Video
Helper Suite node pack. The core-output preset avoids that dependency entirely
and is encoded by the server.

### Audio

ACE-Step 1.5 text-to-music, plus stem separation.

| Preset | Notes |
|--------|-------|
| Music | Standard length |
| Music (long) | |
| Music (MP3) | MP3 rather than FLAC |
| Jingle | Short-form |
| Draft | Fast, low-step |
| Stem separation | Needs the audio-separation node pack and a source audio file |

Music presets take **style tags** rather than a prose prompt — genre,
instrumentation, timbre, mood.

### 3D

Hunyuan3D-2 image-to-mesh, exported as GLB. All core nodes.

| Preset | Notes |
|--------|-------|
| Draft | Fastest |
| Standard | |
| Detail | Highest quality |

Give it one source image; you get a `.glb` in `.codecomfy/outputs/`.

### Inference

Florence-2 image understanding. Needs the `comfyui-florence2` pack.

| Preset | Output |
|--------|--------|
| Caption | Short description |
| Detailed caption | |
| More detailed caption | |
| Tag | Tag list |
| Detect | Bounding boxes — takes a query |
| Segment | Segmentation mask image — takes a query |
| OCR | Text found in the image |

Most inference presets write their result as text; CodeComfy saves it as a
`.txt` alongside your other outputs so it is a real artifact, not just a log
line.

### Metadata

Read the workflow ComfyUI embeds in its output PNGs.
**This profile never contacts the server** — it is a local file read, so it
works with ComfyUI closed.

**`CodeComfy: Read Workflow from PNG`** opens the extracted graph in a new
editor tab. It prefers the `prompt` chunk (API format — the graph actually
submitted, and the one that can be re-submitted) over the `workflow` chunk
(editor format, which `/prompt` does not accept).

This is the fastest way to recover *exactly* what produced an image somebody
sent you.

---

## Where the workflows come from

CodeComfy does not author workflow graphs. The 27 reference workflows are
vendored from
[comfy-headless](https://github.com/mcp-tool-shop-org/comfy-headless), where
every node type is verified against the live ComfyUI catalog.

This matters more than it sounds. A wrong workflow graph does not raise an
error — it runs to completion and returns nothing. Keeping a second,
hand-maintained copy of that knowledge would be a silent-failure generator, so
maintainers sync it instead:

```bash
npm run kb:sync
```

`npm run kb:check` fails if the vendored copy has drifted from upstream.
