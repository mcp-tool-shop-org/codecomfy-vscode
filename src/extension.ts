import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';

/**
 * Common install locations for NextGallery on Windows
 */
const COMMON_PATHS = [
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'NextGallery', 'NextGallery.exe'),
    path.join(process.env.PROGRAMFILES || '', 'NextGallery', 'NextGallery.exe'),
    path.join(process.env['PROGRAMFILES(X86)'] || '', 'NextGallery', 'NextGallery.exe'),
];

export function activate(context: vscode.ExtensionContext) {
    const disposable = vscode.commands.registerCommand('codecomfy.openGallery', async () => {
        // Get workspace folder
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showWarningMessage('Open a folder or workspace first.');
            return;
        }

        // Use first workspace folder (deterministic for multi-root)
        const workspacePath = workspaceFolders[0].uri.fsPath;

        // Find NextGallery executable
        const exePath = findNextGalleryExecutable();
        if (!exePath) {
            const action = await vscode.window.showErrorMessage(
                'NextGallery.exe not found. Set the path in settings.',
                'Open Settings'
            );
            if (action === 'Open Settings') {
                vscode.commands.executeCommand('workbench.action.openSettings', 'codecomfy.nextGalleryPath');
            }
            return;
        }

        // Spawn detached process
        try {
            const child = spawn(exePath, ['--workspace', workspacePath], {
                detached: true,
                stdio: 'ignore',
                windowsHide: false,
            });
            child.unref();

            vscode.window.showInformationMessage('Opening CodeComfy Gallery...');
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            vscode.window.showErrorMessage(`Failed to launch NextGallery: ${message}`);
        }
    });

    context.subscriptions.push(disposable);
}

function findNextGalleryExecutable(): string | undefined {
    // Check user-configured path first
    const config = vscode.workspace.getConfiguration('codecomfy');
    const configuredPath = config.get<string>('nextGalleryPath');

    if (configuredPath && fs.existsSync(configuredPath)) {
        return configuredPath;
    }

    // Try common install locations
    for (const candidatePath of COMMON_PATHS) {
        if (candidatePath && fs.existsSync(candidatePath)) {
            return candidatePath;
        }
    }

    return undefined;
}

export function deactivate() {}
