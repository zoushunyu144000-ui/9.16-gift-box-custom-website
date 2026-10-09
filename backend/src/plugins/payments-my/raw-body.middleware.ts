import { NextFunction, Request, Response } from 'express';

export interface RawBodyRequest extends Request {
    rawBody?: Buffer;
}

// Callbacks are small (a CHIP purchase is a few kB); anything bigger isn't from a gateway.
const DEFAULT_LIMIT_BYTES = 256 * 1024;

/**
 * Keeps a callback's exact bytes for its signature check (re-serialised JSON or form data would not match).
 * Registered before Vendure's body parsers (beforeListen); they then find the body already read and skip it.
 */
export function rawBodyMiddleware(limitBytes = DEFAULT_LIMIT_BYTES) {
    return function paymentCallbackRawBody(req: RawBodyRequest, res: Response, next: NextFunction) {
        if (req.method !== 'POST' || req.readableEnded) {
            next();
            return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        let done = false;
        req.on('data', (chunk: Buffer) => {
            if (done) return;
            size += chunk.length;
            if (size > limitBytes) {
                done = true;
                chunks.length = 0;
                res.status(413).set('Connection', 'close').send('Payload too large');
                res.once('finish', () => req.destroy());
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => {
            if (done) return;
            done = true;
            req.rawBody = Buffer.concat(chunks);
            req.body = req.rawBody;
            next();
        });
        req.on('error', error => {
            if (done) return;
            done = true;
            next(error);
        });
    };
}
