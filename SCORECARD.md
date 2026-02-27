# Scorecard

> Score a repo before remediation. Fill this out first, then use SHIP_GATE.md to fix.

**Repo:** codecomfy-vscode
**Date:** 2026-02-27
**Type tags:** `[all]` `[vsix]`

## Pre-Remediation Assessment

| Category | Score | Notes |
|----------|-------|-------|
| A. Security | 4/10 | SECURITY.md template only, no threat model in README, FFmpeg safety already good |
| B. Error Handling | 9/10 | Categorized errors [Network]/[Server]/[API]/[IO], VS Code notifications, structured logging |
| C. Operator Docs | 8/10 | README comprehensive with troubleshooting, CHANGELOG excellent, no threat model |
| D. Shipping Hygiene | 6/10 | CI has lint+test+compile, no verify script, no dep audit, version 0.5.5 |
| E. Identity (soft) | 10/10 | Logo, translations, landing page, GitHub metadata all present |
| **Overall** | **37/50** | |

## Key Gaps

1. SECURITY.md template only — no real data scope (Section A)
2. README missing threat model paragraph (Section A)
3. No `verify` script (Section D)
4. No dep audit in CI (Section D)
5. Version at 0.5.5 — needs 1.0.0 bump (Section D)

## Post-Remediation

| Category | Before | After |
|----------|--------|-------|
| A. Security | 4/10 | 10/10 |
| B. Error Handling | 9/10 | 10/10 |
| C. Operator Docs | 8/10 | 10/10 |
| D. Shipping Hygiene | 6/10 | 10/10 |
| E. Identity (soft) | 10/10 | 10/10 |
| **Overall** | 37/50 | **50/50** |
