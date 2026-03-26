---
title: For Beginners
description: New to codecomfy-vscode? Start here for a gentle introduction.
sidebar:
  order: 99
---

## What is this tool?

CodeComfy is a VS Code extension that lets you generate AI images and videos without leaving your code editor. It connects to a running [ComfyUI](https://github.com/comfyanonymous/ComfyUI) server on your machine, sends it a text prompt describing what you want to see, and downloads the finished image or video back into your project folder.

In concrete terms: you open the VS Code Command Palette, type a description like "a mountain lake at sunset, photorealistic, 8k", and CodeComfy handles everything else -- submitting the job to ComfyUI, polling for progress, downloading the result, and (for video) assembling individual frames into an MP4 file using FFmpeg.

You do not need to interact with the ComfyUI web interface at all. CodeComfy uses ComfyUI's HTTP API behind the scenes and bundles its own preset workflows for image and video generation.

## Who is this for?

CodeComfy is designed for developers and creators who:

- **Already use VS Code** as their primary editor and want to generate AI art assets without switching to a browser-based UI.
- **Have ComfyUI installed** (or are willing to install it) and want a streamlined prompt-to-output workflow.
- **Work on projects that need generated images or videos** -- game development, prototyping, creative coding, documentation, or personal art projects.
- **Prefer keyboard-driven workflows.** Everything in CodeComfy runs through the Command Palette.

CodeComfy is not a general-purpose ComfyUI frontend. It does not expose the full node graph editor -- that is what the ComfyUI web interface is for. Instead, it provides a fast, opinionated path from text prompt to finished file using built-in presets.

## Prerequisites

Before you can use CodeComfy, you need three things:

### 1. VS Code (version 1.85 or newer)

CodeComfy is a VS Code extension. Download VS Code from [code.visualstudio.com](https://code.visualstudio.com/) if you do not have it already. Check your version with **Help > About** -- it needs to be 1.85 or higher.

### 2. ComfyUI (running locally)

ComfyUI is the AI image generation backend that does the actual work. CodeComfy talks to it over HTTP.

- Install ComfyUI by following the [official installation guide](https://github.com/comfyanonymous/ComfyUI#installing).
- Start ComfyUI so it is listening on `http://127.0.0.1:8188` (the default).
- Verify it is running by opening `http://127.0.0.1:8188/system_stats` in your browser. If you see JSON output, it is ready.

ComfyUI requires a Stable Diffusion model checkpoint. The bundled CodeComfy presets reference `juggernautXL_v9Rundiffusionphoto2.safetensors` -- you will need to download this model (or modify the presets for a different checkpoint) and place it in your ComfyUI `models/checkpoints/` folder.

### 3. FFmpeg (only for video generation)

If you only want to generate images, you can skip this. Video generation needs FFmpeg to assemble frames into an MP4 file.

- **Windows:** download from [ffmpeg.org](https://ffmpeg.org/download.html), extract it, and add the `bin` folder to your system PATH.
- **macOS:** run `brew install ffmpeg`.
- **Linux:** run `sudo apt install ffmpeg` (or your distribution's equivalent).

## Your First 5 Minutes

Follow these steps to go from zero to your first generated image:

### Minute 1 -- Install the extension

1. Download the latest `.vsix` file from the [Releases page](https://github.com/mcp-tool-shop-org/codecomfy-vscode/releases).
2. In VS Code, open the Extensions sidebar (the square icon on the left, or `Ctrl+Shift+X`).
3. Click the `...` menu at the top of the Extensions panel and choose **Install from VSIX...**
4. Select the downloaded `.vsix` file. Reload VS Code when prompted.

### Minute 2 -- Verify ComfyUI is running

Open a browser and go to `http://127.0.0.1:8188/system_stats`. You should see JSON output showing your GPU and system info. If you get a connection error, start ComfyUI first.

### Minute 3 -- Generate your first image

1. Open a workspace folder in VS Code (any folder will do -- CodeComfy saves outputs there).
2. Press `Ctrl+Shift+P` to open the Command Palette.
3. Type `CodeComfy: Generate Image (HQ)` and select it.
4. Enter a prompt: `a cozy cabin in a snowy forest, warm window light, photorealistic`
5. Press Enter through the negative prompt (or type `blurry, low quality`) and seed (leave blank for random).

### Minute 4 -- Watch it work

Look at the status bar at the bottom of VS Code. You will see it cycle through:
- **Queued** -- the prompt was sent to ComfyUI.
- **Generating** -- ComfyUI is rendering the image.
- **Done** -- the image is ready.

The CodeComfy Output channel (`Ctrl+Shift+U`, select "CodeComfy") shows detailed logs.

### Minute 5 -- Find your output

Your generated image is in the `.codecomfy/outputs/` folder inside your workspace. Open the file explorer in VS Code to find it, or check the Output channel log for the exact path.

If NextGallery is installed and `autoOpenGalleryOnComplete` is enabled (the default), the gallery viewer opens automatically.

## Common Mistakes

### "Can't reach ComfyUI server"

ComfyUI is not running or is on a different URL/port. Start ComfyUI and verify it is reachable at the configured URL (default `http://127.0.0.1:8188`). Open `/system_stats` in your browser to confirm.

### "No workspace folder open"

CodeComfy needs an open workspace to save outputs. Open any folder in VS Code with **File > Open Folder** before running a generation command.

### "FFmpeg not found" during video generation

FFmpeg is not installed or not on your system PATH. Either install it and add it to PATH, or set the `codecomfy.ffmpegPath` setting to the full absolute path of the `ffmpeg` executable.

### Missing model checkpoint

The bundled presets expect a specific Stable Diffusion checkpoint file (`juggernautXL_v9Rundiffusionphoto2.safetensors`). If you do not have this model, ComfyUI will return a server error. Download the model and place it in your ComfyUI `models/checkpoints/` directory, or modify the preset workflow files to reference a checkpoint you already have.

### Starting a second generation too quickly

CodeComfy only runs one generation at a time. If you try to start another while one is active, you will see a warning. Wait for the current generation to finish, or cancel it with `CodeComfy: Cancel Generation`. There is also a 2-second cooldown after each generation ends.

### Using a relative path for FFmpeg

The extension rejects relative paths like `./ffmpeg` or `ffmpeg/bin/ffmpeg.exe` for security reasons. Use an absolute path (e.g., `C:\ffmpeg\bin\ffmpeg.exe` on Windows or `/usr/local/bin/ffmpeg` on macOS/Linux), or leave the setting empty to let the extension search your system PATH.

## Next Steps

Once your first generation works:

- **Read the [Usage Guide](../usage/)** for prompt writing tips, output structure details, and information about run pruning.
- **Try video generation.** Run `CodeComfy: Generate Video (HQ)`, pick a duration, and watch the status bar as frames are generated and assembled.
- **Set a default negative prompt.** Go to Settings and set `codecomfy.defaultNegativePrompt` to something like `blurry, low quality, watermark` so you do not have to type it every time.
- **Explore the [Reference](../reference/)** for architecture details, troubleshooting, platform-specific notes, and the full security scope.
- **Check the [Configuration](../configuration/)** page for detailed documentation of every setting and how validation works.

## Glossary

| Term | Definition |
|------|-----------|
| **ComfyUI** | An open-source AI image generation backend that uses node-based workflows. CodeComfy connects to it over HTTP to submit generation jobs. |
| **Prompt** | A text description of the image or video you want to generate. The AI model interprets this to produce output. |
| **Negative prompt** | A text description of things you want the model to avoid in the output (e.g., "blurry, watermark"). |
| **Seed** | A number (0 to 2,147,483,647) that makes generation reproducible. The same prompt + seed produces the same output. |
| **Preset** | A bundled ComfyUI workflow template with default parameters. CodeComfy ships with `hq-image` (1024x1024 still) and `hq-video` (1024x576 video). |
| **CFG Scale** | Classifier-Free Guidance scale. Controls how closely the output follows the prompt. Higher values = more literal interpretation. The default is 7.0. |
| **Steps** | The number of denoising iterations the model performs. More steps generally means higher quality but takes longer. Default is 30 for images, 25 for video. |
| **FFmpeg** | A command-line tool for video processing. CodeComfy uses it to assemble individual frames into MP4 video files. |
| **VSIX** | The file format for VS Code extension packages. You install CodeComfy by loading a `.vsix` file. |
| **NextGallery** | An optional companion gallery viewer that can display generated images and videos. |
| **Run** | A single generation job, from prompt submission to completion. Each run gets its own folder under `.codecomfy/runs/` with metadata about the request and result. |
| **Output index** | The file `.codecomfy/outputs/index.json` that tracks all generated artifacts with their metadata and provenance. |
| **Checkpoint** | A trained AI model file (`.safetensors` or `.ckpt`) that ComfyUI loads to generate images. Different checkpoints produce different art styles. |
