# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.0.x   | Yes       |
| 0.x     | No        |

## Reporting a Vulnerability

Email: **64996768+mcp-tool-shop@users.noreply.github.com**

Include:
- Description of the vulnerability
- Steps to reproduce
- Version affected
- Potential impact

### Response timeline

| Action | Target |
|--------|--------|
| Acknowledge report | 48 hours |
| Assess severity | 7 days |
| Release fix | 30 days |

## Scope

CodeComfy is a VS Code extension that generates images and videos via a local ComfyUI server and optional FFmpeg assembly.

- **Data touched:** HTTP requests to user-configured ComfyUI server URL (default `127.0.0.1:8188`), FFmpeg subprocess for video assembly, workspace files written to `.codecomfy/outputs/` and `.codecomfy/runs/`
- **Data NOT touched:** no files outside the workspace, no OS credentials, no login sessions
- **Network:** connects only to the user-configured ComfyUI URL — no other outbound requests
- **FFmpeg safety:** `shell: true` removed from all spawns, path must be absolute and validated
- **No telemetry** is collected or sent
- **No secrets** in source or diagnostics output

## Threat Model & Mitigations

CodeComfy talks to a ComfyUI server over HTTP. The user picks that server. This section is explicit about what we trust, what we don't, and what we defend.

### Trust assumption

**The user is responsible for the ComfyUI server they point the extension at.** The default (`http://127.0.0.1:8188`) is a local loopback server the user started themselves. If the user configures a remote URL, they are trusting that server — CodeComfy cannot verify the remote machine is uncompromised.

### Known attack surface: malicious filenames in `/view` responses

A compromised ComfyUI server — or a malicious HTTP proxy sitting between the extension and a legitimate ComfyUI — can return arbitrary bytes in the history JSON response. The filename fields are the sensitive ones: CodeComfy downloads each filename from `/view` and writes it into the workspace run folder. A crafted response could include:

- Path-traversal patterns: `../../etc/passwd`, `..\\..\\Windows\\System32\\drivers\\etc\\hosts`
- Absolute paths: `/etc/shadow`, `C:\\Users\\victim\\.ssh\\id_rsa`
- Null bytes: `evil\0.png` (to truncate C-string-based downstream handlers)
- Non-leaf paths with separators: `subdir/evil.png`
- Platform-quirky names that round-trip differently through `path.basename()`

Without validation, any of these could cause the extension to write outside the intended run folder.

### Defense: `sanitizeComfyFilename()`

All filenames arriving from `/view` responses are fail-closed validated by [`sanitizeComfyFilename()`](src/engines/comfyValidation.ts) before they are joined into any filesystem path. The helper rejects non-strings, empty or whitespace-only input, null bytes, path separators (`/` or `\\`), parent-traversal segments (`..`), absolute paths (POSIX and Windows forms), and any input where `path.basename(input) !== input` as a defence-in-depth round-trip check.

The helper is applied at **three untrusted-filename touchpoints** in `src/engines/comfyServerEngine.ts`:

1. `collectImages()` — the `filename` extension extraction path
2. `collectFrames()` — the frame artifact `relativePath` construction
3. `collectFrames()` — the per-frame download path

Rejected filenames raise a `ComfyResponseError('filename', …)` with a machine-readable `fieldPath` so the Output channel can surface which field and which rejection rule fired (e.g. `path-traversal`, `null-byte`, `absolute-path`). Rejected filenames are logged at **WARN** level so a compromised server produces visible noise rather than silent dropped frames.

The structural fix landed in commit [`0f83941`](https://github.com/mcp-tool-shop-org/codecomfy-vscode/commit/0f83941) (amend stage-a-2), which also closed two sibling touchpoints that shared the same untrusted-input shape.

### Scope limits

Even if a filename somehow slipped past the sanitizer, the extension only ever writes to `.codecomfy/outputs/` and `.codecomfy/runs/` under the **user's active VS Code workspace folder**. It does not write to system paths, does not read arbitrary workspace files, and does not expose any read/write API to other extensions or web pages.

### Out of scope

- The extension does not defend against the user pointing `codecomfy.comfyuiUrl` at a hostile server and then uploading sensitive prompts. Prompt content is whatever the user types — it is sent to the configured server as-is.
- The extension does not defend against ComfyUI itself running malicious custom nodes. ComfyUI's node sandboxing (or lack thereof) is out of scope.
- The extension does not audit FFmpeg binaries. The `codecomfy.ffmpegPath` validator only checks that the path is absolute and points to a real executable — it cannot tell if that executable has been replaced.
