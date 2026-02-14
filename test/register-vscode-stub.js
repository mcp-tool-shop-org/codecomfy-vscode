/**
 * Mocha require hook: registers the vscode stub as a Node module
 * so that `require('vscode')` resolves at runtime.
 *
 * This runs before any test file is loaded.
 */

'use strict';

const Module = require('module');
const path = require('path');

const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function (request, parent, isMain, options) {
    if (request === 'vscode') {
        // Redirect to our compiled stub
        return path.join(__dirname, '..', 'dist-test', 'test', 'stubs', 'vscode.js');
    }
    return originalResolveFilename.call(this, request, parent, isMain, options);
};
