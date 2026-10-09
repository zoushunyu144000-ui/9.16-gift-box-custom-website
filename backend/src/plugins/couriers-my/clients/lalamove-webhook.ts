import { safeEqual, sha256Hex } from '../crypto';
import { lalamoveSignature } from './lalamove';

/**
 * A Lalamove webhook (spec "v3 Webhook v1.5"): `{ apiKey, timestamp, signature, eventId, eventType,
 * eventVersion, data }`. The signature covers the timestamp (seconds), the webhook URL's path and `data`:
 * HMAC-SHA256(secret, `${timestamp}\r\nPOST\r\n${path}\r\n\r\n${JSON of data}`).
 */
export interface LalamoveWebhookEvent {
    /** As sent; not signed, so only for logs. */
    eventId: string;
    /**
     * Dedupe key over the signed timestamp and data. Not the eventId: that isn't signed, so a replayed
     * body with a new eventId would otherwise be processed again.
     */
    eventKey: string;
    eventType: string;
    /** The order the event is about (for ORDER_REPLACED, the new order). */
    orderId?: string;
    /** ORDER_REPLACED: the order Lalamove cancelled and cloned. */
    prevOrderId?: string;
    /** ORDER_STATUS_CHANGED: the status the event announces (re-checked against the API before use). */
    status?: string;
    occurredAt?: Date;
}

export type LalamoveWebhookResult =
    | { kind: 'ping' }
    | { kind: 'rejected'; reason: string }
    /** Correctly signed but outside the accepted time window: acknowledged, not processed. */
    | { kind: 'expired'; reason: string }
    | { kind: 'event'; event: LalamoveWebhookEvent };

export interface LalamoveWebhookKeys {
    apiKey: string;
    apiSecret: string;
    /** URL paths the webhook may be signed for, e.g. "/delivery/lalamove/webhook" (plus any proxy prefix). */
    paths: string[];
    /** Clock for the age check, ms. */
    now?: number;
}

/** Lalamove retries a delivery for up to 24 hours; a signed body much older than that is a replay. */
export const LALAMOVE_WEBHOOK_MAX_AGE_MS = 48 * 3600_000;
/** How far a timestamp may be ahead of our clock. */
export const LALAMOVE_WEBHOOK_MAX_SKEW_MS = 3600_000;

/**
 * Verifies a webhook from its raw body. Only the signed parts are trusted: the event is read from the
 * exact `data` text that passed the check, so a body with a second, unsigned `data` can't slip through.
 * A body without an event (Lalamove's URL check sends none) is a ping and gets a 200 without processing.
 * A signed body outside the time window is 'expired': also a 200 without processing, so a late retry or
 * a skewed clock never counts towards Lalamove disabling the URL (reconcile picks the change up).
 */
export function verifyLalamoveWebhook(rawBody: string, keys: LalamoveWebhookKeys): LalamoveWebhookResult {
    const text = rawBody.trim();
    if (!text) return { kind: 'ping' };
    let parsed: Record<string, unknown>;
    try {
        parsed = JSON.parse(text);
    } catch {
        return { kind: 'ping' };
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { kind: 'ping' };
    if (parsed.eventType === undefined && parsed.signature === undefined) return { kind: 'ping' };
    // Without credentials anyone could sign with the empty secret.
    if (!keys.apiKey || !keys.apiSecret) return { kind: 'rejected', reason: 'Lalamove is not configured' };

    const properties = topLevelProperties(text);
    if (!properties) return { kind: 'rejected', reason: 'malformed or duplicate fields' };
    if (typeof parsed.apiKey !== 'string' || !safeEqual(parsed.apiKey, keys.apiKey)) {
        return { kind: 'rejected', reason: 'apiKey does not match' };
    }
    const signature = typeof parsed.signature === 'string' ? parsed.signature.toLowerCase() : '';
    const rawData = properties.get('data');
    const rawTimestamp = properties.get('timestamp');
    if (!signature || rawData === undefined || rawTimestamp === undefined) {
        return { kind: 'rejected', reason: 'missing signature, timestamp or data' };
    }
    const timestamp = rawTimestamp.startsWith('"') ? String(JSON.parse(rawTimestamp)) : rawTimestamp;
    // Lalamove signs JSON.stringify(data). The bytes it sent are tried first, then the compact
    // re-serialisation its sample code uses, so whitespace or escaping differences can't cause false rejects.
    const compactData = JSON.stringify(JSON.parse(rawData));
    const dataTexts = unique([rawData, compactData]);
    const verified = unique(keys.paths).some(path =>
        dataTexts.some(data => safeEqual(lalamoveSignature(keys.apiSecret, timestamp, 'POST', path, data), signature)),
    );
    if (!verified) return { kind: 'rejected', reason: 'signature does not match' };

    const seconds = Number(timestamp);
    if (!Number.isFinite(seconds) || seconds <= 0) return { kind: 'rejected', reason: 'timestamp is not a number' };
    const sentAt = seconds < 1e12 ? seconds * 1000 : seconds;
    const now = keys.now ?? Date.now();
    if (sentAt < now - LALAMOVE_WEBHOOK_MAX_AGE_MS || sentAt > now + LALAMOVE_WEBHOOK_MAX_SKEW_MS) {
        return { kind: 'expired', reason: `timestamp ${new Date(sentAt).toISOString()} is outside the accepted window` };
    }

    const data = JSON.parse(rawData) as {
        order?: { orderId?: unknown; status?: unknown };
        prevOrderId?: unknown;
        updatedAt?: unknown;
    };
    const asId = (value: unknown) => (typeof value === 'string' || typeof value === 'number' ? String(value) : undefined);
    return {
        kind: 'event',
        event: {
            eventId: typeof parsed.eventId === 'string' ? parsed.eventId : '',
            eventKey: `lalamove:${sha256Hex(`${timestamp}\n${compactData}`)}`,
            eventType: String(parsed.eventType ?? ''),
            orderId: asId(data.order?.orderId),
            prevOrderId: asId(data.prevOrderId),
            status: typeof data.order?.status === 'string' ? data.order.status : undefined,
            occurredAt: parseLalamoveTime(data.updatedAt) ?? new Date(sentAt),
        },
    };
}

function unique(values: string[]): string[] {
    return [...new Set(values.filter(Boolean))];
}

/**
 * Lalamove times are UTC ISO 8601, but the webhook samples also show "2026-04-01T15:17.00Z"
 * (hours:minutes, then fractional zero seconds); both are accepted.
 */
export function parseLalamoveTime(value: unknown): Date | undefined {
    if (typeof value !== 'string' || !value) return undefined;
    const strict = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(value) ? new Date(value) : undefined;
    if (strict && !Number.isNaN(strict.getTime())) return strict;
    const loose = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?Z?$/);
    if (!loose) return undefined;
    const [, y, mo, d, h, mi, s] = loose;
    const date = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, s ? +s : 0));
    return Number.isNaN(date.getTime()) ? undefined : date;
}

/**
 * The exact source text of each top-level property of a JSON object. Undefined for malformed text or a
 * repeated property (JSON.parse would keep the last one, a signature check might read the first).
 */
export function topLevelProperties(text: string): Map<string, string> | undefined {
    const result = new Map<string, string>();
    let i = 0;
    const n = text.length;
    const skipWhitespace = () => {
        while (i < n && (text[i] === ' ' || text[i] === '\n' || text[i] === '\r' || text[i] === '\t')) i++;
    };
    const skipString = (): boolean => {
        i++;
        while (i < n) {
            const c = text[i];
            if (c === '\\') {
                i += 2;
                continue;
            }
            i++;
            if (c === '"') return true;
        }
        return false;
    };
    const skipValue = (): boolean => {
        const c = text[i];
        if (c === '"') return skipString();
        if (c === '{' || c === '[') {
            let depth = 0;
            while (i < n) {
                const ch = text[i];
                if (ch === '"') {
                    if (!skipString()) return false;
                    continue;
                }
                if (ch === '{' || ch === '[') depth++;
                else if (ch === '}' || ch === ']') {
                    depth--;
                    if (depth === 0) {
                        i++;
                        return true;
                    }
                }
                i++;
            }
            return false;
        }
        const start = i;
        while (i < n && !/[\s,}\]]/.test(text[i])) i++;
        return i > start;
    };

    skipWhitespace();
    if (text[i] !== '{') return undefined;
    i++;
    skipWhitespace();
    if (text[i] === '}') return result;
    while (i < n) {
        skipWhitespace();
        if (text[i] !== '"') return undefined;
        const keyStart = i;
        if (!skipString()) return undefined;
        let key: string;
        try {
            key = JSON.parse(text.slice(keyStart, i));
        } catch {
            return undefined;
        }
        skipWhitespace();
        if (text[i] !== ':') return undefined;
        i++;
        skipWhitespace();
        const valueStart = i;
        if (!skipValue()) return undefined;
        if (result.has(key)) return undefined;
        result.set(key, text.slice(valueStart, i));
        skipWhitespace();
        if (text[i] === ',') {
            i++;
            continue;
        }
        if (text[i] === '}') return result;
        return undefined;
    }
    return undefined;
}
