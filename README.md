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

## License

MIT
