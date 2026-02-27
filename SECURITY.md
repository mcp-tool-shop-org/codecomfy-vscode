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
