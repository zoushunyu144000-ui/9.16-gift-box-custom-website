import type { IncomingMessage, ServerResponse } from 'node:http';

export interface RawBodyRequest extends IncomingMessage {
    rawBody?: Buffer;
    body?: unknown;
}

/**
 * Keeps the exact bytes of webhook requests (Lalamove signatures are checked against them) and parses
 * the JSON leniently. Mounted ahead of the global body parser on the webhook paths only; once the stream
 * has been read, that parser leaves the request alone.
 */
export function rawBodyMiddleware(limitBytes = 256 * 1024) {
    // Named so Vendure doesn't mistake it for body-parser's jsonParser.
    return function couriersWebhookBody(req: RawBodyRequest, res: ServerResponse, next: (error?: unknown) => void) {
        if (req.method !== 'POST') return next();
        const chunks: Buffer[] = [];
        let size = 0;
        let done = false;
        req.on('data', (chunk: Buffer) => {
            if (done) return;
            size += chunk.length;
            if (size > limitBytes) {
                done = true;
                res.statusCode = 413;
                res.setHeader('Content-Type', 'application/json');
                res.end('{"ok":false}');
                req.resume();
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => {
            if (done) return;
            done = true;
            req.rawBody = Buffer.concat(chunks);
            try {
                req.body = req.rawBody.length ? JSON.parse(req.rawBody.toString('utf8')) : {};
            } catch {
                req.body = {};
            }
            next();
        });
        req.on('error', error => {
            if (done) return;
            done = true;
            next(error);
        });
    };
}
