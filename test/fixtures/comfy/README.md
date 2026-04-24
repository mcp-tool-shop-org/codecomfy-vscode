# ComfyUI HTTP fixtures

This directory holds recorded ComfyUI HTTP transcripts so full-stack generation
flows (`/prompt` → `/history` polling → `/view` download) can be tested
deterministically without a live ComfyUI server.

## Why fixtures (not mocks)

Hand-crafted mocks drift from the real ComfyUI API shape. Every time ComfyUI
bumps a field or tweaks a status progression, mocked tests pass while real
runs break. Fixtures are a snapshot of the actual wire protocol — they catch
drift the moment someone re-records, and they give new contributors a copy of
"what real traffic looks like" to reason from.

## Layout

```
test/fixtures/comfy/
  README.md                       <- this file
  <preset-id>/                    <- one directory per preset + scenario
    index.json                    <- playback script: ordered sequence of requests
    01-prompt-response.json       <- POST /prompt response (JSON)
    02-history-poll-01.json       <- first GET /history/<id> (in_progress)
    03-history-poll-02.json       <- second GET /history/<id> (completed)
    04-view-frame_00001.png       <- binary /view response
    04-view-frame_00001.meta.json <- (optional) headers for above
```

Each preset directory is self-contained; fixtures never cross-reference.

### `index.json` shape

```json
{
  "sequence": [
    {
      "method": "POST",
      "urlPattern": "*/prompt",
      "status": 200,
      "bodyFile": "01-prompt-response.json",
      "bodyKind": "json"
    },
    {
      "method": "GET",
      "urlPattern": "*/history/*",
      "status": 200,
      "bodyFile": "02-history-poll-01.json",
      "bodyKind": "json"
    },
    {
      "method": "GET",
      "urlPattern": "*/history/*",
      "status": 200,
      "bodyFile": "03-history-poll-02.json",
      "bodyKind": "json"
    },
    {
      "method": "GET",
      "urlPattern": "*/view*",
      "status": 200,
      "bodyFile": "04-view-frame_00001.png",
      "bodyKind": "binary",
      "headers": { "content-type": "image/png" }
    }
  ]
}
```

- `method` — exact match, case-insensitive.
- `urlPattern` — glob with `*` wildcard. Matched left-to-right against the
  string form of the request URL.
- `status` — HTTP status to replay. Default 200.
- `bodyFile` — relative filename in this directory.
- `bodyKind` — `json` (default, parsed), `binary` (Uint8Array), or `text`.
- `headers` — optional, attached to the response's `.headers` plain object.

A fixture entry may also use an inline `body` field instead of a `bodyFile`
when the response is small and easy to read in the index directly.

## How to replay (in tests)

```ts
import * as path from 'path';
import { playbackFetch } from '../helpers';

const stub = playbackFetch(path.join(__dirname, '..', 'fixtures', 'comfy', 'hq-image'));
try {
    await runGeneration();
    assert.strictEqual(stub.remaining().length, 0, 'all fixture entries consumed');
} finally {
    stub.restore();
}
```

The stub fails loudly with a descriptive error on:

- a mismatched HTTP method,
- a `urlPattern` that doesn't match the actual URL,
- a sequence that gets exhausted but the source still calls `fetch()`,
- a missing `bodyFile`.

That loudness is deliberate — a silent mismatch turns into a ghostly test
failure hours later.

## How to record (manual)

Recording is a manual step Mike runs locally against his actual ComfyUI
instance. It is NOT part of CI — the fixtures committed here are the snapshot.

1. Start ComfyUI with `--listen 127.0.0.1 --port 8188`.
2. Run CodeComfy from the Extension Host dev workspace with the preset and
   inputs you want to capture.
3. Use a local proxy (mitmproxy, `node-http-proxy`, or the ad-hoc recorder
   script you keep at `scripts/record-fixture.mjs` — not tracked, per-dev)
   to capture:
   - `POST /prompt` request/response
   - every `GET /history/<prompt_id>` poll until `completed` is true
   - every `GET /view?...` response (image and/or frame downloads)
4. Save each response to a numbered file in `test/fixtures/comfy/<preset>/`.
5. Write an `index.json` describing the sequence.
6. Commit the fixture directory.

## When to re-record

Re-record whenever any of these change:

- the preset's `workflow` JSON (node set, types, ordering)
- the ComfyUI API (major version bump)
- the engine's request shape (`src/engines/comfyServerEngine.ts`)
- the `/view` response shape (new query params, new headers you rely on)

**Do NOT hand-edit fixture files.** A hand-edited fixture is a lie disguised
as evidence. Always re-record.

## Current fixture inventory

| Preset | Scenario | Notes |
|--------|----------|-------|
| `hq-image/` | (empty) | Template — Mike records locally; `index.json` is a placeholder. |

Each new preset gets its own directory. For scenario variants (success,
failure, mid-stream cancel), use a subdirectory: `hq-image/success/`,
`hq-image/failure/`.
