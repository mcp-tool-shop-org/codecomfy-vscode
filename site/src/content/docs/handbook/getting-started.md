---
title: Getting Started
description: Install CodeComfy, connect to ComfyUI, and generate your first image in under five minutes.
sidebar:
  order: 1
---

This page walks you through everything you need before your first generation, from prerequisites to configuration to the actual prompt-to-output workflow.

## Prerequisites

CodeComfy talks to a running ComfyUI server over HTTP. You need that server up and reachable before the extension can do anything useful.

### ComfyUI (required)

ComfyUI must be running and accessible at an HTTP URL. The default is `http://127.0.0.1:8188`, which is what you get when you start ComfyUI locally with no extra flags.

If you are running ComfyUI on a different machine, a different port, or inside Docker, you will configure the URL in the extension settings (see below).

**Quick health check:** open `http://127.0.0.1:8188/system_stats` in a browser. If you see JSON, ComfyUI is ready.

### FFmpeg (required for video)

Video generation assembles individual frames into an MP4 file. That assembly step needs FFmpeg.

- **Windows:** download the build from [ffmpeg.org](https://ffmpeg.org/download.html), extract it, and either add the `bin` folder to your system PATH or point the `codecomfy.ffmpegPath` setting at the full path to `ffmpeg.exe`.
- **macOS:** `brew install ffmpeg`
- **Linux:** `sudo apt install ffmpeg` (or your distro's equivalent)

Image generation does not need FFmpeg at all — skip this if you only plan to generate stills.

### NextGallery (optional)

NextGallery is a companion gallery viewer that can open automatically when a generation finishes. It is not required for generation itself. On Windows, CodeComfy tries to auto-detect the NextGallery path; on other platforms, set `codecomfy.nextGalleryPath` manually if you use it.

## Installation

CodeComfy is distributed as a `.vsix` file (it is not yet on the VS Code Marketplace).

1. Download the latest `.vsix` from the [Releases page](https://github.com/mcp-tool-shop-org/codecomfy-vscode/releases).
2. Open VS Code, go to the **Extensions** sidebar, click the `···` menu at the top, and choose **Install from VSIX...**
3. Select the downloaded file and reload the window when prompted.

After installation, the `CodeComfy` commands appear in the Command Palette (`Ctrl+Shift+P`).

## Configuration

Open **Settings > Extensions > CodeComfy** in VS Code, or add the keys directly to your `settings.json`.

### Available settings

| Setting | What it controls | Default |
|---------|-----------------|---------|
| `codecomfy.comfyuiUrl` | The HTTP URL of your ComfyUI server. Change this if ComfyUI runs on a different host or port. | `http://127.0.0.1:8188` |
| `codecomfy.ffmpegPath` | Absolute path to the FFmpeg binary. Leave empty to let the extension find `ffmpeg` on your system PATH. | `""` (PATH lookup) |
| `codecomfy.autoOpenGalleryOnComplete` | Whether to launch NextGallery automatically after a generation finishes. | `true` |
| `codecomfy.nextGalleryPath` | Absolute path to the NextGallery executable. On Windows the extension auto-detects this; set it explicitly on macOS or Linux. | Auto-detect |
| `codecomfy.defaultNegativePrompt` | A negative prompt string pre-filled every time you start a generation. Useful for things you always want to exclude (e.g. "blurry, watermark"). | `""` |

### Example settings.json

```json
{
  "codecomfy.comfyuiUrl": "http://127.0.0.1:8188",
  "codecomfy.ffmpegPath": "C:\ffmpeg\bin\ffmpeg.exe",
  "codecomfy.autoOpenGalleryOnComplete": true,
  "codecomfy.defaultNegativePrompt": "blurry, watermark, low quality"
}
```

## Your first generation

Once ComfyUI is running and the extension is installed, you are ready to generate.

### Generate an image

1. Open the Command Palette: `Ctrl+Shift+P` (or `Cmd+Shift+P` on macOS).
2. Type `CodeComfy: Generate Image (HQ)` and select the command.
3. Enter your prompt — describe what you want to see. For example: `masterpiece, soft lighting, mountain landscape at dawn, 8k`.
4. Optionally enter a negative prompt — things you want the model to avoid.
5. Optionally enter a seed — a whole number between 0 and 2,147,483,647. Leave it blank for a random seed.
6. Watch the status bar at the bottom of VS Code. It updates in real time: **queued** then **generating** then **done**.
7. The finished image appears in `.codecomfy/outputs/` inside your workspace. If NextGallery is configured, it opens automatically.

### Generate a video

The workflow is the same, but choose `CodeComfy: Generate Video (HQ)` instead. Video generation produces individual frames, downloads them, and then assembles them into an MP4 using FFmpeg.

Videos are short by design (1 to 15 seconds) with a frame cap of 450 total frames. This keeps generation times reasonable and prevents accidental resource exhaustion.

### Cancel a running generation

Open the Command Palette and run `CodeComfy: Cancel Generation`, or click the status bar item while a job is active. There is a 2-second cooldown between consecutive jobs to let the server settle.

### Where outputs go

All outputs live inside a `.codecomfy/` directory in your workspace root:

- **`.codecomfy/outputs/`** — finished images and videos.
- **`.codecomfy/runs/`** — run metadata (prompt, seed, timestamps, status).

Structured logs are also available in the **CodeComfy** Output channel (`Ctrl+Shift+U`, then select "CodeComfy" from the dropdown).
