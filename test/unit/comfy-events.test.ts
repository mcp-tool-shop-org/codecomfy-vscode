/**
 * The ComfyUI event stream and the cancel ordering fix.
 *
 * Event interpretation is pure and is tested directly; the socket itself is
 * feature-detected at runtime, so `connect()` is only exercised for its
 * graceful-degradation path.
 */

import * as assert from 'assert';
import * as sinon from 'sinon';

import {
    interpretMessage,
    toWebSocketUrl,
    isEventStreamSupported,
    ComfyEventStream,
} from '../../src/engines/comfyEvents';
import { ComfyServerEngine } from '../../src/engines/comfyServerEngine';

const PROMPT = 'abc-123';

describe('comfyEvents — URL derivation', () => {
    it('derives ws:// from http://', () => {
        assert.strictEqual(
            toWebSocketUrl('http://127.0.0.1:8188', 'cid'),
            'ws://127.0.0.1:8188/ws?clientId=cid',
        );
    });

    it('derives wss:// from https://', () => {
        assert.strictEqual(
            toWebSocketUrl('https://comfy.example.com', 'cid'),
            'wss://comfy.example.com/ws?clientId=cid',
        );
    });

    it('tolerates a trailing slash', () => {
        assert.strictEqual(
            toWebSocketUrl('http://127.0.0.1:8188/', 'cid'),
            'ws://127.0.0.1:8188/ws?clientId=cid',
        );
    });

    it('url-encodes the client id', () => {
        assert.ok(toWebSocketUrl('http://h:1', 'a b/c').includes('a%20b%2Fc'));
    });
});

describe('comfyEvents — message interpretation', () => {
    it('reads sampler progress', () => {
        const r = interpretMessage(
            { type: 'progress', data: { prompt_id: PROMPT, value: 7, max: 20, node: '3' } },
            PROMPT,
        );
        assert.deepStrictEqual(r, {
            kind: 'progress',
            progress: { value: 7, max: 20, node: '3' },
        });
    });

    it('ignores progress for a different prompt', () => {
        const r = interpretMessage(
            { type: 'progress', data: { prompt_id: 'someone-else', value: 1, max: 20 } },
            PROMPT,
        );
        assert.strictEqual(r, null);
    });

    it('ignores a zero-max progress event rather than dividing by it', () => {
        const r = interpretMessage(
            { type: 'progress', data: { prompt_id: PROMPT, value: 0, max: 0 } },
            PROMPT,
        );
        assert.strictEqual(r, null);
    });

    it('treats execution_success as terminal', () => {
        const r = interpretMessage(
            { type: 'execution_success', data: { prompt_id: PROMPT } },
            PROMPT,
        );
        assert.deepStrictEqual(r, { kind: 'terminal', outcome: { reason: 'success' } });
    });

    it('treats the legacy executing{node:null} as terminal', () => {
        const r = interpretMessage(
            { type: 'executing', data: { prompt_id: PROMPT, node: null } },
            PROMPT,
        );
        assert.deepStrictEqual(r, { kind: 'terminal', outcome: { reason: 'success' } });
    });

    it('reports the executing node, which is NOT terminal', () => {
        const r = interpretMessage(
            { type: 'executing', data: { prompt_id: PROMPT, node: '3' } },
            PROMPT,
        );
        assert.deepStrictEqual(r, { kind: 'node', node: '3' });
    });

    it('surfaces an execution error with its node type and message', () => {
        const r = interpretMessage(
            {
                type: 'execution_error',
                data: {
                    prompt_id: PROMPT,
                    node_type: 'CheckpointLoaderSimple',
                    exception_message: 'model not found',
                },
            },
            PROMPT,
        );
        assert.strictEqual(r?.kind, 'terminal');
        assert.strictEqual(r.outcome.reason, 'error');
        assert.ok(r.outcome.detail?.includes('CheckpointLoaderSimple'));
        assert.ok(r.outcome.detail?.includes('model not found'));
    });

    it('treats interruption as terminal', () => {
        const r = interpretMessage(
            { type: 'execution_interrupted', data: { prompt_id: PROMPT } },
            PROMPT,
        );
        assert.deepStrictEqual(r, { kind: 'terminal', outcome: { reason: 'interrupted' } });
    });

    it('does NOT treat `executed` as terminal — it fires once per output node', () => {
        const r = interpretMessage(
            { type: 'executed', data: { prompt_id: PROMPT, node: '9', output: {} } },
            PROMPT,
        );
        assert.strictEqual(r, null);
    });

    it('ignores events it does not act on', () => {
        for (const type of ['status', 'execution_start', 'execution_cached', 'progress_state']) {
            assert.strictEqual(
                interpretMessage({ type, data: { prompt_id: PROMPT } }, PROMPT),
                null,
                `${type} should be observed but not acted on`,
            );
        }
    });

    it('treats display_node as a field, never as an event type', () => {
        // Regression guard: display_node appears INSIDE executing/executed.
        const r = interpretMessage(
            { type: 'executing', data: { prompt_id: PROMPT, node: '3', display_node: '3' } },
            PROMPT,
        );
        assert.deepStrictEqual(r, { kind: 'node', node: '3' });

        assert.strictEqual(
            interpretMessage({ type: 'display_node', data: { prompt_id: PROMPT } }, PROMPT),
            null,
        );
    });
});

describe('comfyEvents — graceful degradation', () => {
    const original = (globalThis as { WebSocket?: unknown }).WebSocket;

    afterEach(() => {
        if (original === undefined) {
            delete (globalThis as { WebSocket?: unknown }).WebSocket;
        } else {
            (globalThis as { WebSocket?: unknown }).WebSocket = original;
        }
    });

    it('reports unsupported when the runtime has no WebSocket', async () => {
        delete (globalThis as { WebSocket?: unknown }).WebSocket;
        assert.strictEqual(isEventStreamSupported(), false);

        const stream = new ComfyEventStream('http://127.0.0.1:8188', 'cid');
        assert.strictEqual(await stream.connect(), false, 'must degrade, not throw');
    });

    it('resolves `unavailable` when asked to wait with no socket', async () => {
        delete (globalThis as { WebSocket?: unknown }).WebSocket;
        const stream = new ComfyEventStream('http://127.0.0.1:8188', 'cid');
        await stream.connect();
        const outcome = await stream.waitForTerminal(PROMPT, 1000);
        assert.strictEqual(
            outcome.reason,
            'unavailable',
            '`unavailable` means "ask /history", never "the run failed"',
        );
    });

    it('close() is safe when nothing was ever opened', () => {
        const stream = new ComfyEventStream('http://127.0.0.1:8188', 'cid');
        assert.doesNotThrow(() => stream.close());
    });

    it('replays events that arrived before the prompt id was known', () => {
        // The socket is live from before submission, so a fast or fully-cached
        // job can emit its terminal event before waitForTerminal() is called.
        // Dropping it would cost a full timeout before polling noticed.
        const stream = new ComfyEventStream('http://127.0.0.1:8188', 'cid');
        const handle = (stream as unknown as {
            handleMessage(raw: unknown): void;
        }).handleMessage.bind(stream);

        handle(JSON.stringify({
            type: 'progress',
            data: { prompt_id: PROMPT, value: 5, max: 20 },
        }));
        handle(JSON.stringify({
            type: 'execution_success',
            data: { prompt_id: PROMPT },
        }));

        const seen: number[] = [];
        stream.onProgress((p) => seen.push(p.value));

        // No socket was opened, so this resolves from the replayed buffer.
        return stream.waitForTerminal(PROMPT, 1000).then((outcome) => {
            assert.strictEqual(outcome.reason, 'success', 'buffered terminal must be honoured');
            assert.deepStrictEqual(seen, [5], 'buffered progress must be replayed too');
        });
    });

    it('ignores non-string frames rather than treating them as malformed', () => {
        const stream = new ComfyEventStream('http://127.0.0.1:8188', 'cid');
        const handle = (stream as unknown as {
            handleMessage(raw: unknown): void;
        }).handleMessage.bind(stream);
        // Binary preview frames arrive as Blob/ArrayBuffer.
        assert.doesNotThrow(() => handle(new Uint8Array([0, 0, 0, 1])));
        assert.doesNotThrow(() => handle('not json{{'));
    });
});

describe('cancel ordering', () => {
    let fetchStub: sinon.SinonStub;

    beforeEach(() => {
        fetchStub = sinon.stub(globalThis, 'fetch');
        fetchStub.resolves({ ok: true, status: 200, json: async () => ({}) } as Response);
    });

    afterEach(() => {
        fetchStub.restore();
    });

    it('clears the queue BEFORE interrupting', async () => {
        const engine = new ComfyServerEngine('http://127.0.0.1:8188');
        // Pretend a prompt is in flight so the interrupt leg runs.
        (engine as unknown as { currentPromptId: string }).currentPromptId = PROMPT;

        await engine.cancel();

        const urls = fetchStub.getCalls().map((c) => String(c.args[0]));
        const queueAt = urls.findIndex((u) => u.endsWith('/queue'));
        const interruptAt = urls.findIndex((u) => u.endsWith('/interrupt'));

        assert.ok(queueAt >= 0, '/queue should be called');
        assert.ok(interruptAt >= 0, '/interrupt should be called');
        assert.ok(
            queueAt < interruptAt,
            'the queue must be cleared first — otherwise the server promotes the ' +
            'next pending job into the gap and a queue-clear can no longer reach it',
        );
    });

    it('sends {clear:true} to /queue', async () => {
        const engine = new ComfyServerEngine('http://127.0.0.1:8188');
        await engine.clearQueue();

        const call = fetchStub.getCalls().find((c) => String(c.args[0]).endsWith('/queue'));
        assert.ok(call);
        const init = call.args[1] as RequestInit;
        assert.strictEqual(init.method, 'POST');
        assert.deepStrictEqual(JSON.parse(String(init.body)), { clear: true });
    });

    it('still clears the queue when no prompt is in flight', async () => {
        const engine = new ComfyServerEngine('http://127.0.0.1:8188');
        await engine.cancel();
        const urls = fetchStub.getCalls().map((c) => String(c.args[0]));
        assert.ok(urls.some((u) => u.endsWith('/queue')));
        assert.ok(
            !urls.some((u) => u.endsWith('/interrupt')),
            'nothing running means nothing to interrupt',
        );
    });

    it('never throws when the server is unreachable', async () => {
        fetchStub.rejects(new Error('ECONNREFUSED'));
        const engine = new ComfyServerEngine('http://127.0.0.1:8188');
        (engine as unknown as { currentPromptId: string }).currentPromptId = PROMPT;
        await assert.doesNotReject(() => engine.cancel());
    });

    it('reports a failed queue-clear rather than claiming success', async () => {
        fetchStub.resolves({ ok: false, status: 500 } as Response);
        const engine = new ComfyServerEngine('http://127.0.0.1:8188');
        assert.strictEqual(await engine.clearQueue(), false);
    });

    it('binds the prompt to a client id so its events reach our socket', async () => {
        // The same value must appear in /ws?clientId= and in the /prompt body;
        // without it the server has nobody to notify and progress goes nowhere.
        fetchStub.resolves({
            ok: true,
            status: 200,
            json: async () => ({ prompt_id: PROMPT, number: 1, node_errors: {} }),
        } as Response);

        const engine = new ComfyServerEngine('http://127.0.0.1:8188');
        const submit = (engine as unknown as {
            submitPrompt(w: Record<string, unknown>, c?: string): Promise<unknown>;
        }).submitPrompt.bind(engine);

        await submit({ prompt: {} }, 'my-client-id');

        const call = fetchStub.getCalls().find((c) => String(c.args[0]).endsWith('/prompt'));
        assert.ok(call);
        const body = JSON.parse(String((call.args[1] as RequestInit).body));
        assert.strictEqual(body.client_id, 'my-client-id');
        assert.ok('prompt' in body, 'the workflow envelope must survive alongside it');
    });

    it('omits client_id when no socket is bound', async () => {
        fetchStub.resolves({
            ok: true,
            status: 200,
            json: async () => ({ prompt_id: PROMPT, number: 1, node_errors: {} }),
        } as Response);

        const engine = new ComfyServerEngine('http://127.0.0.1:8188');
        const submit = (engine as unknown as {
            submitPrompt(w: Record<string, unknown>, c?: string): Promise<unknown>;
        }).submitPrompt.bind(engine);

        await submit({ prompt: {} });

        const call = fetchStub.getCalls().find((c) => String(c.args[0]).endsWith('/prompt'));
        const body = JSON.parse(String((call!.args[1] as RequestInit).body));
        assert.ok(!('client_id' in body));
    });

    it('reads queue depth from /queue', async () => {
        fetchStub.resolves({
            ok: true,
            status: 200,
            json: async () => ({ queue_running: [1], queue_pending: [1, 2, 3] }),
        } as Response);
        const engine = new ComfyServerEngine('http://127.0.0.1:8188');
        assert.deepStrictEqual(await engine.getQueueDepth(), { running: 1, pending: 3 });
    });

    it('returns null queue depth when the server cannot be read', async () => {
        fetchStub.rejects(new Error('ECONNREFUSED'));
        const engine = new ComfyServerEngine('http://127.0.0.1:8188');
        assert.strictEqual(await engine.getQueueDepth(), null);
    });
});
