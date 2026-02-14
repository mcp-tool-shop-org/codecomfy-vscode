/**
 * Minimal vscode module stub for headless unit tests.
 *
 * Only surfaces the shapes that our source code actually imports.
 * Tests that exercise real VS Code APIs belong in integration tests
 * (run via @vscode/test-electron), not here.
 */

export namespace workspace {
    const _config: Record<string, any> = {};

    export function getConfiguration(_section?: string) {
        return {
            get<T>(key: string): T | undefined {
                return _config[key] as T | undefined;
            },
        };
    }

    /** Test helper: seed fake config values before calling getConfig(). */
    export function _setFakeConfig(values: Record<string, any>): void {
        for (const key of Object.keys(_config)) {
            delete _config[key];
        }
        Object.assign(_config, values);
    }

    export const workspaceFolders: any[] | undefined = undefined;
}

export namespace window {
    export function showWarningMessage(_msg: string, ..._items: any[]): any {
        return Promise.resolve(undefined);
    }
    export function showErrorMessage(_msg: string, ..._items: any[]): any {
        return Promise.resolve(undefined);
    }
    export function showInformationMessage(_msg: string, ..._items: any[]): any {
        return Promise.resolve(undefined);
    }
    export function showInputBox(_options?: any): any {
        return Promise.resolve(undefined);
    }
    export function showQuickPick(_items: any[], _options?: any): any {
        return Promise.resolve(undefined);
    }
    export function createOutputChannel(_name: string): any {
        return {
            appendLine: () => {},
            show: () => {},
            dispose: () => {},
        };
    }
    export function createStatusBarItem(..._args: any[]): any {
        return { text: '', show: () => {}, dispose: () => {} };
    }
}

export namespace commands {
    export function registerCommand(_id: string, _handler: (...args: any[]) => any): any {
        return { dispose: () => {} };
    }
    export function executeCommand(_id: string, ..._args: any[]): any {
        return Promise.resolve(undefined);
    }
}

export enum StatusBarAlignment {
    Left = 1,
    Right = 2,
}

export class Uri {
    static file(p: string): Uri { return new Uri(p); }
    readonly fsPath: string;
    private constructor(p: string) { this.fsPath = p; }
}
