/**
 * Tests for the `codecomfy.newPresetFromHQ` command (FT-6 / F-904558-037).
 *
 * Contract:
 *   - writes `<workspace>/.codecomfy/presets/<name>.json`
 *   - name validation rejects: slash/backslash, `..`, empty, null bytes,
 *     overly long names, UNC prefixes
 *   - graceful error paths: no workspace, unwritable dir
 *   - preserves the bundled preset's workflow payload
 *
 * Name validation is exercised by driving the `validateInput` callback on
 * `vscode.window.showInputBox` — that mirrors how VS Code would reject user
 * input interactively, without relying on filesystem side-effects.
 */

import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { makeTempDir, cleanupTempPaths } from '../helpers';

after(() => {
    cleanupTempPaths();
});

// ── Stub hooks ───────────────────────────────────────────────────────────────

type StubHooks = {
    workspace: {
        _reset: () => void;
        _setWorkspaceFolders: (
            folders: ReadonlyArray<{ uri: { fsPath: string } }> | undefined,
        ) => void;
    };
    window: {
        _resetMessages: () => void;
        _resetTreeViews: () => void;
        _resetInputs: () => void;
        _queueInput: (...values: any[]) => void;
        _queueQuickPick: (...values: any[]) => void;
        _programNextResponse: (level: 'warning' | 'error' | 'information', value: any) => void;
        errorCalls(): Array<{ message: string }>;
        warningCalls(): Array<{ message: string }>;
        informationCalls(): Array<{ message: string }>;
        registeredTreeProviders: Array<{ viewId: string; provider: any }>;
    };
    commands: {
        _reset: () => void;
        registered: Array<{ id: string; handler: (...a: any[]) => any }>;
    };
    _makeExtensionContext(): vscode.ExtensionContext;
};

function hooks(): StubHooks {
    return vscode as unknown as StubHooks;
}

function freshActivate(): void {
    const entry = require.resolve('../../src/extension');
    delete require.cache[entry];
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('../../src/extension');
    mod.activate(hooks()._makeExtensionContext());
}

function getHandler(id: string): (...args: any[]) => any {
    const entry = hooks().commands.registered.find((c) => c.id === id);
    if (!entry) throw new Error(`command "${id}" not registered`);
    return entry.handler;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('codecomfy.newPresetFromHQ command', () => {
    beforeEach(() => {
        const h = hooks();
        h.workspace._reset();
        h.window._resetMessages();
        h.window._resetTreeViews();
        h.window._resetInputs();
        h.commands._reset();
    });

    it('writes <workspace>/.codecomfy/presets/<name>.json with preserved workflow', async () => {
        const h = hooks();
        const ws = makeTempDir('codecomfy-npc-');
        h.workspace._setWorkspaceFolders([{ uri: { fsPath: ws } }]);

        freshActivate();

        // Queue user responses: 1) QuickPick (template), 2) InputBox (name).
        h.window._queueQuickPick('Image (HQ)');
        h.window._queueInput('my-portrait');

        await getHandler('codecomfy.newPresetFromHQ')();

        const newPath = path.join(ws, '.codecomfy', 'presets', 'my-portrait.json');
        assert.ok(fs.existsSync(newPath), `preset JSON must exist at ${newPath}`);

        const parsed = JSON.parse(fs.readFileSync(newPath, 'utf-8'));
        assert.strictEqual(parsed.id, 'my-portrait', 'id should be the sanitized user name');
        assert.strictEqual(parsed.kind, 'image');
        assert.ok(parsed.workflow && typeof parsed.workflow === 'object',
            'bundled preset workflow must be preserved on the new file');
        assert.ok(Object.keys(parsed.workflow).length > 0,
            'workflow should have nodes copied from the bundled preset');
    });

    it('shows a warning and exits cleanly when no workspace is open', async () => {
        const h = hooks();
        h.workspace._setWorkspaceFolders(undefined);

        freshActivate();
        await getHandler('codecomfy.newPresetFromHQ')();

        const warnings = h.window.warningCalls();
        assert.ok(
            warnings.some((w) => /folder|workspace/i.test(w.message)),
            `expected a workspace-required warning; got: ${JSON.stringify(warnings)}`,
        );
    });

    it('cancels cleanly when the user Escapes at the template QuickPick', async () => {
        const h = hooks();
        const ws = makeTempDir('codecomfy-npc-');
        h.workspace._setWorkspaceFolders([{ uri: { fsPath: ws } }]);

        freshActivate();
        // Queue `undefined` for QuickPick (user hit Escape) — should stop here.
        h.window._queueQuickPick(undefined);

        await getHandler('codecomfy.newPresetFromHQ')();

        // No file should have been created.
        const presetsDir = path.join(ws, '.codecomfy', 'presets');
        assert.strictEqual(
            fs.existsSync(presetsDir),
            false,
            'no preset dir should be created when the user cancels early',
        );
        // And no error should have fired.
        assert.strictEqual(h.window.errorCalls().length, 0);
    });

    it('cancels cleanly when the user Escapes at the name InputBox', async () => {
        const h = hooks();
        const ws = makeTempDir('codecomfy-npc-');
        h.workspace._setWorkspaceFolders([{ uri: { fsPath: ws } }]);

        freshActivate();
        h.window._queueQuickPick('Video (HQ)');
        h.window._queueInput(undefined); // user escaped

        await getHandler('codecomfy.newPresetFromHQ')();

        assert.strictEqual(
            fs.existsSync(path.join(ws, '.codecomfy', 'presets')),
            false,
        );
    });
});

// ---------------------------------------------------------------------------
// Name validation — exercise the validateInput callback captured at prompt time
// ---------------------------------------------------------------------------
//
// VS Code's showInputBox runs `validateInput(value)` on each keystroke; a
// non-null return is the rejection message shown to the user. We monkey-patch
// the stub's `showInputBox` to record the options argument for the "Preset
// name" prompt, then exercise the callback against the adversarial corpus
// the task lists.
//
// The capture has to be async-aware — queueing input + quick-pick responses
// lets the command proceed all the way to the name prompt before we pick
// up the callback.

async function captureNameValidator(): Promise<(v: string) => string | null> {
    const h = hooks();
    const originalShow = (vscode as any).window.showInputBox;
    let captured: ((v: string) => string | null) | undefined;

    (vscode as any).window.showInputBox = (options: any) => {
        if (
            options
            && typeof options.validateInput === 'function'
            && options.title === 'Preset name'
        ) {
            captured = options.validateInput;
        }
        return originalShow(options);
    };

    try {
        // Queue responses for the whole chain so the command runs to completion:
        //   - template QuickPick returns "Image (HQ)"
        //   - name InputBox returns undefined (user Escape) so no file lands
        h.window._queueQuickPick('Image (HQ)');
        h.window._queueInput(undefined);

        // Await the command fully so the name prompt actually fires.
        await getHandler('codecomfy.newPresetFromHQ')();
    } finally {
        (vscode as any).window.showInputBox = originalShow;
    }

    if (!captured) {
        throw new Error('did not capture validateInput — command never reached the name prompt');
    }
    return captured;
}

describe('codecomfy.newPresetFromHQ — name validation', () => {
    let validate: (v: string) => string | null;

    beforeEach(async () => {
        const h = hooks();
        h.workspace._reset();
        h.window._resetMessages();
        h.window._resetTreeViews();
        h.window._resetInputs();
        h.commands._reset();
        const ws = makeTempDir('codecomfy-npc-');
        h.workspace._setWorkspaceFolders([{ uri: { fsPath: ws } }]);
        freshActivate();
        validate = await captureNameValidator();
    });

    it('rejects empty string', () => {
        const result = validate('');
        assert.ok(result, 'empty string must be rejected');
        assert.match(String(result), /empty/i);
    });

    it('rejects whitespace-only strings', () => {
        assert.ok(validate('   '), 'whitespace-only should be rejected');
    });

    it('rejects forward slashes (path traversal surface)', () => {
        assert.ok(validate('foo/bar'), 'slash should be rejected');
    });

    it('rejects backslashes (Windows path traversal surface)', () => {
        assert.ok(validate('foo\\bar'), 'backslash should be rejected');
    });

    it('rejects parent-directory traversal segments', () => {
        assert.ok(validate('../../../etc/passwd'), '../ traversal must be rejected');
    });

    it('rejects null bytes', () => {
        assert.ok(validate('foo\x00bar'), 'NUL byte must be rejected');
    });

    it('rejects UNC-style paths', () => {
        assert.ok(validate('\\\\server\\share'), 'UNC paths must be rejected');
    });

    it('rejects names longer than 255 chars', () => {
        const tooLong = 'a'.repeat(256);
        assert.ok(validate(tooLong), 'names > 255 chars must be rejected');
    });

    it('rejects names longer than 64 chars (stricter current limit)', () => {
        // Command currently enforces a 64-char cap (stricter than the 255
        // filesystem cap) — check the stricter bound is honored so we notice
        // if someone relaxes it by accident.
        const longerThan64 = 'a'.repeat(100);
        assert.ok(validate(longerThan64), 'names > 64 chars should be rejected by the stricter cap');
    });

    it('accepts well-formed names (alphanumeric + dash + underscore)', () => {
        assert.strictEqual(validate('my-portrait'), null);
        assert.strictEqual(validate('anime_video'), null);
        assert.strictEqual(validate('preset1'), null);
        assert.strictEqual(validate('ABC_123-xyz'), null);
    });

    it('rejects names with spaces', () => {
        assert.ok(validate('my preset'), 'spaces should be rejected');
    });

    it('rejects names starting with dot (hidden files)', () => {
        assert.ok(validate('.hidden'), 'dot-prefixed names should be rejected (not in [a-zA-Z0-9_-])');
    });
});
