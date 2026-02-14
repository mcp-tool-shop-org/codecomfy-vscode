/**
 * Tests for ComfyUI response shape guards.
 */

import * as assert from 'node:assert/strict';
import {
    validatePromptResponse,
    validateHistoryEntry,
    validateHistoryResponse,
    ComfyResponseError,
} from '../../src/engines/comfyValidation';

// ── validatePromptResponse ────────────────────────────────────────────────────

describe('validatePromptResponse', () => {
    it('accepts a valid prompt response', () => {
        const body = { prompt_id: 'abc-123', number: 1, node_errors: {} };
        const result = validatePromptResponse(body);
        assert.strictEqual(result.prompt_id, 'abc-123');
        assert.strictEqual(result.number, 1);
        assert.deepStrictEqual(result.node_errors, {});
    });

    it('accepts when node_errors is missing (some ComfyUI versions)', () => {
        const body = { prompt_id: 'abc', number: 2 };
        const result = validatePromptResponse(body);
        assert.strictEqual(result.prompt_id, 'abc');
        assert.deepStrictEqual(result.node_errors, {});
    });

    it('throws ComfyResponseError for null body', () => {
        assert.throws(
            () => validatePromptResponse(null),
            (err: unknown) => err instanceof ComfyResponseError && err.responseKind === 'prompt_response',
        );
    });

    it('throws for non-object body', () => {
        assert.throws(
            () => validatePromptResponse('not an object'),
            ComfyResponseError,
        );
    });

    it('throws for array body', () => {
        assert.throws(
            () => validatePromptResponse([1, 2, 3]),
            ComfyResponseError,
        );
    });

    it('throws when prompt_id is missing', () => {
        assert.throws(
            () => validatePromptResponse({ number: 1 }),
            (err: unknown) =>
                err instanceof ComfyResponseError && err.message.includes('prompt_id'),
        );
    });

    it('throws when prompt_id is empty string', () => {
        assert.throws(
            () => validatePromptResponse({ prompt_id: '', number: 1 }),
            ComfyResponseError,
        );
    });

    it('throws when prompt_id is not a string', () => {
        assert.throws(
            () => validatePromptResponse({ prompt_id: 123, number: 1 }),
            ComfyResponseError,
        );
    });

    it('throws when number is missing', () => {
        assert.throws(
            () => validatePromptResponse({ prompt_id: 'abc' }),
            (err: unknown) =>
                err instanceof ComfyResponseError && err.message.includes('number'),
        );
    });

    it('throws when number is not a number', () => {
        assert.throws(
            () => validatePromptResponse({ prompt_id: 'abc', number: 'two' }),
            ComfyResponseError,
        );
    });

    it('throws with node errors and includes summary', () => {
        const body = {
            prompt_id: 'abc',
            number: 1,
            node_errors: { '5': { message: 'bad checkpoint' } },
        };
        assert.throws(
            () => validatePromptResponse(body),
            (err: unknown) =>
                err instanceof ComfyResponseError &&
                err.message.includes('node 5') &&
                err.message.includes('bad checkpoint'),
        );
    });

    it('includes rawBody in error (truncated)', () => {
        assert.throws(
            () => validatePromptResponse(null),
            (err: unknown) => err instanceof ComfyResponseError && typeof err.rawBody === 'string',
        );
    });
});

// ── validateHistoryEntry ──────────────────────────────────────────────────────

describe('validateHistoryEntry', () => {
    const validEntry = {
        outputs: {
            '9': {
                images: [
                    { filename: 'img_00001.png', subfolder: '', type: 'output' },
                ],
            },
        },
        status: { status_str: 'success', completed: true },
    };

    it('accepts a valid history entry', () => {
        const result = validateHistoryEntry(validEntry);
        assert.strictEqual(result.status.completed, true);
        assert.strictEqual(result.status.status_str, 'success');
        assert.ok(result.outputs['9']);
        assert.strictEqual(result.outputs['9'].images!.length, 1);
        assert.strictEqual(result.outputs['9'].images![0].filename, 'img_00001.png');
    });

    it('handles node output without images gracefully', () => {
        const entry = {
            outputs: { '10': {} },
            status: { status_str: 'success', completed: true },
        };
        const result = validateHistoryEntry(entry);
        assert.strictEqual(result.outputs['10'].images, undefined);
    });

    it('skips images with missing filename', () => {
        const entry = {
            outputs: {
                '9': {
                    images: [
                        { filename: 'good.png', subfolder: '', type: 'output' },
                        { subfolder: '', type: 'output' }, // missing filename
                    ],
                },
            },
            status: { status_str: 'success', completed: true },
        };
        const result = validateHistoryEntry(entry);
        assert.strictEqual(result.outputs['9'].images!.length, 1);
    });

    it('defaults subfolder and type when missing', () => {
        const entry = {
            outputs: {
                '9': {
                    images: [{ filename: 'test.png' }], // missing subfolder + type
                },
            },
            status: { status_str: 'success', completed: true },
        };
        const result = validateHistoryEntry(entry);
        assert.strictEqual(result.outputs['9'].images![0].subfolder, '');
        assert.strictEqual(result.outputs['9'].images![0].type, 'output');
    });

    it('defaults status_str to "unknown" if missing', () => {
        const entry = {
            outputs: {},
            status: { completed: true },
        };
        const result = validateHistoryEntry(entry);
        assert.strictEqual(result.status.status_str, 'unknown');
    });

    it('throws for null', () => {
        assert.throws(
            () => validateHistoryEntry(null),
            ComfyResponseError,
        );
    });

    it('throws when status is missing', () => {
        assert.throws(
            () => validateHistoryEntry({ outputs: {} }),
            (err: unknown) =>
                err instanceof ComfyResponseError && err.message.includes('status'),
        );
    });

    it('throws when status.completed is not boolean', () => {
        assert.throws(
            () => validateHistoryEntry({ outputs: {}, status: { status_str: 'ok', completed: 'yes' } }),
            ComfyResponseError,
        );
    });

    it('throws when outputs is missing', () => {
        assert.throws(
            () => validateHistoryEntry({ status: { status_str: 'ok', completed: true } }),
            (err: unknown) =>
                err instanceof ComfyResponseError && err.message.includes('outputs'),
        );
    });
});

// ── validateHistoryResponse ───────────────────────────────────────────────────

describe('validateHistoryResponse', () => {
    it('returns entry for matching promptId', () => {
        const body = {
            'my-prompt': {
                outputs: { '1': { images: [] } },
                status: { status_str: 'success', completed: true },
            },
        };
        const result = validateHistoryResponse(body, 'my-prompt');
        assert.ok(result);
        assert.strictEqual(result.status.completed, true);
    });

    it('returns null when promptId is not present (still running)', () => {
        const body = {};
        const result = validateHistoryResponse(body, 'missing-id');
        assert.strictEqual(result, null);
    });

    it('throws for non-object body', () => {
        assert.throws(
            () => validateHistoryResponse('bad', 'id'),
            ComfyResponseError,
        );
    });

    it('throws for null body', () => {
        assert.throws(
            () => validateHistoryResponse(null, 'id'),
            ComfyResponseError,
        );
    });
});
