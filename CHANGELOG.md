# Changelog

All notable changes to the **CodeComfy** VS Code extension are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

## [1.3.0] - 2026-08-22

The six-profile release. CodeComfy now drives the same capability profiles
`comfy-headless` exposes headlessly — **Image, Video, Audio, 3D, Inference,
Metadata** — but interactively, from the editor.

### Fixed

- **Every output that was not an image was silently discarded.** The history
  validator preserved only the `images` key, so nothing else survived
  validation. ComfyUI does not use a uniform key: `VHS_VideoCombine` reports
  under `gifs`, `SaveAudioAdvanced` under `audio`, `SaveGLB` under `3d`, and
  `SaveText` under `text` + `files`. This made audio, 3D, inference, and
  VHS-terminated video structurally unretrievable — the run would complete
  successfully and CodeComfy would report no outputs. All keys are now read.
- **"No outputs received from ComfyUI" was a dead end.** The message now names
  the preset's terminators and the key each was expected to write, and calls
  out the case where a graph has no output node at all (which runs green and
  returns nothing by design).

### Added

- **`CodeComfy: Run… (all profiles)`** — profile → preset → inputs. The inputs
  are derived from the placeholder tokens in the chosen preset's own graph, so
  an image-to-video preset asks for a source image and a text-to-video preset
  does not, with no per-profile special-casing.
- **27 verified reference workflows**, vendored from `comfy-headless` v3.1.0's
  in-repo KB by `scripts/sync-kb.mjs` (`npm run kb:sync`, `npm run kb:check`).
  CodeComfy does not author workflow graphs — a second hand-maintained copy
  would drift, and drift in a graph is silent. Covers image (Qwen txt2img,
  Qwen edit, union ControlNet for Qwen and SDXL), video (Hunyuan 1.5 i2v and
  720p, Wan 14B, LTX, Mochi, core-output), audio (ACE-Step 1.5 music/jingle/
  draft/mp3, stem separation), 3D (Hunyuan3D-2 draft/standard/detail), and
  inference (Florence-2 caption/detailed/more-detailed/tag/detect/segment/OCR).
- **Preflight.** Before anything is submitted, each preset's `class_type`s are
  checked against `GET /object_info/{class}` and its model files against
  `GET /models/{folder}`. A missing node names the pack that provides it; a
  missing model names the file and the folder it belongs in. Nothing is
  submitted, so no GPU time is spent on a run that cannot succeed. A server
  too old to list models degrades to "skipped", never to a false negative.
- **Image upload** — `ComfyServerEngine.uploadFile()` posts to `/upload/image`
  and returns the name the **server** stored it under, which is the only
  trustworthy handle (with `overwrite` off the server renames on collision).
- **Metadata profile** — `CodeComfy: Read Workflow from PNG` extracts the graph
  ComfyUI embeds in its outputs. Pure stdlib PNG chunk parsing (`tEXt`, `zTXt`,
  `iTXt`), bounds-checked against the buffer and capped against zip bombs,
  because a PNG is untrusted input. Prefers the `prompt` chunk (API format,
  re-submittable) over `workflow` (editor format, not accepted by `/prompt`).
- **Placeholder substitution** — reference graphs carry literal tokens
  (`PROMPT_TEXT`, `INPUT_IMAGE_REF.png`, `QUERY_TEXT`, …) wherever a runtime
  value belongs. These are substituted by exact whole-value match, and a graph
  with an unfilled token is refused rather than submitted with the literal
  token as a filename.
- **28 new tests** (476 total, up from 448), including a regression guard that
  a `gifs`-keyed output is retrievable.

### Changed

- `GenerationKind` extends to `image | video | audio | 3d | inference`.
- `Artifact.type` extends to `image | video | audio | model3d | text`.
  Consumers that only understand image/video should treat unknown kinds as
  opaque files rather than assuming they are images.
- Artifact collection is now a single path for all profiles; the frame-sequence
  branch is entered only when the outputs actually look like loose frames.


## [1.2.0] - 2026-08-22

Platform-contract release. Every claim behind these changes was verified
against **ComfyUI 0.23.0 source** rather than inferred — see
`docs/comfy-agent-thread.md` for the file/line references behind each one.

### Fixed

- **`Generate Video (HQ)` did not produce video (shipped defect).** Through
  v1.1.0 the `hq-video` preset was an SDXL text-to-image graph with
  `EmptyLatentImage.batch_size` set to the frame count, decoded to N PNGs and
  assembled by FFmpeg. There was **no temporal model anywhere in that graph**,
  so every frame was generated independently from the same prompt: the output
  flickered rather than moving. The command has been shipping in that state
  since v1.0.0 and the defect was ours, not a ComfyUI limitation.

  `hq-video` is now **Wan 2.2 TI2V-5B**, derived verbatim from ComfyUI's own
  `video_wan2_2_5B_ti2v` template — a real temporal model whose latent takes
  `length` in frames. Wan 2.2 is Apache-2.0, so output is commercial-safe.
  **It requires three model files** that are named, with download URLs and
  target folders, in the preset's new `requires` block and in the README.

- **`codecomfy.defaultCheckpoint` was a silent no-op on most modern models.**
  The override only ever matched `CheckpointLoaderSimple`, which does not
  appear in any split-stack graph (Flux, Qwen-Image, SD3.5, Wan, ACE). The
  setting reported success while changing nothing. It now warns explicitly
  when a workflow has no checkpoint node to apply to.

- **Positive and negative prompts could be swapped.** Which `CLIPTextEncode`
  received the negative prompt was decided by looking for the word "negative"
  in `_meta.title`, or `neg` in the node id. `_meta` is frontend metadata that
  `/prompt` ignores and that hand-written or programmatically generated graphs
  may omit entirely, in which case both encoders received the positive prompt.

- **Fractional values could be silently truncated by the server.** ComfyUI
  coerces INT inputs with `int(val)` rather than rejecting them
  (`execution.py:970`), so a computed `steps: 30.7` became `30` with no error.
  All INT-typed injections are now explicitly rounded before submission.

- **Off-grid frame counts.** Temporal latents declare `length` with step 4
  (Wan/Hunyuan) or 8 (LTX), but `step` is a UI hint — `/prompt` validation
  enforces only min/max, so ComfyUI neither rejects nor snaps an off-grid
  value. Frame counts are now snapped up to the next legal `4n + 1` value
  before submission.

### Added

- **Server-side video encoding — FFmpeg is now optional.** Presets ending in
  `CreateVideo → SaveVideo` (both core ComfyUI nodes) are muxed by the server.
  ComfyUI reports the result under the `images` key of `/history` outputs with
  the same `{filename, subfolder, type}` triple as a still, so the existing
  download path collects it unchanged. When a server-encoded container is
  detected, FFmpeg is never invoked. Frame-assembly presets still work exactly
  as before.
- **Role-based workflow injection** (`src/engines/workflowInjection.ts`).
  Runtime values are placed by following links from the sampler rather than by
  matching `class_type` names, so split-stack and custom-sampling graphs are
  handled correctly. `SamplerCustomAdvanced` is resolved through its guider;
  `CFGGuider` receives `cfg`; a `BasicGuider` graph is correctly identified as
  having no negative-conditioning path at all.
- **`requires` block on presets** (`schemas/codecomfy-preset.schema.json`) —
  declares the model files a preset needs, with folder and download URL, so a
  missing model can be named rather than surfacing as an opaque node error.
- **21 new tests** covering the injection module (448 total, up from 427).

### Changed

- The negative-prompt value is no longer merged into the positive prompt on
  guidance-distilled graphs; it is dropped, with a warning naming why.
- `hq-video` defaults are now 1280×704 @ 24fps, 2s (49 frames), steps 20,
  cfg 5, `uni_pc`/`simple` — the official template's recipe.


## [1.1.0] - 2026-04-24

This release is the output of a 10-phase dogfood swarm: full health pass
(bug/security → proactive → humanization), a 6-feature pass, and a
complete treatment sweep. 247 → 427 tests; `.vsix` 2.74 MB → 176 KB.

### Added

- **Custom workflow picker (FT-1).** `CodeComfy: Generate from Custom
  Workflow` command lets you run any ComfyUI workflow JSON from
  `.codecomfy/presets/*.json` in your workspace — not just the shipped
  HQ presets. QuickPick shows bundled + user-authored presets.
- **Completion notification (FT-2).** `showInformationMessage` on
  success with three actions: **Open Output**, **Open Gallery**, **Open
  Outputs Folder**. New opt-out setting `codecomfy.notifyOnComplete`
  (default `true`) for users who prefer silent status-bar-only updates.
  Errors are always shown regardless.
- **Run history TreeView (FT-4).** Activity-bar tree of previous
  generations, read from `.codecomfy/outputs/index.json`. Right-click
  any run to **Re-run** it with the same request. Auto-refreshes on
  file change. Minimum-viable scope (no filters, tags, rename, or bulk
  ops — those can come later if needed).
- **Preset authoring command (FT-6).** `CodeComfy: Create Preset from
  HQ Template` copies a bundled HQ preset to
  `.codecomfy/presets/<your-name>.json` with name validation and opens
  it in the built-in JSON editor.
- **JSON Schema for user presets (FT-6).**
  `schemas/codecomfy-preset.schema.json` + `contributes.jsonValidation`
  auto-associates the schema with `.codecomfy/presets/*.json` so VS
  Code renders inline validation errors while you edit.
- **`Preset.description` field.** Optional human-readable description
  used in QuickPick labels and the handbook. Fully backward-compat.
- **`onComplete` callback.** Both `IGenerationEngine.generate()` and
  `JobRouter.run()` now accept an optional callback that fires once per
  run with `CompletionMetadata` (total elapsed ms, phase breakdown,
  frame count, artifact count). Backward-compat additive.
- **Integration test harness (FT-5).** `playbackFetch(fixtureDir)` +
  `fakeResponse()` helpers in `test/helpers.ts` let tests replay
  recorded ComfyUI HTTP responses for deterministic full-stack flows.
  Fixture contract documented in `test/fixtures/comfy/README.md`.
  Dev-facing guide at `docs/integration-testing.md`.
- **Node-injection observability (FT-1).** `buildWorkflow()` now warns
  when user-authored workflows contain class_types outside the
  auto-injectable set (`CLIPTextEncode`, `KSampler`, `EmptyLatentImage`,
  `CheckpointLoaderSimple`) — and prominently when zero nodes matched
  any rule.
- **HTTP contract docstring** at the top of `ComfyServerEngine` lists
  every endpoint the engine calls, in order, with shapes and timeouts.
  Reference for future test-fixture recorders.
- **`ArtifactProvenance` interface.** Typed replacement for the
  previously-open `provenance: Record<string, unknown>` field on
  `IndexedArtifact`. Documents the fields TreeView reads
  (`prompt`, `preset_id`, `checkpoint`, and for video
  `meta.thumbnail_path` / `duration_seconds` / `fps`).
- **Declarative injection map.** Refactored `buildWorkflow()` into an
  `INJECTABLE_NODES` table; exported `INJECTABLE_CLASS_TYPES` so the
  handbook and JSON Schema can enumerate supported node types.
- **Handbook pages.** New `presets.md` (user-authored preset guide) and
  `run-history.md` (TreeView walkthrough). `configuration.md` gains
  rows for `defaultCheckpoint` and `notifyOnComplete`. `usage.md`
  mentions the completion notification + opt-out.
- **README Features section.** English README lists the new
  capabilities; translations refreshed at release time.
- **Structured filename validation error.** `ComfyResponseError` now
  carries an optional `fieldPath` so the Output channel can name which
  field rejected a response (e.g. `filename`, `status.completed`).
- **Test coverage** grew from 247 to 427 passing tests: adversarial
  path-traversal tests (43), ComfyServerEngine public-API coverage
  (28), tree-view / extension-activation / new-preset command tests
  (36), integration test helpers (18), plus misc hardening. 0 failing,
  0 lint warnings.

### Changed

- **Cancel UX.** Status bar flips to `$(circle-slash) Cancelling...`
  **synchronously** on Cancel click, before awaiting the async cancel
  — no more multi-second "still generating?" confusion.
- **Output channel headers.** Every generation starts with a structured
  header block (command name, timestamp, ComfyUI URL, FFmpeg status)
  so back-to-back runs are easy to scan in the output channel.
- **Activation health check.** Before prompting for input on the first
  command, the extension now verifies ComfyUI is reachable (cached for
  60 s) — no more committing to a prompt only to be told the server is
  down.
- **README install section** rewritten across all 8 languages to lead
  with the VS Code Marketplace (published since v1.0.1) and treat VSIX
  as the alternative path.
- **CLAUDE.md** rewritten to reflect the ComfyUI-driver reality — not
  the stale scaffold description it used to carry.
- **Extension branding.** Refreshed logo and icon; brand assets load
  from the shared `mcp-tool-shop-org/brand` repo instead of shipping
  in every `.vsix`.
- **VS Code settings UI.** All configuration entries migrated from
  plain `description` to `markdownDescription` with links, defaults
  formatted as code, and clearer requirement language.
- **TreeView-required writer contract.** `updateIndex()` logs a WARN
  when any artifact is written without the fields TreeView needs.
  Lenient with old data (no throw) — guides writers without breaking
  existing indexes.

### Fixed

- **Hardcoded checkpoint (FT-3).** Shipped HQ presets referenced
  `juggernautXL_v9Rundiffusionphoto2.safetensors`, causing first-run
  failures for users without that exact model. New
  `codecomfy.defaultCheckpoint` setting overrides `ckpt_name` on every
  `CheckpointLoaderSimple` node at workflow-build time. Empty default
  → preset value wins (backward-compat). When ComfyUI reports
  "model not found", the user-facing message now suggests setting
  `codecomfy.defaultCheckpoint` to an installed model.
- **`.vsix` size reduced from 2.74 MB to 176 KB** by moving large brand
  assets to the shared brand repo and tightening `.vscodeignore`.
- **Output channel lifecycle.** Now registered with
  `context.subscriptions` so VS Code disposes it uniformly on
  deactivation.
- **Idle timer cleanup.** `deactivate()` clears any pending idle timer
  so it cannot fire against a disposed UI.
- **Silent fallbacks now loud.** Index-file parse errors, atomic-rename
  failures, sanitizer rejections, and malformed user-preset loads all
  log actionable warnings instead of silently absorbing the problem.
- **`package-lock.json`** synced to `package.json` (was one patch
  version behind; `npm ci` could fail in CI).
- **ESLint** now ignores the Astro build output (`site/.astro`,
  `site/dist`) so lint is clean even when the handbook site has been
  built locally.

### Security

- **Path-traversal hardening.** Added `sanitizeComfyFilename()` to
  reject path-traversal segments (`../`), absolute paths, null bytes,
  and path separators in filenames returned by ComfyUI. Applied at
  every untrusted filename touchpoint in the download path. A
  compromised ComfyUI server (or a hostile proxy) can no longer write
  outside the workspace run folder.
- **Documented threat model.** `SECURITY.md` now includes a "Threat
  Model & Mitigations" section describing the trust boundary, the
  attack surface, the defense, and explicit scope limits.
- **Request timeouts.** `AbortSignal.timeout` now bounds every ComfyUI
  HTTP call: 30 s for `/view` downloads, 10 s for `POST /prompt`, 5 s
  for `/history` polling. The extension no longer hangs indefinitely
  when ComfyUI stalls mid-request.
- **Dependency audit.** Closed 8 transitive CVEs via `npm audit fix`
  (ajv, brace-expansion, flatted, lodash, minimatch, underscore,
  undici). Forced `serialize-javascript@^7.0.5` via npm `overrides` to
  patch a HIGH RCE CVE in the transitive `mocha` dep chain (upstream
  mocha has not yet bumped). Dev-only surface; runtime is unaffected.
  4 remaining MODERATE vulns in the `@vscode/vsce → @azure/identity →
  uuid (<14)` chain are packaging-tool-only; tracked for a follow-up
  when upstream lands a `@azure/identity` bump.
- **`npm audit` in CI** is no longer silenced — removed the `|| true`
  on the audit step and added `--audit-level=high` so real CVEs fail
  the build going forward.

## [1.0.2] - 2026-03-25

### Added
- ComfyUI URL validation — `comfyuiUrl` setting now validates protocol (http/https only), hostname, and format before use
- `validateComfyUrl()` in `src/validation/url.ts` with trailing-slash normalization
- 12 new tests for URL validation (247 total)

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
