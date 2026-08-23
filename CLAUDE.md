# codecomfy-vscode

## What this is

VS Code extension that drives a local (or remote) **ComfyUI** server to generate images and videos from inside the editor. The extension submits a workflow to ComfyUI, polls `/history`, streams frames via `/view`, and (for video) assembles frames with **FFmpeg**. Outputs land in `.codecomfy/outputs/` and run metadata in `.codecomfy/runs/` in the user's workspace.

This is a shipping extension (v1.1.0 in-repo; v1.0.2 live on the VS Code Marketplace under publisher `mcp-tool-shop` at time of writing — Phase-10 publish bumps the Marketplace to match). It is **not** a prototype, a formatting helper, a snippet manager, or a theme. Any prior description along those lines is stale scaffold — trust `src/` and `README.md`.

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
| Profiles | `src/profiles/registry.ts` | The six profiles + vendored KB access |
|  | `src/profiles/metadata.ts` | PNG provenance reader (stdlib, local-only) |
| Retrieval | `src/engines/retrieval.ts` | `/history` output-key contract; one collection path for all artifact kinds |
| Preflight | `src/engines/preflight.ts` | Names missing nodes/models before submitting |
| Injection | `src/engines/workflowInjection.ts` | Role-based link-walking; placeholder substitution |
| Types | `src/types/index.ts` | Shared contracts between layers |

## Commands contributed

- `codecomfy.runProfile` — **the main entry point.** Profile → preset → inputs,
  across all six profiles
- `codecomfy.readPngWorkflow` — metadata profile: read the graph embedded in a PNG
- `codecomfy.generateImageHQ` / `codecomfy.generateVideoHQ` — the original
  two-command fast paths (kept; marketplace-indexed)
- `codecomfy.customWorkflow` — run a user preset from `.codecomfy/presets/`
- `codecomfy.cancelGeneration`, `codecomfy.rerunJob`,
  `codecomfy.newPresetFromHQ`, `codecomfy.openGallery`,
  `codecomfy.openOutputChannel`

## The six profiles

CodeComfy drives the same capability profiles `comfy-headless` exposes
headlessly — **Image, Video, Audio, 3D, Inference, Metadata** — but
interactively. `metadata` is local-only (reads PNG provenance, never submits).

**Workflow graphs are vendored, not authored here.** `scripts/sync-kb.mjs`
(`npm run kb:sync`) pulls 27 verified reference graphs from
`mcp-tool-shop-org/comfy-headless`'s in-repo KB into `src/kb/`.
`npm run kb:check` fails when the copy drifts. Do NOT hand-edit `src/kb/*.json`
and do NOT hand-author new graphs — a wrong graph does not error, it runs green
and returns nothing.

Runtime inputs are derived from the placeholder tokens in each preset's own
graph (`PROMPT_TEXT`, `INPUT_IMAGE_REF.png`, `QUERY_TEXT`, …), so profiles are
not special-cased in the command.

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
- **Platform facts are verified, not assumed.** `docs/comfy-agent-thread.md`
  carries the ComfyUI 0.23.0 source references behind the retrieval contract,
  the injection anchors, and the preflight routes. Check it before changing any
  of them.
- **FFmpeg is optional** — presets ending in `CreateVideo` → `SaveVideo` are
  encoded server-side. Only frame-assembly presets need it.
- **FFmpeg must be on PATH** *or* set via `codecomfy.ffmpegPath`. Missing FFmpeg is a common user failure mode — error messages should name the exact fix.
