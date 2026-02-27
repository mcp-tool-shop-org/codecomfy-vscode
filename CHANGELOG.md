# Changelog

All notable changes to the **CodeComfy** VS Code extension are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

## [1.0.0] - 2026-02-27

### Added
- SECURITY.md with real data scope (ComfyUI, FFmpeg, workspace files)
- README threat model paragraph (Security & Data Scope section)
- `verify` script for one-command test + compile + package
- Dependency audit job in CI
- SHIP_GATE.md and SCORECARD.md (Shipcheck compliance)

### Changed
- Bumped to 1.0.0 — production ready

## [0.5.5] - 2026-02-27

### Added
- 80 new unit tests covering engine, router, ffmpeg, and type contracts (235 total).

## [0.5.4] - 2026-02-27

### Changed
- Patch version bump.

## [0.5.3] - 2026-02-23

### Added
- **Negative prompt** input during image and video generation — optionally specify what to avoid (e.g., blurry, distorted, low quality)
- `codecomfy.defaultNegativePrompt` setting to pre-fill the negative prompt input box
- Negative prompt logged to Output channel alongside the main prompt

## [0.5.2] - 2026-02-23

### Changed
- Added CI badge to README.

## [0.5.1] - 2026-02-23

### Changed
- Hardened CI workflow.
- Added GitHub Pages landing page (`docs/index.md`).

## [0.5.0] - 2026-02-14

### Added
- Exponential backoff + jitter for ComfyUI polling (1 s → 8 s cap, ±20 % jitter)
- Runtime shape guards for `/prompt` and `/history` API responses (`ComfyResponseError`)
- Structured logging module (`src/logging/logger.ts`) with Output channel sink
- Run history pruning — keeps last 200 runs / 30 days, prunes folders + index entries
- Streaming downloads — images and frames are piped directly to disk
- Async FFmpeg PATH probe (replaced `spawnSync`)
- Categorised error messages: `[Network]`, `[Server]`, `[API]`, `[IO]` with troubleshooting links
- Comprehensive README with prerequisites, install steps, quickstart, and troubleshooting
- Extension icon and branding (orange couch + code brackets)
- Marketplace metadata polish (categories, keywords, icon, homepage, bugs URL)
- `CodeComfy: Open Output Channel` command
- Cross-platform FFmpeg and NextGallery path detection (macOS, Linux)
- Known Limitations section in README

### Changed
- Dev dependencies modernised: ESLint 9 (flat config), TypeScript 5.8, `@vscode/vsce` 3.x
- Migrated `.eslintrc.json` → `eslint.config.mjs`
- Path-filtered CI workflow (skips doc-only pushes)
- Release workflow gains CHANGELOG version verification and Marketplace publish step
- `.vscodeignore` tuned — VSIX reduced to ~69 KB

### Security
- Resolved `qs` vulnerability by upgrading `@vscode/vsce` to 3.x
- `npm audit` clean (0 vulnerabilities)

## [0.4.0] - 2026-02-01

### Added
- Security: removed `shell: true` from all FFmpeg process spawns
- Security: `codecomfy.ffmpegPath` validated at read time (must be absolute, existing, executable)
- Safety: concurrency guard — only one generation at a time, with 2 s cooldown
- Safety: seed (0 – 2,147,483,647), prompt (non-empty, ≤ 8,000 chars) validation
- Safety: video generation hard limits (max 15 s, 1–60 fps, ≤ 450 frames)
- Test harness: Mocha + Sinon with headless VS Code stub (99 → 170 tests)
- CI gates: lint → test → compile → version-check → package → release
- ESLint config (`.eslintrc.json`)

## [0.3.0] - 2026-01-31

### Added
- `CodeComfy: Generate Video (HQ)` command — generate videos via ComfyUI + FFmpeg
- Video assembly pipeline: ComfyUI frames → FFmpeg MP4 (H.264, CRF 18)
- Automatic thumbnail generation for videos
- Duration picker (2 s / 4 s / 8 s) for video generation
- `codecomfy.ffmpegPath` setting for FFmpeg location
- Video metadata in index: `duration_seconds`, `fps`, `mime_type`, `thumbnail_path`

### Changed
- Router now computes `frame_count` from `fps × duration_seconds` for video presets
- Engine saves video frames to `runs/{id}/frames/` before assembly

## [0.2.0] - 2026-01-31

### Added
- `CodeComfy: Generate Image (HQ)` command — generate images via ComfyUI server
- `CodeComfy: Cancel Generation` command — cancel in-progress generation
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
