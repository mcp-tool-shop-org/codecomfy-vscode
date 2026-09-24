# codecomfy-vscode: how it works

Mapped at 2026-09-24 from commit e196fbe.

## What this is

9 parts, mostly TypeScript (50 files). Work enters through 4 doors; CI and Build and Release each reach 5 parts, and CI is followed because a pull request goes through it. It publishes to the VS Code Marketplace. People install the codecomfy-vscode extension.

## What changed since the last map

This is the first map.

## What comes in

1. **CI.** On a pull request touching 11 paths; on a push to main touching 11 paths; or by hand. Runs test/register-vscode-stub.js; checks eslint.config.mjs, scripts/, site/ and 2 more.
2. **Build and Release.** When a tag matching `v*` is pushed; or by hand. Runs test/register-vscode-stub.js; checks eslint.config.mjs, scripts/, site/ and 2 more.
3. **Deploy site to GitHub Pages.** On a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
4. **codecomfy-vscode** (the extension people install from the VS Code Marketplace). Loads src/extension.ts.

## What happens through CI

1. The workflow runs test/register-vscode-stub.js in test; it checks eslint.config.mjs in the repository root, scripts/ in scripts, site/ in the site, src/ in src and test/ in test.

## Who reads the results

CI writes nothing in the files this map could read; 1 file could not be.

## The other doors

**Build and Release** runs test/register-vscode-stub.js, checks eslint.config.mjs, scripts/, site/ and 2 more, creates a GitHub release on a tag push, and publishes to the VS Code Marketplace when run by hand.

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, and deploys the site.

**codecomfy-vscode** (the extension people install from the VS Code Marketplace) loads src/extension.ts.

## What breaks what

- **src** is imported only from tests, by 1 part (test), and sits on the path of 3 doors.
- **the site** is imported by no other part and sits on the path of 3 doors.
- **the repository root** is imported by no other part and sits on the path of 2 doors.
- **scripts** is imported by no other part and sits on the path of 2 doors.
- **test** is imported by no other part and sits on the path of 2 doors.

## What tends to change together

- **src/engines/comfyServerEngine.ts** and **src/extension.ts** changed together in 6 of 8 commits, inside the src part.
- **src/engines/comfyServerEngine.ts** and **src/types/index.ts** changed together in 5 of 8 commits, inside the src part.
- **src/extension.ts** and **src/types/index.ts** changed together in 4 of 7 commits, inside the src part.

Confidence is low: fewer than 20 source files reach 10 revisions in the window.

Window: 180 days; a pair counts from 3 shared commits, since 0 source files reach 10 revisions; the floor rises to 10 when 25 do.

## What no test touches

- **scripts** is imported by no test.

## Written but never read

No place is written by the files this map could read, so none goes unread; 1 file could not be.

## Helpers that look duplicated

No two parts export a helper that looks alike in the files this map could read; 1 file could not be.

## Generated, never hand-edited

Nothing in the files this map could read writes to a tracked place; 1 file could not be.

## Hand-authored

People write .github/, assets/, docs/, the repository root, schemas/ and site/; 4 writes with paths built at run time may land here.

## Where to start

CI runs no code this map can follow; it only checks code, so there is no path of files to read in order.

## What this map cannot see

- 1 import site could not be resolved.
- 1 file uses syntax the parser cannot read (test/unit/ffmpeg-utils.test.ts), so what it imports is not known.
- 4 writes and 8 reads use paths built at run time and are not named here.
- 16 writes and 39 reads go to the directory the command is run in, the home directory or a path its caller passes, not to this repository.
- 3 commands are built at run time and not followed.
- Statistics confidence is low: fewer than 20 source files reach 10 revisions in the window.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
