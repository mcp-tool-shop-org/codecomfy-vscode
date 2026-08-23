/**
 * Metadata profile — read the workflow ComfyUI embeds in a PNG.
 *
 * ComfyUI writes provenance into PNG text chunks: `prompt` holds the
 * API-format graph that was actually submitted, and `workflow` holds the
 * editor-format graph for round-tripping into the canvas. Both are JSON in a
 * `tEXt` (uncompressed) or `zTXt` (zlib-compressed) chunk.
 *
 * This is the one profile that never contacts the server: it is a local file
 * read, so it works with ComfyUI closed, and it is the fastest way to recover
 * "what exactly produced this image" from an output someone sent you.
 *
 * Pure stdlib — no image library. The parser is deliberately defensive about
 * hostile input: a PNG is untrusted data, so chunk lengths are bounds-checked
 * against the buffer and decompressed output is capped to keep a zip bomb from
 * exhausting memory.
 */

import * as fs from 'fs';
import * as zlib from 'zlib';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Cap on a single decompressed text chunk. Graphs are large but not this large. */
const MAX_DECOMPRESSED_BYTES = 32 * 1024 * 1024;

/** Chunk keywords ComfyUI uses, in the order we prefer them. */
const WORKFLOW_KEYS = ['prompt', 'workflow'] as const;

export interface PngTextChunk {
    keyword: string;
    text: string;
    /** Which chunk type carried it. */
    type: 'tEXt' | 'zTXt' | 'iTXt';
}

/**
 * Extract every text chunk from a PNG.
 *
 * Returns an empty array for a non-PNG or a truncated file rather than
 * throwing — the caller reports "no workflow found", which is the same
 * user-facing outcome and avoids turning a malformed file into a stack trace.
 */
export function readPngTextChunks(filePath: string): PngTextChunk[] {
    let buf: Buffer;
    try {
        buf = fs.readFileSync(filePath);
    } catch {
        return [];
    }
    if (buf.length < PNG_SIGNATURE.length) return [];
    if (!buf.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) return [];

    const chunks: PngTextChunk[] = [];
    let offset = PNG_SIGNATURE.length;

    // Each chunk: length(4) | type(4) | data(length) | crc(4)
    while (offset + 8 <= buf.length) {
        const length = buf.readUInt32BE(offset);
        const type = buf.subarray(offset + 4, offset + 8).toString('latin1');
        const dataStart = offset + 8;
        const dataEnd = dataStart + length;

        // Bounds-check against the real buffer: a crafted length must not let
        // us read past the end.
        if (dataEnd + 4 > buf.length) break;

        if (type === 'tEXt' || type === 'zTXt' || type === 'iTXt') {
            const chunk = parseTextChunk(type, buf.subarray(dataStart, dataEnd));
            if (chunk) chunks.push(chunk);
        }

        if (type === 'IEND') break;
        offset = dataEnd + 4;
    }

    return chunks;
}

function parseTextChunk(
    type: 'tEXt' | 'zTXt' | 'iTXt',
    data: Buffer,
): PngTextChunk | null {
    const nulAt = data.indexOf(0);
    if (nulAt < 0) return null;
    const keyword = data.subarray(0, nulAt).toString('latin1');

    try {
        if (type === 'tEXt') {
            return { keyword, type, text: data.subarray(nulAt + 1).toString('utf8') };
        }

        if (type === 'zTXt') {
            // keyword \0 compressionMethod(1) compressedData
            const body = data.subarray(nulAt + 2);
            const out = zlib.inflateSync(body, { maxOutputLength: MAX_DECOMPRESSED_BYTES });
            return { keyword, type, text: out.toString('utf8') };
        }

        // iTXt: keyword \0 compressionFlag(1) compressionMethod(1)
        //       languageTag \0 translatedKeyword \0 text
        const compressionFlag = data[nulAt + 1];
        let cursor = nulAt + 3;
        const langEnd = data.indexOf(0, cursor);
        if (langEnd < 0) return null;
        cursor = langEnd + 1;
        const transEnd = data.indexOf(0, cursor);
        if (transEnd < 0) return null;
        const body = data.subarray(transEnd + 1);

        const text =
            compressionFlag === 1
                ? zlib
                    .inflateSync(body, { maxOutputLength: MAX_DECOMPRESSED_BYTES })
                    .toString('utf8')
                : body.toString('utf8');
        return { keyword, type, text };
    } catch {
        // A corrupt or bomb-capped chunk is skipped, not fatal.
        return null;
    }
}

export type ReadWorkflowResult =
    | { ok: true; value: unknown; chunkKeys: string[] }
    | { ok: false; error: string };

/**
 * Read the embedded ComfyUI workflow from a PNG.
 *
 * Prefers the `prompt` chunk (API format — the graph actually submitted, and
 * the one that can be re-POSTed verbatim) over `workflow` (editor format).
 */
export function readPngWorkflow(filePath: string): ReadWorkflowResult {
    const chunks = readPngTextChunks(filePath);
    if (chunks.length === 0) {
        return {
            ok: false,
            error:
                'No text metadata found in that PNG. It may not be a ComfyUI output, ' +
                'or the metadata was stripped by an editor or upload pipeline.',
        };
    }

    const found: string[] = [];
    let value: unknown;
    for (const key of WORKFLOW_KEYS) {
        const chunk = chunks.find((c) => c.keyword === key);
        if (!chunk) continue;
        found.push(key);
        if (value === undefined) {
            try {
                value = JSON.parse(chunk.text);
            } catch {
                // Keep looking — a malformed `prompt` should not hide a good
                // `workflow`.
                found.pop();
            }
        }
    }

    if (value === undefined) {
        const keywords = [...new Set(chunks.map((c) => c.keyword))];
        return {
            ok: false,
            error:
                'That PNG has metadata but no readable ComfyUI workflow. ' +
                `Chunks present: ${keywords.join(', ') || '(none named)'}.`,
        };
    }

    return { ok: true, value, chunkKeys: found };
}

/**
 * Pull the API-format graph out of embedded metadata, ready to re-submit.
 *
 * Only the `prompt` chunk is re-submittable: the `workflow` chunk is the
 * editor serialisation, which `/prompt` does not accept.
 */
export function extractApiGraph(filePath: string): Record<string, unknown> | null {
    const chunks = readPngTextChunks(filePath);
    const prompt = chunks.find((c) => c.keyword === 'prompt');
    if (!prompt) return null;
    try {
        const parsed = JSON.parse(prompt.text);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
        // An API-format graph is a map of node-id → { class_type, inputs }.
        const values = Object.values(parsed as Record<string, unknown>);
        const looksApi = values.some(
            (v) => !!v && typeof v === 'object' && 'class_type' in (v as object),
        );
        return looksApi ? (parsed as Record<string, unknown>) : null;
    } catch {
        return null;
    }
}
