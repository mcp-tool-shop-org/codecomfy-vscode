---
title: Usage Guide
description: Daily workflow patterns, prompt strategies, output management, and run history for CodeComfy.
sidebar:
  order: 3
---

This page covers the day-to-day workflows you will use once CodeComfy is installed and connected to your ComfyUI server.

## Commands

CodeComfy registers five commands in the VS Code Command Palette (`Ctrl+Shift+P`):

| Command | What it does |
|---------|-------------|
| `CodeComfy: Generate Image (HQ)` | Submit a text prompt and generate a single 1024x1024 image. |
| `CodeComfy: Generate Video (HQ)` | Submit a text prompt and generate a short video (2, 4, or 8 seconds at 24 fps). |
| `CodeComfy: Cancel Generation` | Interrupt a running generation. Sends an interrupt signal to ComfyUI and cleans up partial files. |
| `CodeComfy: Open Gallery` | Launch the NextGallery companion viewer, passing it the current workspace path. |
| `CodeComfy: Open Output Channel` | Show the CodeComfy log panel where structured generation logs appear. |

## Image generation workflow

1. Open the Command Palette and run **CodeComfy: Generate Image (HQ)**.
2. Enter your prompt. Describe the image you want — be specific about style, subject, and lighting. Example: `a cozy cabin in a snowy forest, warm window light, photorealistic, 8k`.
3. Optionally enter a negative prompt. This tells the model what to avoid. Common values: `blurry, distorted, low quality, text, watermark`.
4. Optionally enter a seed. Seeds make generation reproducible — the same prompt and seed produce the same image. Leave blank for a random seed.
5. Watch the status bar. It cycles through **Queued**, **Generating**, and **Done** (or **Failed**).

The HQ Image preset uses the following defaults:

| Parameter | Value |
|-----------|-------|
| Resolution | 1024 x 1024 |
| Steps | 30 |
| CFG Scale | 7.0 |
| Sampler | DPM++ 2M Karras |

## Video generation workflow

1. Run **CodeComfy: Generate Video (HQ)** from the Command Palette.
2. Enter a prompt and optional negative prompt (same as image generation).
3. Choose a duration: 2 seconds, 4 seconds (default), or 8 seconds.
4. The extension generates all frames as individual images, downloads them, and then assembles them into an MP4 using FFmpeg.

The HQ Video preset defaults:

| Parameter | Value |
|-----------|-------|
| Resolution | 1024 x 576 |
| Steps | 25 |
| CFG Scale | 7.0 |
| FPS | 24 |
| Sampler | DPM++ 2M Karras |

Video generation takes significantly longer than images because ComfyUI must produce many frames and then FFmpeg assembles them. A 4-second video at 24 fps generates 96 frames.

## Prompt writing tips

Good prompts lead to better results. Here are patterns that work well with Stable Diffusion models:

**Be specific about style.** Instead of "a cat", try "a tabby cat sitting on a windowsill, soft afternoon light, watercolor style, detailed fur texture".

**Use quality tags.** Adding tags like `masterpiece, best quality, highly detailed, 8k` at the start of your prompt nudges the model toward higher-quality output.

**Use negative prompts consistently.** A default negative prompt like `blurry, low quality, distorted, watermark, text` prevents common artifacts. You can set this globally with the `codecomfy.defaultNegativePrompt` setting so it pre-fills every time.

**Use seeds for iteration.** When you find a composition you like, note the seed from the run logs. Then tweak the prompt while keeping the same seed — this gives you variations of the same composition.

## Output structure

All CodeComfy artifacts live inside a `.codecomfy/` directory in your workspace root.

```
your-workspace/
  .codecomfy/
    outputs/
      index.json          # Atomic output index (schema v1.0)
      1711234567_a1b2c3d4.png    # Generated images
      1711234568_e5f6g7h8.mp4    # Assembled videos
      1711234568_e5f6g7h8.thumb.png  # Video thumbnails
    runs/
      m1abc_12345678/
        request.json      # Full request payload (prompt, seed, preset)
        status.json       # Run status (queued/running/succeeded/failed)
        artifacts.json    # List of artifacts produced
        stdout.log        # Engine output
        stderr.log        # Error output
        frames/           # (video only) downloaded frame PNGs
```

### The output index

The file `.codecomfy/outputs/index.json` is an atomic index of all completed generations. It records the artifact type, path, creation timestamp, run ID, and provenance (prompt, seed, preset ID). Gallery tools and external scripts can read this file to discover outputs without scanning the filesystem.

The index is written atomically using a temp-file-then-rename pattern, so it is never in a partially-written state.

### Run metadata

Each generation creates a timestamped folder under `.codecomfy/runs/`. Inside you will find the full request payload (`request.json`), the current status (`status.json`), and the artifact list (`artifacts.json`). This metadata is useful for reproducing a generation — the request file contains the exact prompt, seed, and preset parameters that were used.

## Run pruning

CodeComfy automatically prunes old run folders to prevent unbounded workspace growth. The retention policy is:

- **Maximum 200 runs** are kept. Older runs beyond this count are candidates for removal.
- **Maximum 30 days.** Runs older than 30 days are eligible for pruning.

Both conditions must be met before a run is deleted — a run within the 200-run limit is kept even if it is older than 30 days, and a run newer than 30 days is kept even if the count exceeds 200.

Pruning happens automatically after each successful generation. It also removes the corresponding entries from the output index. Pruning failures are non-fatal — they are logged but never cause a generation to fail.

## The status bar

The CodeComfy status bar item sits on the left side of the VS Code status bar. It shows the current state of the extension:

- **Idle** — no generation in progress.
- **Queued** — the prompt has been submitted to ComfyUI and is waiting in the queue.
- **Generating** — ComfyUI is actively working on the generation.
- **Done** — generation completed successfully. Resets to Idle after 3 seconds.
- **Failed** — generation encountered an error. Check the Output channel for details.
- **Canceled** — you canceled the generation.

A notification appears when generation completes; disable via `codecomfy.notifyOnComplete` if you prefer silent status-bar-only updates.

## Concurrency and cooldown

Only one generation can run at a time. If you try to start a second generation while one is active, CodeComfy shows a warning and blocks the request.

After a generation finishes (whether it succeeded, failed, or was canceled), there is a 2-second cooldown before the next generation can start. This gives ComfyUI time to release resources.

## Logs

Structured logs appear in the **CodeComfy** Output channel. Open it with `Ctrl+Shift+U` and select "CodeComfy" from the dropdown, or run the **CodeComfy: Open Output Channel** command.

Logs include timestamps, component tags, and severity levels (INFO, WARN, ERROR). Each generation logs the prompt, seed, duration (for video), and the final artifact paths. Error logs include categorized messages with links to the troubleshooting section.
