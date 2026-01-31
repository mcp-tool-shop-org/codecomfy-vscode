# Changelog

## [0.3.0] - 2026-01-31

### Added
- `CodeComfy: Generate Video (HQ)` command - generate videos via ComfyUI + FFmpeg
- Video assembly pipeline: ComfyUI frames → FFmpeg MP4 (H.264, CRF 18)
- Automatic thumbnail generation for videos
- Duration picker (2s / 4s / 8s) for video generation
- `codecomfy.ffmpegPath` setting for FFmpeg location
- Video metadata in index: `duration_seconds`, `fps`, `mime_type`, `thumbnail_path`

### Changed
- Router now computes `frame_count` from `fps * duration_seconds` for video presets
- Engine saves video frames to `runs/{id}/frames/` before assembly

## [0.2.0] - 2026-01-31

### Added
- `CodeComfy: Generate Image (HQ)` command - generate images via ComfyUI server
- `CodeComfy: Cancel Generation` command - cancel in-progress generation
- Job router with run lifecycle management (queued → running → succeeded/failed/canceled)
- Workspace storage at `.codecomfy/` with versioned index schema (v1.0)
- Atomic index writes for crash safety
- `codecomfy.comfyuiUrl` setting (default: `http://127.0.0.1:8188`)
- `codecomfy.autoOpenGalleryOnComplete` setting (default: `true`)
- Status bar indicator showing generation progress
- Output channel for generation logs

### Changed
- Improved error messages for ComfyUI connection failures

## [0.1.0] - 2025-01-31

### Added
- Initial release
- `CodeComfy: Open Gallery` command to launch NextGallery for current workspace
- Auto-detection of NextGallery.exe in common install locations
- `codecomfy.nextGalleryPath` setting for manual path configuration
- Support for multi-root workspaces (uses first folder)
