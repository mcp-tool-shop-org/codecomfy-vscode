# Ship Gate

> No repo is "done" until every applicable line is checked.
> Copy this into your repo root. Check items off per-release.

**Tags:** `[all]` every repo · `[npm]` `[pypi]` `[vsix]` `[desktop]` `[container]` published artifacts · `[mcp]` MCP servers · `[cli]` CLI tools

**Last audit:** 2026-04-24 · **Version audited:** v1.0.2 (live on the VS Code Marketplace as `mcp-tool-shop.codecomfy-vscode` since 2026-03-26)
**Overall status:** **PASS** — Hard gates A–D all pass at v1.0.2. Soft gate E fully met.

---

## A. Security Baseline

- [x] `[all]` SECURITY.md exists (report email, supported versions, response timeline) (2026-02-27 — re-verified 2026-04-24)
- [x] `[all]` README includes threat model paragraph (data touched, data NOT touched, permissions required) (2026-02-27 — re-verified 2026-04-24, see "Security & Data Scope")
- [x] `[all]` No secrets, tokens, or credentials in source or diagnostics output (2026-02-27 — re-verified 2026-04-24)
- [x] `[all]` No telemetry by default — state it explicitly even if obvious (2026-02-27 — re-verified 2026-04-24, README "No telemetry is collected or sent")

### Default safety posture

- [ ] `[cli|mcp|desktop]` SKIP: not a CLI, MCP server, or desktop app — VS Code extension
- [ ] `[cli|mcp|desktop]` SKIP: not a CLI, MCP server, or desktop app (file ops constrained to workspace .codecomfy/ directory)
- [ ] `[mcp]` SKIP: not an MCP server
- [ ] `[mcp]` SKIP: not an MCP server

## B. Error Handling

- [x] `[all]` Errors follow the Structured Error Shape: `code`, `message`, `hint`, `cause?`, `retryable?` (2026-02-27 — re-verified 2026-04-24; categorized errors: [Network], [Server], [API], [IO] with troubleshooting hints)
- [ ] `[cli]` SKIP: not a CLI tool
- [ ] `[cli]` SKIP: not a CLI tool
- [ ] `[mcp]` SKIP: not an MCP server
- [ ] `[mcp]` SKIP: not an MCP server
- [ ] `[desktop]` SKIP: not a desktop app
- [x] `[vscode]` Errors surface via VS Code notification API — no silent failures (2026-02-27 — re-verified 2026-04-24)

## C. Operator Docs

- [x] `[all]` README is current: what it does, install, usage, supported platforms + runtime versions (2026-04-24 — install section rewritten to lead with Marketplace; all 8 language READMEs updated for v1.0.2)
- [x] `[all]` CHANGELOG.md (Keep a Changelog format) (2026-02-27 — updated 2026-03-25 for v1.0.2; re-verified 2026-04-24)
- [x] `[all]` LICENSE file present and repo states support status (2026-02-27 — re-verified 2026-04-24)
- [ ] `[cli]` SKIP: not a CLI tool
- [ ] `[cli|mcp|desktop]` SKIP: not a CLI, MCP server, or desktop app
- [ ] `[mcp]` SKIP: not an MCP server
- [ ] `[complex]` SKIP: single-purpose extension, not complex enough for HANDBOOK

## D. Shipping Hygiene

- [x] `[all]` `verify` script exists (test + build + smoke in one command) (2026-02-27 — re-verified 2026-04-24: `npm test && npm run compile && npx vsce package --no-dependencies`)
- [x] `[all]` Version in manifest matches git tag (2026-04-24 — package.json at v1.0.2, matches shipped Marketplace release)
- [x] `[all]` Dependency scanning runs in CI (ecosystem-appropriate) (2026-02-27 — re-verified 2026-04-24, `.github/workflows/ci.yml` runs npm audit)
- [x] `[all]` Automated dependency update mechanism exists (2026-02-27 — re-verified 2026-04-24, npm audit job in CI)
- [ ] `[npm]` SKIP: published as vsix, not npm
- [ ] `[npm]` SKIP: published as vsix, not npm
- [ ] `[npm]` SKIP: published as vsix, not npm
- [x] `[vsix]` `vsce package` produces clean .vsix with correct metadata (2026-02-27 — re-verified 2026-04-24; v1.0.2 packaged and live on Marketplace as `mcp-tool-shop.codecomfy-vscode`)
- [ ] `[desktop]` SKIP: not a desktop app

## E. Identity (soft gate — does not block ship)

- [x] `[all]` Logo in README header (2026-02-27 — re-verified 2026-04-24, brand URL `raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/codecomfy-vscode/readme.png`)
- [x] `[all]` Translations (polyglot-mcp, 8 languages — en, ja, zh, es, fr, hi, it, pt-BR) (2026-02-27 — install section re-synced 2026-04-24)
- [x] `[org]` Landing page (@mcptoolshop/site-theme) (2026-02-27 — re-verified 2026-04-24, `mcp-tool-shop-org.github.io/codecomfy-vscode/` deployed via `pages.yml`)
- [x] `[all]` GitHub repo metadata: description, homepage, topics (2026-02-27 — re-verified 2026-04-24)
- [x] `[all]` README badges: CI + Landing Page live (re-verified 2026-04-24)

---

## Gate Rules

**Hard gate (A–D):** Must pass before any version is tagged or published.
If a section doesn't apply, mark `SKIP:` with justification — don't leave it unchecked.

**Soft gate (E):** Should be done. Product ships without it, but isn't "whole."

**Checking off:**
```
- [x] `[all]` SECURITY.md exists (2026-02-27)
```

**Skipping:**
```
- [ ] `[pypi]` SKIP: not a Python project
```

---

## Audit history

| Date | Version | Auditor | Outcome |
|------|---------|---------|---------|
| 2026-02-27 | v1.0.0 | Initial Shipcheck | PASS — all applicable hard gates passed; v1.0.0 tagged and published |
| 2026-04-24 | v1.0.2 | Dogfood swarm wave-2 re-audit | PASS — re-verified all hard gates A–D against current repo state; README install sections updated across all 8 languages to reflect Marketplace availability; no regressions since v1.0.0; v1.0.1 URL-validation release (2026-03-25) and v1.0.2 remain within gate |
