# codecomfy-vscode: how it works

Mapped at 2026-10-01 from commit cf6d5a3 by Atlas 1.24.0.

## What this is

9 parts, mostly TypeScript (50 files), JavaScript (5), CSS (2) and Astro (1). Work enters through 4 doors; CI and Build and Release each reach 5 parts, and CI is followed because a pull request goes through it. It publishes to the VS Code Marketplace. It deploys a site to GitHub Pages. People install the codecomfy-vscode extension.

## What changed since 2026-09-30 (93df7e1)

- CI's pull request trigger no longer names `.github/workflows/**`, `atlas/**`, `eslint.config.mjs`, `package-lock.json`, `package.json`, `site/astro.config.mjs`, `site/package-lock.json`, `site/package.json`, `src/**`, `test/**` and `tsconfig*.json`.
- 2 files changed content, across 2 parts.

## What comes in

1. **CI.** On a pull request to main; on a push to main touching 11 paths; or by hand. Runs test/register-vscode-stub.js and test/unit/; builds src/ and test/; checks eslint.config.mjs, scripts/ and site/.
2. **Build and Release.** When a tag matching `v*` is pushed; or by hand. Runs test/register-vscode-stub.js and test/unit/; builds src/ and test/; checks eslint.config.mjs, scripts/ and site/.
3. **Deploy site to GitHub Pages.** On a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
4. **codecomfy-vscode** (the extension people install from the VS Code Marketplace). Loads src/extension.ts.

## What happens through CI

1. The workflow runs test/register-vscode-stub.js and test/unit/ in test; it builds src/ in src and test/ in test; it checks eslint.config.mjs in the repository root, scripts/ in scripts and site/ in the site.

## Who reads the results

CI writes nothing this map can see.

## The other doors

**Build and Release** runs test/register-vscode-stub.js and test/unit/, builds src/ and test/, checks eslint.config.mjs, scripts/ and site/, creates a GitHub release and uploads SHA256SUMS.txt and files named at run time to the release on a tag push, and publishes to the VS Code Marketplace when run by hand.

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, and deploys the site.

**codecomfy-vscode** (the extension people install from the VS Code Marketplace) loads src/extension.ts.

## What breaks what

- **src** is imported only from tests, by 1 part (test), and sits on the path of 3 doors.
- **the site** is imported by no other part and sits on the path of 3 doors.
- **the repository root** is imported by no other part and sits on the path of 2 doors.
- **scripts** is imported by no other part and sits on the path of 2 doors.
- **test** is imported by no other part and sits on the path of 2 doors.
- **src/kb/nodes.json** is written by scripts and read by scripts and src; a hand edit reaches every reader.
- **src/kb/presets.json** is written by scripts and read by scripts and src; a hand edit reaches every reader.

## What tends to change together

- **src/engines/comfyServerEngine.ts** and **src/extension.ts** changed together in 6 of 8 commits, inside the src part.
- **src/engines/comfyServerEngine.ts** and **src/types/index.ts** changed together in 5 of 8 commits, inside the src part.
- **src/extension.ts** and **src/types/index.ts** changed together in 4 of 7 commits, inside the src part.

Confidence is low: fewer than 25 source files reach 10 revisions in the window.

Window: 180 days; a pair counts from 3 shared commits, since 0 source files reach 10 revisions; the floor rises to 10 when 25 do.

## What no test touches

- **scripts** is imported by no test.

## Written but never read

Every written place has a reader.

## Helpers that look duplicated

No two parts export a helper that looks alike.

## Generated, never hand-edited

- **src/kb/nodes.json** is written by scripts/sync-kb.mjs.
- **src/kb/presets.json** is written by scripts/sync-kb.mjs.

## Hand-authored

People write .github/, assets/, docs/, the repository root, schemas/ and site/; 2 writes with paths built at run time may land here.

## Where to start

.github/workflows/ci.yml → src/extension.ts → src/logging/logger.ts → src/presets/registry.ts

Read those in order to follow one pull request end to end.

## What this map cannot see

- 1 import could not be resolved: `test/helpers.ts` imports a path built at run time.
- 2 writes and 6 reads use paths built at run time and are not named here.
- 16 writes and 39 reads go to a path their caller passes, not to this repository.
- 4 commands are built at run time and not followed.
- Statistics confidence is low: fewer than 25 source files reach 10 revisions in the window.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
