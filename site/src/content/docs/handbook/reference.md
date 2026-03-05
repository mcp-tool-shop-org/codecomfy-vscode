---
title: Reference
description: Generation limits, architecture, troubleshooting, platform support, and security scope.
sidebar:
  order: 2
---

This page covers the technical details behind CodeComfy — what the limits are, how the pipeline works, what to do when things go wrong, and what the extension does (and does not) touch on your system.

## Generation limits

Video generation enforces safety limits to prevent accidental resource exhaustion on your ComfyUI server and local disk.

| Parameter | Minimum | Maximum |
|-----------|---------|---------|
| Duration | 1 second | 15 seconds |
| Frames per second | 1 | 60 |
| Total frames (duration x fps) | — | 450 |

If you hit a limit, reduce the duration or choose a preset with a lower frame rate. Image generation does not have these constraints — it produces a single frame.

### Prompt and seed constraints

- Prompts must be non-empty and no longer than 8,000 characters.
- Seeds must be whole numbers between 0 and 2,147,483,647.
- Only one generation can run at a time. A 2-second cooldown separates consecutive jobs.

## How it works

The extension follows a linear pipeline from prompt to finished output.

```
Command Palette
    |
    v
extension.ts --- validates inputs, creates JobRouter
    |
    v
JobRouter --- creates run folder, tracks lifecycle
    |
    v
ComfyServerEngine --- POST /prompt -> poll /history -> stream /view
    |
    v
FFmpeg --- (video only) assemble frames into MP4
    |
    v
.codecomfy/outputs/index.json --- atomic index update
```

### Step by step

1. **Input validation.** The extension checks that the prompt is non-empty and within length limits, the seed is valid (or generates a random one), and the ComfyUI server is reachable.
2. **Job submission.** A JSON workflow payload is POSTed to ComfyUI's `/prompt` endpoint. The workflow is selected from built-in presets based on whether you chose image or video generation.
3. **Polling.** The extension polls `/history/{prompt_id}` to track progress. The VS Code status bar updates in real time (queued, generating, done, error).
4. **Download.** When ComfyUI reports the job is complete, the extension downloads the output files via the `/view` endpoint. For video, this means downloading every individual frame.
5. **Assembly (video only).** FFmpeg takes the downloaded frames and assembles them into an MP4 file. The frame images are kept alongside the video.
6. **Index update.** The output index at `.codecomfy/outputs/index.json` is updated atomically so that gallery tools can discover completed runs.

## Troubleshooting

Error messages from CodeComfy are prefixed with a category tag to help you narrow down the problem area quickly.

### `[Network]` — Cannot reach ComfyUI server

The extension could not connect to the configured ComfyUI URL.

- **Is ComfyUI running?** Open `http://127.0.0.1:8188/system_stats` in a browser. If you see JSON output, the server is up.
- **Wrong URL or port?** If ComfyUI runs on a non-default port or a remote host, update `codecomfy.comfyuiUrl` in your settings.
- **Firewall or proxy?** Try `curl http://127.0.0.1:8188/system_stats` from a terminal. If curl fails too, the problem is at the network level, not in the extension.

### `[Server]` — ComfyUI returned an error

The extension reached ComfyUI, but the server rejected the request or failed during execution.

- Check the ComfyUI terminal or console output for Python stack traces.
- The most common cause is a missing model checkpoint or a custom node that is not installed.
- Make sure your ComfyUI installation has all the nodes required by the preset workflow.

### `[API]` — Unexpected response shape

The extension received a response from the ComfyUI URL, but the JSON structure did not match what it expected.

- Your ComfyUI version may be too old or too new for the bundled presets. Try updating ComfyUI.
- A reverse proxy, CDN, or authentication layer between the extension and ComfyUI may be modifying responses. Hit `/prompt` and `/history` directly in a browser to inspect the raw JSON.

### `[IO]` — File permission or disk issues

The extension could not write outputs to the workspace.

- Make sure the workspace folder is writable by your user account.
- Check available disk space — frame downloads for video can be large.
- On Windows, workspaces on network drives may have performance or permission issues. Use a local drive for best results.

### FFmpeg not found

Video generation requires FFmpeg but the extension could not locate it.

- Install FFmpeg and make sure `ffmpeg` (or `ffmpeg.exe` on Windows) is on your system PATH.
- Alternatively, set `codecomfy.ffmpegPath` to the full absolute path, for example `C:\ffmpeg\bin\ffmpeg.exe`.
- Relative paths and bare names (other than PATH-resolved `ffmpeg`) are rejected for security — the extension needs to know exactly which binary it is executing.

### "Generation already running"

Only one generation runs at a time. Cancel the current job first (`CodeComfy: Cancel Generation` in the Command Palette) or wait for it to finish. A 2-second cooldown applies between consecutive jobs.

## Known limitations by platform

| Platform | Status |
|----------|--------|
| **Windows 10/11** | Fully tested. Primary development platform. All features work. |
| **macOS** | Image and video generation are expected to work. NextGallery auto-detection is not available — set `codecomfy.nextGalleryPath` manually if needed. |
| **Linux** | Same as macOS: core generation works, NextGallery needs a manual path. |
| **Remote / WSL** | Works as long as the ComfyUI URL is reachable from the machine running VS Code. If VS Code is local and ComfyUI is in WSL, use the WSL IP or `localhost` forwarding. |

The core pipeline (prompt submission, polling, download, FFmpeg assembly) is platform-agnostic. The only Windows-specific behavior is NextGallery auto-detection, which falls back gracefully to a settings prompt on other platforms.

If you encounter a platform-specific issue, [open an issue](https://github.com/mcp-tool-shop-org/codecomfy-vscode/issues) with your OS, VS Code version, and ComfyUI version.

## Security scope

CodeComfy is conservative about what it touches on your system.

- **Network:** the extension connects only to the user-configured ComfyUI URL (default `http://127.0.0.1:8188`). No other outbound HTTP requests are made. No telemetry, no analytics, no phone-home.
- **Filesystem:** outputs are written exclusively to `.codecomfy/outputs/` and `.codecomfy/runs/` inside the workspace. The extension does not read or write files outside the workspace.
- **FFmpeg execution:** all FFmpeg spawns use the non-shell execution path (`shell: false`). The FFmpeg path must be an absolute, existing, executable file — no relative paths or bare names are accepted (except the system PATH lookup fallback).
- **No telemetry** of any kind is collected or transmitted. See [SECURITY.md](https://github.com/mcp-tool-shop-org/codecomfy-vscode/blob/main/SECURITY.md) for the full policy.
