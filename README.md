# CodeComfy Gallery for VS Code

Open [NextGallery](https://github.com/mcp-tool-shop-org/next-gallery) to view ComfyUI generation outputs for the current workspace.

## Features

- **One command**: `CodeComfy: Open Gallery` launches NextGallery for your current workspace
- **Single-instance routing**: If a gallery is already open for the workspace, it activates the existing window
- **Multi-root workspaces**: Uses the first workspace folder

## Requirements

- [NextGallery](https://github.com/mcp-tool-shop-org/next-gallery) installed on Windows
- A workspace folder with CodeComfy outputs (`.codecomfy/outputs/index.json`)

## Usage

1. Open a workspace folder in VS Code
2. Run `CodeComfy: Open Gallery` from the Command Palette (`Ctrl+Shift+P`)
3. NextGallery opens showing your generation outputs

## Configuration

| Setting | Description | Default |
|---------|-------------|---------|
| `codecomfy.nextGalleryPath` | Path to NextGallery.exe | Auto-detect common locations |

If NextGallery isn't found automatically, set the path manually:

```json
{
  "codecomfy.nextGalleryPath": "C:\\path\\to\\NextGallery.exe"
}
```

## How It Works

The extension launches NextGallery with `--workspace <path>` pointing to your current VS Code workspace. NextGallery handles:

- Workspace key computation (SHA256-based)
- Single-instance routing via named pipes and mutex
- Index file loading and display

## Generation Limits

Video generation enforces safety limits to prevent accidental resource exhaustion:

| Parameter | Min | Max |
|-----------|-----|-----|
| Duration  | 1 s | 15 s |
| FPS       | 1   | 60   |
| Total frames (duration × fps) | — | 450 |

If you hit a limit, reduce the duration or choose a preset with a lower frame rate.

## Troubleshooting

- **FFmpeg not found** — Install FFmpeg and ensure it is on your system PATH, or set `codecomfy.ffmpegPath` to the full absolute path (e.g. `C:\ffmpeg\bin\ffmpeg.exe`). Relative paths are rejected for security.
- **"Generation already running"** — Only one generation can run at a time. Cancel the current one (`CodeComfy: Cancel Generation`) or wait for it to finish. There is a short cooldown between jobs.
- **Seed / prompt errors** — Seeds must be whole numbers between 0 and 2 147 483 647. Prompts must be non-empty and at most 8 000 characters.

## License

MIT
