/** Node 22's built-in fetch; injectable so tests and the e2e smoke test can point clients at mock servers. */
export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

export interface HttpResponse<T = unknown> {
    status: number;
    ok: boolean;
    /** Parsed JSON, or undefined when the body is empty or not JSON. */
    json: T | undefined;
    text: string;
}

export interface HttpRequest {
    method: string;
    headers?: Record<string, string>;
    body?: string;
    timeoutMs?: number;
}

export async function httpRequest<T = unknown>(fetchFn: FetchFn, url: string, request: HttpRequest): Promise<HttpResponse<T>> {
    const response = await fetchFn(url, {
        method: request.method,
        headers: request.headers,
        body: request.body,
        signal: AbortSignal.timeout(request.timeoutMs ?? 15_000),
    });
    const text = await response.text();
    let json: T | undefined;
    try {
        json = text ? (JSON.parse(text) as T) : undefined;
    } catch {
        json = undefined;
    }
    return { status: response.status, ok: response.ok, json, text };
}

/**
 * An error from a courier or Google. The message is safe to show staff (it becomes the dashboard's
 * "could not create fulfillment" reason); it never contains credentials or tokens.
 */
export class ProviderError extends Error {
    constructor(
        readonly provider: 'lalamove' | 'easyparcel' | 'google',
        message: string,
        readonly status?: number,
        readonly code?: string,
    ) {
        super(message);
        this.name = 'ProviderError';
    }
}

/** Trims long provider responses before they go into an error message or a log line. */
export function snippet(text: string, max = 300): string {
    const flat = text.replace(/\s+/g, ' ').trim();
    return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}
