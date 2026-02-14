# Contributing to CodeComfy VS Code

Thank you for your interest in contributing!

## Development Setup

```bash
# 1. Clone
git clone https://github.com/mcp-tool-shop-org/codecomfy-vscode.git
cd codecomfy-vscode

# 2. Install dependencies (use ci for reproducible installs)
npm ci

# 3. Open in VS Code
code .
```

### Run the extension locally

- Press **F5** in VS Code to launch the Extension Development Host.
- The extension compiles on launch via `vscode:prepublish`.
- Use `npm run watch` in a terminal for live recompilation.

### Run tests

```bash
npm test          # compile:test + mocha (headless, no Electron needed)
```

Tests use a lightweight VS Code stub (`test/stubs/vscode.ts`) instead
of the real `vscode` module, so they run in any Node.js environment.

### Run lint

```bash
npm run lint      # eslint (flat config — eslint.config.mjs)
```

Both `npm test` and `npm run lint` must pass before merging.

## Project Structure

```
src/
├── engines/            # ComfyUI client + FFmpeg video assembler
│   ├── comfyServerEngine.ts
│   ├── comfyValidation.ts
│   └── ffmpeg.ts
├── logging/            # Structured logger
│   └── logger.ts
├── polling/            # Backoff timer
│   └── backoff.ts
├── presets/            # Bundled workflow presets (JSON)
│   ├── registry.ts
│   ├── hq-image.json
│   └── hq-video.json
├── pruning/            # Run history cleanup
│   └── pruner.ts
├── router/             # Job lifecycle + index management
│   └── jobRouter.ts
├── types/              # Shared type definitions
│   └── index.ts
├── validation/         # Input + path + video limit guards
│   ├── inputs.ts
│   ├── paths.ts
│   └── video.ts
├── config.ts           # VS Code settings reader
└── extension.ts        # Entry point + command registrations

test/
├── stubs/vscode.ts     # Minimal VS Code mock
├── register-vscode-stub.js  # Runtime Module._resolveFilename hook
└── unit/               # All unit tests (*.test.ts)
```

## Pull Request Process

1. Fork the repository.
2. Create a feature branch (`git checkout -b feat/amazing-feature`).
3. Write code + tests. Aim for at least 1 test per exported function.
4. Run `npm run lint && npm test` — both must pass.
5. Commit with [Conventional Commits](https://www.conventionalcommits.org/):
   `feat:`, `fix:`, `docs:`, `test:`, `chore:`, `security:`, `reliability:`.
6. Push to your fork and open a Pull Request.
7. CI will run lint + test + compile + version-check automatically.

## Release Checklist (maintainers)

1. **Bump version** in `package.json` (follow semver).
2. **Update CHANGELOG.md** — move "Unreleased" items under the new version heading.
3. **Commit**: `chore: bump version to X.Y.Z`
4. **Tag**: `git tag vX.Y.Z && git push origin vX.Y.Z`
5. **CI packages + publishes**: the `publish.yml` workflow runs `vsce package` on tag push,
   creates a GitHub Release, and publishes to the VS Code Marketplace (if `VSCE_PAT` is set).
6. **Verify**: confirm the GitHub Release has the `.vsix` + `SHA256SUMS.txt`.
7. **Verify checksums**: compare the `.vsix` SHA256 between CI output and the release download.

## Reporting Issues

- Use [GitHub Issues](https://github.com/mcp-tool-shop-org/codecomfy-vscode/issues)
  for bug reports and feature requests.
- Include reproduction steps, VS Code version, OS, and ComfyUI version for bugs.
- Check existing issues before creating new ones.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
