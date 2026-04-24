---
title: Configuration
description: Detailed guide to every CodeComfy setting, path validation, and URL handling.
sidebar:
  order: 3
---

This page provides a detailed reference for every CodeComfy configuration option, including how the extension validates settings and what happens when a value is invalid.

## Requirements

CodeComfy requires **VS Code `^1.85.0`** (tested on 1.85.0 through current stable). The extension uses the `InputBox` and structured cancellation APIs that shipped with VS Code 1.85. On older VS Code versions the extension will either fail to activate or silently skip features; upgrade VS Code rather than trying to pin an older extension release.

## A note on HQ

The two generate commands (`Generate Image (HQ)` and `Generate Video (HQ)`) both carry the `(HQ)` suffix. **HQ stands for "High Quality"** — it refers to the shipped preset workflows tuned for quality over speed (1024×1024 images, 30 steps, DPM++ 2M Karras). When future presets arrive (e.g. a fast draft mode), the HQ suffix will help disambiguate at the Command Palette. The Commands page covers what each preset produces.

## All settings

CodeComfy exposes five settings under the `codecomfy.*` namespace. You can edit them in the VS Code Settings UI (**Settings > Extensions > CodeComfy**) or directly in your `settings.json`.

### codecomfy.comfyuiUrl

| | |
|--|--|
| **Type** | `string` |
| **Default** | `http://127.0.0.1:8188` |
| **Purpose** | The HTTP URL of your ComfyUI server. |

The extension validates this URL at startup. It must use the `http:` or `https:` protocol and include a hostname. If the URL is invalid, CodeComfy shows a warning and falls back to the default.

The trailing slash is stripped automatically, so `http://127.0.0.1:8188/` and `http://127.0.0.1:8188` are treated identically.

**Remote ComfyUI servers.** If ComfyUI runs on a different machine, set this to its LAN IP and port, for example `http://192.168.1.100:8188`. Make sure the port is open in the remote machine's firewall.

**WSL users.** If VS Code runs on Windows and ComfyUI runs inside WSL, use `http://localhost:8188` (WSL typically forwards to the host) or the WSL2 IP address.

### codecomfy.ffmpegPath

| | |
|--|--|
| **Type** | `string` |
| **Default** | `""` (empty = use system PATH) |
| **Purpose** | Absolute path to the FFmpeg executable. Only needed for video generation. |

The extension applies strict validation to this setting:

- **Empty or `"ffmpeg"`** -- the extension searches your system PATH for FFmpeg. On Windows, it also checks common install locations like `C:\ffmpeg\bin\ffmpeg.exe` and `%LOCALAPPDATA%\Programs\ffmpeg\bin\ffmpeg.exe`.
- **Absolute path** -- must point to an existing file that looks like an executable (`.exe`, `.cmd`, `.bat`, or `.com` on Windows; any file on other platforms). The path is normalized and used directly.
- **Relative path** -- rejected. The extension requires an absolute path for security, so it knows exactly which binary it will execute. A warning is shown and the setting falls back to PATH lookup.

On Windows, surrounding double-quotes are stripped automatically. This handles the common copy-paste scenario where a user copies a path from Explorer with quotes around it.

### codecomfy.autoOpenGalleryOnComplete

| | |
|--|--|
| **Type** | `boolean` |
| **Default** | `true` |
| **Purpose** | Automatically open the NextGallery companion viewer when a generation finishes successfully. |

Set this to `false` if you do not use NextGallery or prefer to open outputs manually.

### codecomfy.nextGalleryPath

| | |
|--|--|
| **Type** | `string` |
| **Default** | `""` (auto-detect) |
| **Purpose** | Absolute path to the NextGallery executable. |

On Windows, the extension checks common install locations automatically:

- `%LOCALAPPDATA%\Programs\NextGallery\NextGallery.exe`
- `%PROGRAMFILES%\NextGallery\NextGallery.exe`
- `%PROGRAMFILES(X86)%\NextGallery\NextGallery.exe`

On macOS it checks `/Applications/NextGallery.app/Contents/MacOS/NextGallery` and `~/Applications/...`. On Linux it checks `/usr/local/bin/nextgallery` and `~/.local/bin/nextgallery`.

If auto-detection fails and you have NextGallery installed elsewhere, set this to the full path. If you do not use NextGallery, leave it empty and set `autoOpenGalleryOnComplete` to `false`.

### codecomfy.defaultNegativePrompt

| | |
|--|--|
| **Type** | `string` |
| **Default** | `""` (empty) |
| **Purpose** | A negative prompt string pre-filled in the input box every time you start a generation. |

This saves you from typing the same exclusions repeatedly. Common values:

```
blurry, distorted, low quality, text, watermark, deformed hands
```

You can still edit or clear the pre-filled value during each generation -- it is a convenience default, not a locked setting.

The negative prompt has the same 8,000-character limit as the positive prompt.

## Example settings.json

A complete configuration for a typical Windows setup:

```json
{
  "codecomfy.comfyuiUrl": "http://127.0.0.1:8188",
  "codecomfy.ffmpegPath": "C:\\ffmpeg\\bin\\ffmpeg.exe",
  "codecomfy.autoOpenGalleryOnComplete": true,
  "codecomfy.nextGalleryPath": "",
  "codecomfy.defaultNegativePrompt": "blurry, watermark, low quality, text"
}
```

A minimal configuration (all defaults, FFmpeg on PATH):

```json
{
  "codecomfy.comfyuiUrl": "http://127.0.0.1:8188"
}
```

## How validation works

CodeComfy reads and validates configuration every time a command runs. Invalid values produce a one-time warning notification and fall back to safe defaults:

- An invalid ComfyUI URL falls back to `http://127.0.0.1:8188`.
- An invalid FFmpeg path falls back to PATH lookup mode.
- Other settings use their documented defaults.

This means a misconfigured setting never causes a crash -- you will see a warning and the extension continues with the fallback value.
