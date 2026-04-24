# Integration Testing

CodeComfy's integration tests drive the full job router → engine → ComfyUI → filesystem path using **fixture-recorded** ComfyUI responses. No live ComfyUI server is required in CI, and the tests are deterministic across machines.

This page is dev-facing. If you are a CodeComfy user, you can stop reading — this is about how contributors exercise the integration surface.

## Overview

The integration tests replace the HTTP client's real `fetch` with a `playbackFetch()` helper. The helper reads pre-recorded JSON and binary responses from `test/fixtures/comfy/<preset>/` and returns them in the same order a real ComfyUI would.

The rest of the stack (router, polling, downloader, pruner) runs unmodified — it sees the exact same response shapes it would see against a live server.

This gets us:

- Deterministic tests (same fixture bytes → same test result).
- No ComfyUI dependency in CI.
- Realistic coverage of error paths (malformed JSON, timeouts, partial downloads) — we just hand-craft a fixture for them.

## Recording a fixture

To add a new preset to the integration suite, or update an existing fixture after a ComfyUI API change, run the recorder against a **real, running ComfyUI**.

1. Start ComfyUI locally (default `http://127.0.0.1:8188`).
2. Make sure the checkpoint / custom nodes that the preset expects are installed.
3. Run the recorder script for the preset:

   ```bash
   npm run record:fixture -- --preset hq-image --prompt "a red apple on a wooden table"
   ```

   (The exact script name may vary — check `scripts/` in the repo. The pattern is: submit → poll → download, saving every response to disk.)

4. The recorder writes under `test/fixtures/comfy/<preset>/`:
   - `prompt-response.json` — response from `POST /prompt`.
   - `history-{01,02,...}.json` — successive poll responses from `GET /history/{prompt_id}`.
   - `view-{01,02,...}.bin` — raw bytes from `GET /view` (PNG for image, per-frame PNG for video).
   - `meta.json` — recording metadata (timestamp, ComfyUI version, preset id).

5. Commit the fixture directory to the repo.

## Replaying a fixture in a test

The `playbackFetch()` helper takes a fixture directory and returns a `fetch`-shaped function:

```typescript
import { playbackFetch } from '../helpers/playbackFetch';

const fetchStub = playbackFetch('test/fixtures/comfy/hq-image');
const engine = new ComfyServerEngine({ fetch: fetchStub, ... });

const result = await engine.generate(jobRequest, preset);
assert.strictEqual(result.success, true);
```

The helper walks the fixture directory in recording order: first the `POST /prompt` response, then the history responses (one per poll), then the `/view` downloads. A test that makes calls in a different order will fail with a clear mismatch error naming the expected vs actual URL.

## When to re-record

Re-record a fixture when:

- **The preset changes** — adding a node, changing a sampler, bumping step count. The ComfyUI response shape depends on the workflow graph.
- **ComfyUI's API shifts** — field renames, new status values, or changed response envelopes. Watch the ComfyUI changelog at major releases.
- **A workflow node is added or replaced** in a preset — new nodes produce new history entries.

If a test fails with a "URL mismatch" or "no more fixture responses" error after a preset edit, re-record is the fix.

## Caution: do not hand-edit fixtures

Fixture files look like plain JSON, but their **order and byte content** are load-bearing:

- Hand-editing a history response to change a status string can desync the poll count.
- Truncating a `/view` binary will silently produce corrupted images in the test's filesystem assertions.
- Adding or removing a response breaks the playback-order contract.

If a fixture needs to change, re-record it. If you cannot re-record (no local ComfyUI handy), open a PR with a clear reproduction so a maintainer with a local ComfyUI can do the record.

The CONTRIBUTING guide cross-references this doc from its test-writing section.
