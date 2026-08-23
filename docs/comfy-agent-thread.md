# Verified ComfyUI platform contract — and what it changes

Six briefs went to the **Comfy Cloud in-app agent**; rounds 1–5 came back in one relay and were
verified here against **local ComfyUI 0.23.0 source** (`E:/AI-Models/ComfyUI_windows_portable/
ComfyUI`) plus the verified license KB in `readouts/model-knowledge/models.db`.

**Thread archive:** `E:/AI/readouts/model-knowledge/dialogs/comfy-agent/`
(`2026-08-22-codecomfy-*`; the ledger is `-01-05-verification.md`).

Everything below marked **[SRC]** is read from ComfyUI 0.23.0 source and is safe to code against
for that version. Older servers predate `execution_success`, `CreateVideo`/`SaveVideo`, and
possibly `/models` — so **feature-probe, never version-assume**.

## Known defect, recorded so it is not built upon

`src/presets/hq-video.json` is **not a video workflow.** It is
`CheckpointLoaderSimple → CLIPTextEncode ×2 → EmptyLatentImage → KSampler → VAEDecode →
SaveImage`, with `JobRouter` injecting `frame_count = ceil(fps × duration_seconds)` as
`EmptyLatentImage.batch_size` (default 24 × 4 = 96) and `ffmpeg.ts` assembling the results.
No temporal model — N independent SDXL images played back fast.

**Replacement is now specified:** Wan 2.2 (TI2V-5B for ~16 GB, T2V/I2V-A14B above),
**Apache-2.0, `commercial_use=yes`, verified** in the KB. LTX-2.3 (revenue-gated community
license) and HunyuanVideo 1.5 (Tencent community license) are **disqualified as shipped
defaults** — we ship presets to strangers whose commercial situation we cannot know.

## Settled facts that change the code

### 1. FFmpeg becomes optional — and it is a preset swap, not an engine rewrite

**[SRC]** `SaveVideo` returns `ui.PreviewVideo`, whose `as_dict()` is
`{"images": [...], "animated": (True,)}` (`comfy_api/latest/_ui.py:433`), and each entry is
`SavedResult(filename, subfolder, type)` (`_ui.py:27-30`) — **the same triple
`collectImages()` already parses.**

So a `CreateVideo → SaveVideo` preset lands in `/history` under `images` and downloads through
the existing path **unchanged**. `animated: [true]` is the marker distinguishing a clip from a
still. Both nodes are core (`comfy_extras/nodes_video.py`), so no custom pack is required.

Gate the FFmpeg-free path on `GET /object_info/CreateVideo` returning non-empty; fall back to
frame-assembly for older servers.

### 2. INT inputs are silently truncated, not rejected

**[SRC]** `execution.py:970` — `if input_type == "INT": val = int(val)`, inside a try/except.
`FLOAT`/`STRING`/`BOOLEAN` coerce the same way. Only a conversion that *raises* produces
`invalid_input_type`; min/max is a separate later check (`value_smaller_than_min`).

**Consequence:** `steps: 30.7` becomes 30 and `width: 1024.9` becomes 1024, with no error.
Any computed injection (`frame_count`, a randomized seed, a scaled dimension) must be
integer-cast before submit. COMBO is *not* in the coercion block — those are exact strings,
near-miss is a hard reject (`value_not_in_list`, `:1048`).

### 3. The injection map needs role-based matching, not a class-name list

**[SRC]** `SamplerCustomAdvanced` takes `noise, guider, sampler, sigmas, latent_image` — no
`positive`/`negative` and no `steps` (`nodes_custom_sampler.py:936-944`). Conditioning hangs off
the guider: `CFGGuider` = `model, positive, negative, cfg` (`:818-825`); `BasicGuider` =
`model, conditioning` with **no negative at all** (`:796-801`) — the guidance-distilled path.

Replace the `_meta.title` contains-"negative" heuristic in
`src/engines/comfyServerEngine.ts` with a link-walk: **sampler → if it has `negative`, follow it;
else if it has `guider`, follow that node's `negative`; else there is no negative conditioning —
hide the negative-prompt input box.** `cfg` moves with the guider too, so it is not always on the
sampler.

**Seed detection [SRC]:** `control_after_generate: true` appears in `/object_info` as a **config
flag on the seed input's options dict** (`nodes.py:1565`, `:1594`) — a reliable marker for "this
INT is a seed" that beats matching the name, and covers `noise_seed` and custom nodes for free.
It is a flag, not an input name: **never emit it as a key in submitted `inputs`.**

### 4. Video length is `length` in frames, on a grid we must snap ourselves

**[SRC]** `EmptyHunyuanLatentVideo` and `Wan22ImageToVideoLatent` take `width, height, length`
with **step 4** (defaults 25 / 49); `EmptyLTXVLatentVideo` uses **step 8** (default 97).
`step` is a **UI hint only** — validation checks min/max and nothing else, so the API will
neither reject nor snap an off-grid `length`.

Our current "seconds × fps → `batch_size`" model is wrong twice over: the field is `length`, not
`batch_size`, and playback fps belongs on `CreateVideo.fps`, independent of frame count.

### 5. Mask polarity: white regenerates

**[SRC]** `VAEEncodeForInpaint` (`nodes.py:416-423`) computes `m = (1.0 - mask.round())` and
pushes pixels toward neutral where `m` is 0 — i.e. **where the mask is 1** — then returns
`noise_mask = mask_erosion.round()`. **Mask value 1 (white) = regenerate; 0 (black) = keep.**
Load-bearing for any programmatic mask generation.

### 6. Endpoint surface (ComfyUI 0.23.0 route table)

**[SRC]** `GET`: `/ws`, `/models`, `/models/{folder}`, `/object_info`, `/object_info/{class}`,
`/system_stats`, `/features`, `/prompt`, `/queue`, `/history`, `/history/{id}`, `/view`,
`/view_metadata/{folder}`, `/embeddings`, `/extensions`, `/api/jobs`, `/api/jobs/{id}`.
`POST`: `/prompt`, `/queue`, `/interrupt`, `/free`, `/history`, `/upload/image`, `/upload/mask`.

- `/models/{folder}` is the cheap model-list route — prefer it over parsing all of
  `/object_info` to populate a checkpoint picker. Fall back to the loader class's COMBO.
- **[SRC]** `/api`-prefixed aliases are registered from the same route table, always
  (`server.py:1067-1074`), so either path works on a direct connection.
- `/upload/image` fields are `image`, `subfolder`, `type`, `overwrite`; the server derives the
  saved filename, so **the returned name is the only trustworthy handle**.
- `/features` is a capability-flags endpoint neither side raised — worth a look before building
  our own handshake.

### 7. WebSocket: pure optimization, safe to layer on

**[SRC]** `/ws?clientId=` — if omitted, the server mints a UUID and returns it in the first
`status` message as `data.sid` (`server.py:257-276`). Events confirmed present:
`status`, `execution_start`, `execution_cached`, `executing`, `progress`, `executed`,
`execution_error`, `execution_interrupted`, `execution_success`, `progress_state`.
`display_node` is a **field inside** `executing`/`executed`, not an event type.

Binary previews are framed `[uint32 BinaryEventTypes][uint32 imageType][bytes]`, imageType
1=JPEG / 2=PNG (`server.py:1142`, `:1158-1169`); `protocol.py` also defines
`UNENCODED_PREVIEW_IMAGE=2`, `TEXT=3`, `PREVIEW_IMAGE_WITH_METADATA=4`.

Nothing in the artifact path is socket-only, so **polling stays authoritative and the socket is
a pure progress upgrade** — a socket failure degrades to exactly today's behavior. On reconnect
the server proactively sends `executing` with `last_node_id` (`:278`).

## Standing rule earned from this relay

**Read the local ComfyUI source first; ask the agent only what source cannot answer** — live
catalog contents, template bodies, cloud behavior, and model weights/licenses. Rounds 1–5 asked
the agent to characterise a runtime it told us up front it cannot see, while its source sat on
this rig the whole time.

## Still open

- Verbatim Wan 2.2 template bodies (`video_wan2_2_5B_ti2v`, `video_wan2_2_14B_i2v`) — the agent
  offered a free `get_template` pull; template bodies are catalog content that source-reading
  cannot substitute for.
- Round 6 (queue / determinism / Cloud backend) is written but unsent.
- `/upload/mask` compositing semantics, and the local `/view` → `/upload/image` round-trip, are
  plausible but unproven end-to-end.
