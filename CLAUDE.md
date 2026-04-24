# codecomfy-vscode

## What this is

VS Code extension that drives a local (or remote) **ComfyUI** server to generate images and videos from inside the editor. The extension submits a workflow to ComfyUI, polls `/history`, streams frames via `/view`, and (for video) assembles frames with **FFmpeg**. Outputs land in `.codecomfy/outputs/` and run metadata in `.codecomfy/runs/` in the user's workspace.

This is a shipping extension (v1.0.2 on the VS Code Marketplace under publisher `mcp-tool-shop`). It is **not** a prototype, a formatting helper, a snippet manager, or a theme. Any prior description along those lines is stale scaffold — trust `src/` and `README.md`.

## Stack

- **Language:** TypeScript (strict, ES2022), targeting VS Code API `^1.85.0`
- **Test runner:** Mocha (`test/unit/**/*.test.ts` → `dist-test/`) with Sinon stubs for the VS Code API (`test/register-vscode-stub.js` + `test/stubs/`)
- **Lint:** ESLint 9 flat config (`eslint.config.mjs`) + `typescript-eslint`
- **Package:** `@vscode/vsce` (VS Code marketplace packaging)
- **No bundler:** plain `tsc` compilation to `dist/`

## Architecture (read `src/` top-down)

| Layer | Files | Role |
|---|---|---|
| Entry | `src/extension.ts` | `activate()` / command registration / status bar / output channel |
| Presets | `src/presets/registry.ts`, `src/presets/hq-{image,video}.json` | Shipped ComfyUI workflows loaded at activation |
| Router | `src/router/jobRouter.ts` | Job lifecycle state machine (queued → generating → done), run-folder scaffolding, cleanup |
| Engines | `src/engines/comfyServerEngine.ts` | HTTP to ComfyUI: POST `/prompt`, poll `/history`, download `/view` |
|  | `src/engines/comfyValidation.ts` | ComfyUI URL + reachability validation |
|  | `src/engines/ffmpeg.ts` | FFmpeg spawn + args for frame-to-video assembly |
| Polling | `src/polling/backoff.ts` | Exponential backoff for ComfyUI polling |
| Config | `src/config.ts` | Settings read (`codecomfy.*`) + defaults |
| Validation | `src/validation/{inputs,paths,url,video}.ts` | Input guards (prompt, seed, paths, URL, video params) |
| Logging | `src/logging/logger.ts` | Structured output-channel logger |
| Pruning | `src/pruning/pruner.ts` | `.codecomfy/` retention policy |
| Types | `src/types/index.ts` | Shared contracts between layers |

## Commands contributed

- `codecomfy.generateImageHQ` — single image (HQ preset)
- `codecomfy.generateVideoHQ` — short video (2–8 s)
- `codecomfy.cancelGeneration` — abort the active run
- `codecomfy.openGallery` — launch NextGallery (optional companion)
- `codecomfy.openOutputChannel` — open the CodeComfy log

## Settings

`codecomfy.comfyuiUrl`, `codecomfy.ffmpegPath`, `codecomfy.autoOpenGalleryOnComplete`, `codecomfy.nextGalleryPath`, `codecomfy.defaultNegativePrompt`. Full schema in `package.json`.

## Dev loop

```bash
npm install
npm run lint          # eslint (preflight)
npm run verify        # npm test && npm run compile && vsce package --no-dependencies (the wired gate)
```

`npm run verify` is the single source of truth for the build gate — it runs tests, compiles, and packages a `.vsix` so packaging regressions are caught in-loop.

## Publish

This is a **VS Code extension**, not an npm package. Publish path is:

```bash
vsce publish          # to the VS Code Marketplace under publisher mcp-tool-shop
```

Do **not** `npm publish` — the package is unscoped and marketplace-only.

## Non-obvious constraints

- **Windows-first.** Tested on Windows 10/11. macOS/Linux are expected to work but not verified — see `README.md` Known Limitations.
- **No live-server tests in CI.** All 16 unit tests use Sinon stubs of the VS Code API. Integration against a real ComfyUI is manual.
- **No telemetry.** All diagnostics go to the `CodeComfy` output channel only.
- **FFmpeg must be on PATH** *or* set via `codecomfy.ffmpegPath`. Missing FFmpeg is a common user failure mode — error messages should name the exact fix.
