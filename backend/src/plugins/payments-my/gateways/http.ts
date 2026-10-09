import { FetchLike, GatewayConfigError, GatewayError, HeaderMap } from './types';

export const DEFAULT_TIMEOUT_MS = 15_000;

export interface GatewayHttp {
    fetch: FetchLike;
    timeoutMs: number;
}

export function gatewayHttp(options: { fetch?: FetchLike; timeoutMs?: number }): GatewayHttp {
    // Looked up on each call rather than captured, so a stubbed global fetch is picked up too.
    return { fetch: options.fetch ?? ((url, init) => fetch(url, init)), timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS };
}

/**
 * Sends a request to a gateway and parses its JSON reply. Network failures, timeouts, error replies and
 * non-JSON replies become GatewayError. Credentials travel in headers only, so error messages never hold them.
 */
export async function requestJson<T>(
    gateway: string,
    http: GatewayHttp,
    url: URL,
    init: { method: 'GET' | 'POST'; headers: Record<string, string>; body?: string },
): Promise<T> {
    let response: Response;
    try {
        response = await http.fetch(url.href, {
            method: init.method,
            headers: { accept: 'application/json', ...init.headers },
            body: init.body,
            // A redirect means the base URL is wrong; following it could send the credentials elsewhere.
            redirect: 'error',
            signal: AbortSignal.timeout(http.timeoutMs),
        });
    } catch (error) {
        const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
        throw new GatewayError(
            timedOut ? `${gateway} didn't answer within ${Math.round(http.timeoutMs / 1000)} seconds` : `${gateway} couldn't be reached (${describeError(error)})`,
            { retryable: true },
        );
    }
    const text = await response.text().catch(() => '');
    let body: unknown;
    try {
        body = text ? JSON.parse(text) : undefined;
    } catch {
        body = undefined;
    }
    if (!response.ok) {
        throw new GatewayError(`${gateway} replied ${response.status}: ${summariseErrorBody(body, text)}`, {
            status: response.status,
            retryable: response.status >= 500 || response.status === 429,
        });
    }
    if (body === undefined) {
        throw new GatewayError(`${gateway} sent a reply that isn't JSON`, { status: response.status, retryable: true });
    }
    return body as T;
}

/**
 * The gateway's API root as a URL ending in "/". Requires https, except for localhost (mock servers in tests),
 * so a mistyped override can't send credentials over plain HTTP.
 */
export function normaliseBaseUrl(gateway: string, raw: string | undefined, fallback: string): URL {
    const value = raw?.trim() || fallback;
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        throw new GatewayConfigError(`${gateway} API address "${value}" isn't a valid URL.`);
    }
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
        throw new GatewayConfigError(`${gateway} API address must start with https://.`);
    }
    if (url.username || url.password || url.search || url.hash) {
        throw new GatewayConfigError(`${gateway} API address can't contain credentials, a query or a fragment.`);
    }
    if (!url.pathname.endsWith('/')) url.pathname += '/';
    return url;
}

/** A header's value, looked up case-insensitively (Node lowercases incoming names; test stubs may not). */
export function headerValue(headers: HeaderMap, name: string): string | undefined {
    const wanted = name.toLowerCase();
    for (const [key, value] of Object.entries(headers)) {
        if (key.toLowerCase() !== wanted) continue;
        return Array.isArray(value) ? value[0] : value;
    }
    return undefined;
}

/**
 * A short, log-safe summary of an error reply. CHIP sends {"field": [{"message", "code"}]} or
 * {"__all__": {"message", "code"}}; Billplz sends {"error": {"type", "message": [...]}}.
 */
export function summariseErrorBody(body: unknown, text: string): string {
    const parts: string[] = [];
    const visit = (value: unknown, path: string, depth: number) => {
        if (parts.length >= 4 || depth > 5 || value == null) return;
        if (typeof value === 'string') {
            parts.push(path ? `${path}: ${value}` : value);
            return;
        }
        if (Array.isArray(value)) {
            for (const item of value) visit(item, path, depth + 1);
            return;
        }
        if (typeof value === 'object') {
            const record = value as Record<string, unknown>;
            if (typeof record.message === 'string' || Array.isArray(record.message)) {
                const message = Array.isArray(record.message) ? record.message.join(' ') : record.message;
                const code = typeof record.code === 'string' ? ` (${record.code})` : typeof record.type === 'string' ? ` (${record.type})` : '';
                parts.push(`${path && path !== '__all__' && path !== 'error' ? `${path}: ` : ''}${message}${code}`);
                return;
            }
            for (const [key, child] of Object.entries(record)) visit(child, path ? `${path}.${key}` : key, depth + 1);
        }
    };
    visit(body, '', 0);
    const summary = parts.length ? parts.join('; ') : text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || 'no details';
    return summary.length > 300 ? `${summary.slice(0, 299)}…` : summary;
}

export function describeError(error: unknown): string {
    if (error instanceof Error) {
        const cause = (error as { cause?: unknown }).cause;
        return cause instanceof Error ? `${error.message}: ${cause.message}` : error.message;
    }
    return String(error);
}
