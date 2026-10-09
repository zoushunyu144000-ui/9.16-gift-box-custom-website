/** Browser origins ("https://shop.example.com") from URLs or comma-separated lists of URLs; unreadable entries are skipped. */
export function originsFrom(values: ReadonlyArray<string | null | undefined>): string[] {
    const origins = new Set<string>();
    for (const value of values) {
        for (const part of (value ?? '').split(',')) {
            const trimmed = part.trim();
            if (!trimmed) continue;
            try {
                const url = new URL(trimmed);
                if (url.protocol === 'https:' || url.protocol === 'http:') origins.add(url.origin);
            } catch {
                // Not a URL: ignored, like a typo in CORS_ORIGINS would be.
            }
        }
    }
    return [...origins];
}

export type ReturnUrlCheck = { ok: true; url: URL } | { ok: false; reason: string };

// Leaves room for ?order=<code> within CHIP's 500-character limit on redirect URLs.
const MAX_RETURN_URL_LENGTH = 400;

/**
 * Return and cancel URLs must be full http(s) URLs on one of the shop's storefront origins, so the payment
 * page can't be used to send customers to someone else's site.
 */
export function checkReturnUrl(raw: string | null | undefined, allowedOrigins: readonly string[]): ReturnUrlCheck {
    const value = raw?.trim() ?? '';
    if (!value) return { ok: false, reason: 'it is empty' };
    if (value.length > MAX_RETURN_URL_LENGTH) return { ok: false, reason: `it is longer than ${MAX_RETURN_URL_LENGTH} characters` };
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        return { ok: false, reason: 'it is not a full URL' };
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return { ok: false, reason: 'it is not an http(s) URL' };
    if (url.username || url.password) return { ok: false, reason: 'it contains a user name or password' };
    if (!allowedOrigins.includes(url.origin)) return { ok: false, reason: `${url.origin} is not one of the shop's storefront addresses` };
    // CHIP refuses redirect URLs with these characters.
    if (/[<>'"]/.test(url.href)) return { ok: false, reason: 'it contains quotes or angle brackets' };
    return { ok: true, url };
}

/** The URL with ?order=<code>, replacing any order parameter the storefront put there. */
export function withOrderCode(url: URL, orderCode: string): string {
    const copy = new URL(url.href);
    copy.searchParams.set('order', orderCode);
    return copy.href;
}

/** POST /payments/<gateway>/callback?method=<code> on this server's public address, keeping any path prefix. */
export function callbackUrl(publicUrl: string, gateway: 'chip' | 'billplz', paymentMethodCode: string): string {
    const base = new URL(publicUrl);
    const prefix = base.pathname.replace(/\/+$/, '');
    const url = new URL(`${prefix}/payments/${gateway}/callback`, base.origin);
    url.searchParams.set('method', paymentMethodCode);
    return url.href;
}
