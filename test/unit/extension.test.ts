/**
 * Tests for src/extension.ts — activation + notification surfaces.
 *
 * Coverage (FT-2 / F-904558-035):
 *   - activate() registers every command declared in package.json `contributes.commands`
 *   - activate() registers the Run History TreeView provider when a workspace
 *     is open, and skips it cleanly when there is none
 *   - activate() does not throw when the workspace has no `.codecomfy/presets/`
 *
 * The notification wiring (`showInformationMessage` on success, respecting
 * `codecomfy.notifyOnComplete`, `showErrorMessage` on failure) lives inside
 * `runGeneration()`, which is a private function and tested separately via
 * the job-router integration tests. This file focuses on the registration
 * contract — the public activate() surface.
 */

import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import * as path from 'path';
import { makeTempDir, cleanupTempPaths } from '../helpers';

// package.json contributes.commands — if this list changes, update here too.
const DECLARED_COMMANDS = [
    'codecomfy.openGallery',
    'codecomfy.generateImageHQ',
    'codecomfy.generateVideoHQ',
    'codecomfy.cancelGeneration',
    'codecomfy.openOutputChannel',
    // FT-020 / FT-023 / FT-024 wired in extension.ts via registerCommand;
    // these are not in contributes.commands today (their package.json entry
    // is ci-docs work) but must still be registered at runtime so the
    // TreeView re-run and preset authoring flows function.
    'codecomfy.customWorkflow',
    'codecomfy.rerunJob',
    'codecomfy.newPresetFromHQ',
];

/**
 * activate() reaches into module-level mutable state that lives across tests.
 * Each test resets the vscode stub to a clean slate and re-imports so we
 * observe registration cleanly.
 *
 * The `delete require.cache` dance is the least-invasive way to rerun
 * activate() in Mocha — the extension module holds its own `statusBarItem`
 * and `outputChannel` that we want freshly constructed per test.
 */
function freshActivate(context: vscode.ExtensionContext): void {
    const extensionPath = require.resolve('../../src/extension');
    delete require.cache[extensionPath];
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('../../src/extension');
    mod.activate(context);
}

function makeContext(): vscode.ExtensionContext {
    // The stub provides `_makeExtensionContext` — cast to the VS Code type
    // for ergonomic test assertions. The shape covers everything activate()
    // reads.
    return (vscode as unknown as {
        _makeExtensionContext(): vscode.ExtensionContext;
    })._makeExtensionContext();
}

// The vscode stub exposes test hooks (_reset / _resetMessages / _queueInput…)
// via module augmentation — we reach them through a cast.
type VsStubTestHooks = {
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
        registeredTreeProviders: Array<{ viewId: string; provider: any }>;
    };
    commands: {
        _reset: () => void;
        registered: Array<{ id: string; handler: (...a: any[]) => any }>;
    };
};

function stubHooks(): VsStubTestHooks {
    return vscode as unknown as VsStubTestHooks;
}

after(() => {
    cleanupTempPaths();
});

describe('extension.activate (FT-2)', () => {
    beforeEach(() => {
        const hooks = stubHooks();
        hooks.workspace._reset();
        hooks.window._resetMessages();
        hooks.window._resetTreeViews();
        hooks.window._resetInputs();
        hooks.commands._reset();
    });

    it('registers every declared command', () => {
        const hooks = stubHooks();
        hooks.workspace._setWorkspaceFolders([
            { uri: { fsPath: makeTempDir('codecomfy-ext-') } },
        ]);

        freshActivate(makeContext());

        const registeredIds = new Set(hooks.commands.registered.map((c) => c.id));
        for (const id of DECLARED_COMMANDS) {
            assert.ok(
                registeredIds.has(id),
                `activate() should register "${id}" — registered: ${Array.from(registeredIds).join(', ')}`,
            );
        }
    });

    it('each registered command has a callable handler', () => {
        const hooks = stubHooks();
        hooks.workspace._setWorkspaceFolders([
            { uri: { fsPath: makeTempDir('codecomfy-ext-') } },
        ]);

        freshActivate(makeContext());

        for (const { id, handler } of hooks.commands.registered) {
            assert.strictEqual(
                typeof handler,
                'function',
                `handler for "${id}" must be a function`,
            );
        }
    });

    it('registers the run-history TreeView when a workspace folder is open', () => {
        const hooks = stubHooks();
        hooks.workspace._setWorkspaceFolders([
            { uri: { fsPath: makeTempDir('codecomfy-ext-') } },
        ]);

        freshActivate(makeContext());

        const registered = hooks.window.registeredTreeProviders;
        const runHistory = registered.find((r) => r.viewId === 'codecomfy.runHistory');
        assert.ok(runHistory, 'codecomfy.runHistory TreeView should be registered');
        // Provider must satisfy the minimal TreeDataProvider shape.
        assert.strictEqual(typeof runHistory!.provider.getChildren, 'function');
        assert.strictEqual(typeof runHistory!.provider.getTreeItem, 'function');

        // Dispose any providers we attached so follow-up tests start clean.
        for (const r of registered) {
            r.provider?.dispose?.();
        }
    });

    it('does not register the TreeView when there is no open workspace', () => {
        const hooks = stubHooks();
        hooks.workspace._setWorkspaceFolders(undefined);

        freshActivate(makeContext());

        const runHistory = hooks.window.registeredTreeProviders.find(
            (r) => r.viewId === 'codecomfy.runHistory',
        );
        assert.strictEqual(
            runHistory,
            undefined,
            'without a workspace, the TreeView must be skipped (no folder to read index.json from)',
        );
    });

    it('does not throw when the workspace has no .codecomfy/presets/ directory', () => {
        const hooks = stubHooks();
        const ws = makeTempDir('codecomfy-ext-');
        hooks.workspace._setWorkspaceFolders([{ uri: { fsPath: ws } }]);

        // The activate() function tries to load user presets; missing dir
        // must not raise. This guards against a regression where the
        // registry's `fs.readdirSync` would crash on non-existent paths.
        assert.doesNotThrow(() => freshActivate(makeContext()));
    });

    it('activate() populates context.subscriptions so VS Code can unwind on deactivate', () => {
        const hooks = stubHooks();
        const ws = makeTempDir('codecomfy-ext-');
        hooks.workspace._setWorkspaceFolders([{ uri: { fsPath: ws } }]);

        const ctx = makeContext();
        freshActivate(ctx);

        assert.ok(
            ctx.subscriptions.length >= DECLARED_COMMANDS.length,
            `expected ≥${DECLARED_COMMANDS.length} subscriptions; got ${ctx.subscriptions.length}`,
        );
        // Every subscription must expose dispose().
        for (const sub of ctx.subscriptions) {
            assert.strictEqual(typeof (sub as any).dispose, 'function');
        }
    });
});

// ---------------------------------------------------------------------------
// Notification surfaces — verified through stub message spies
// ---------------------------------------------------------------------------
//
// Most notification wiring lives inside runGeneration() which only fires on
// a completed router run. To exercise those paths end-to-end we rely on the
// job-router integration tests (which will cover them via the fixture-backed
// playback, gated .skip until Mike records the hq-image fixture). The tests
// below assert the externally-observable guard rails.

describe('extension — notification surfaces', () => {
    beforeEach(() => {
        const hooks = stubHooks();
        hooks.workspace._reset();
        hooks.window._resetMessages();
        hooks.window._resetTreeViews();
        hooks.window._resetInputs();
        hooks.commands._reset();
    });

    it('generateImageHQ shows a warning when no workspace is open', async () => {
        const hooks = stubHooks();
        hooks.workspace._setWorkspaceFolders(undefined);

        freshActivate(makeContext());
        const handler = hooks.commands.registered.find(
            (c) => c.id === 'codecomfy.generateImageHQ',
        )?.handler;
        assert.ok(handler, 'generateImageHQ should be registered');

        await handler!();

        const warningCalls = (vscode.window as any).warningCalls() as Array<{
            message: string;
        }>;
        assert.ok(
            warningCalls.some((c) => /folder|workspace/i.test(c.message)),
            `expected a workspace-required warning; got: ${JSON.stringify(warningCalls)}`,
        );
    });

    it('cancelGeneration with no active run shows an information message', async () => {
        const hooks = stubHooks();
        hooks.workspace._setWorkspaceFolders(undefined);

        freshActivate(makeContext());
        const handler = hooks.commands.registered.find(
            (c) => c.id === 'codecomfy.cancelGeneration',
        )?.handler;
        assert.ok(handler, 'cancelGeneration should be registered');

        await handler!();

        const infoCalls = (vscode.window as any).informationCalls() as Array<{
            message: string;
        }>;
        assert.ok(
            infoCalls.some((c) => /no generation in progress/i.test(c.message)),
            `expected "no generation in progress" info; got: ${JSON.stringify(infoCalls)}`,
        );
    });

    it('rerunJob with no runId shows a descriptive error', async () => {
        const hooks = stubHooks();
        hooks.workspace._setWorkspaceFolders([
            { uri: { fsPath: makeTempDir('codecomfy-ext-') } },
        ]);

        freshActivate(makeContext());
        const handler = hooks.commands.registered.find(
            (c) => c.id === 'codecomfy.rerunJob',
        )?.handler;
        assert.ok(handler, 'rerunJob should be registered');

        await handler!(); // no runId

        const errors = (vscode.window as any).errorCalls() as Array<{ message: string }>;
        assert.ok(
            errors.some((e) => /run id/i.test(e.message)),
            `expected an error mentioning "run id"; got: ${JSON.stringify(errors)}`,
        );
    });
});
