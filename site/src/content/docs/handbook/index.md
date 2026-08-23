---
title: CodeComfy Handbook
description: The complete guide to driving ComfyUI — image, video, audio, 3D, and image understanding — from VS Code.
sidebar:
  order: 0
---

Welcome to the CodeComfy Handbook — your reference for driving ComfyUI from
inside VS Code.

CodeComfy bridges your editor and your ComfyUI server so you never have to
switch windows. Open the Command Palette, pick a profile, answer the inputs
that preset actually needs, and find the finished output in your workspace.

## The six profiles

CodeComfy covers six capability profiles. `CodeComfy: Run… (all profiles)` is
the single entry point to all of them.

| Profile | What it does |
|---------|--------------|
| **Image** | Text-to-image, image edit, union ControlNet |
| **Video** | Text- and image-to-video on real temporal models |
| **Audio** | Text-to-music and stem separation |
| **3D** | Image-to-mesh, exported as GLB |
| **Inference** | Caption, tag, detect, segment, and OCR an image |
| **Metadata** | Read the workflow embedded in a PNG — local-only |

See **[Profiles](profiles/)** for the full preset list and what each one asks
you for.

## Two things worth knowing up front

**Nothing is submitted before it can succeed.** Every preset is checked against
your server first — its node types against `/object_info`, its model files
against `/models`. A missing node names the pack that provides it; a missing
model names the file and the folder it belongs in. No GPU time is spent finding
out.

**The workflows are not hand-written here.** They are vendored from
[comfy-headless](https://github.com/mcp-tool-shop-org/comfy-headless), where
every node type is verified against the live ComfyUI catalog. A wrong workflow
graph does not throw an error — it runs green and returns nothing — so a second
hand-maintained copy would be a silent-failure generator.

## What you will find here

- **[Getting Started](getting-started/)** — prerequisites, installation, configuration, and your first generation.
- **[Profiles](profiles/)** — all six profiles, their presets, and what each needs from you.
- **[Usage Guide](usage/)** — daily workflow patterns, prompt tips, output management, and run pruning.
- **[Presets](presets/)** — authoring your own workflow presets.
- **[Run History](run-history/)** — browsing and re-running past generations.
- **[Configuration](configuration/)** — every setting, explained.
- **[Reference](reference/)** — generation limits, architecture overview, troubleshooting, platform notes, and security scope.
- **[For Beginners](beginners/)** — new to AI generation or VS Code extensions? Start here.

## Quick links

| Resource | Link |
|----------|------|
| GitHub repository | [mcp-tool-shop-org/codecomfy-vscode](https://github.com/mcp-tool-shop-org/codecomfy-vscode) |
| Releases (VSIX downloads) | [Releases page](https://github.com/mcp-tool-shop-org/codecomfy-vscode/releases) |
| Issue tracker | [Open an issue](https://github.com/mcp-tool-shop-org/codecomfy-vscode/issues) |
| ComfyUI project | [github.com/comfyanonymous/ComfyUI](https://github.com/comfyanonymous/ComfyUI) |
| Verified workflow KB | [comfy-headless](https://github.com/mcp-tool-shop-org/comfy-headless) |
| FFmpeg downloads | [ffmpeg.org/download.html](https://ffmpeg.org/download.html) |
