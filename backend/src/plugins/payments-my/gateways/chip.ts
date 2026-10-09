import { createHash, createPublicKey, verify } from 'node:crypto';
import { assertAmount, itemsAddingUpTo, malaysianPhone, toSen, truncate } from './format';
import { describeError, GatewayHttp, gatewayHttp, headerValue, normaliseBaseUrl, requestJson } from './http';
import {
    CallbackVerificationError,
    CheckoutRequest,
    CheckoutSession,
    FetchLike,
    GatewayConfigError,
    GatewayError,
    GatewayPaymentState,
    GatewayPaymentStatus,
    GatewayRefund,
    HeaderMap,
    HostedPaymentGateway,
    PreferredMethod,
    VerifiedCallback,
} from './types';

/**
 * CHIP Collect (https://docs.chip-in.asia, OpenAPI chip-collect.yaml). Test and live keys use the same
 * address; the key decides whether a purchase is a test one.
 */
export const CHIP_API_URL = 'https://gate.chip-in.asia/api/v1/';

/** Method names CHIP accepts in payment_method_whitelist (from its OpenAPI spec). */
export const CHIP_PAYMENT_METHODS = [
    'fpx',
    'fpx_b2b1',
    'duitnow_qr',
    'dnqr',
    'visa',
    'mastercard',
    'maestro',
    'mpgs_apple_pay',
    'mpgs_google_pay',
    'razer_atome',
    'razer_grabpay',
    'razer_maybankqr',
    'razer_shopeepay',
    'razer_tng',
    'shopee_pay',
    'crypto_coin',
] as const;

/** CHIP methods for each storefront hint, most common first. */
const HINTS: Record<PreferredMethod, readonly string[]> = {
    fpx: ['fpx'],
    fpx_b2b: ['fpx_b2b1'],
    card: ['visa', 'mastercard', 'maestro'],
    ewallet: ['razer_tng', 'razer_grabpay', 'razer_shopeepay', 'shopee_pay'],
    duitnow_qr: ['duitnow_qr', 'dnqr'],
};

/** Purchase.status values in our words. Anything not listed counts as not paid. */
const STATES: Record<string, GatewayPaymentState> = {
    paid: 'paid',
    cleared: 'paid',
    settled: 'paid',
    created: 'pending',
    sent: 'pending',
    viewed: 'pending',
    overdue: 'pending',
    pending_execute: 'pending',
    pending_charge: 'pending',
    hold: 'pending',
    pending_capture: 'pending',
    preauthorized: 'pending',
    // A failed attempt; the customer can still try again on the same purchase.
    error: 'failed',
    blocked: 'failed',
    cancelled: 'cancelled',
    released: 'cancelled',
    pending_release: 'cancelled',
    expired: 'expired',
    pending_refund: 'refunded',
    refunded: 'refunded',
    chargeback: 'refunded',
};

export function chipState(status: string | undefined): GatewayPaymentState {
    return (status && STATES[status]) || 'pending';
}

/** CHIP method names from a comma- or space-separated setting, e.g. "fpx, duitnow_qr, visa". */
export function parseChipMethods(value: string | undefined): string[] {
    const names = (value ?? '')
        .toLowerCase()
        .split(/[\s,]+/)
        .filter(name => /^[a-z0-9_]+$/.test(name));
    return [...new Set(names)];
}

/**
 * Why CHIP would refuse this success_callback URL, or undefined when it's fine. CHIP only calls http(s)
 * addresses on the default port, and rejects a URL that spells out any port.
 */
export function chipCallbackUrlProblem(url: string): string | undefined {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return 'it is not a valid URL';
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return 'CHIP only calls http(s) addresses';
    if (parsed.port) return `CHIP doesn't call addresses with a port number (${parsed.host})`;
    return undefined;
}

/** CHIP signs callbacks with RSA PKCS#1 v1.5 over the SHA-256 of the raw body; X-Signature holds it in base64. */
export function rsaSha256Verify(body: Buffer, signatureBase64: string, publicKeyPem: string): boolean {
    try {
        return verify('sha256', body, publicKeyPem, Buffer.from(signatureBase64, 'base64'));
    } catch {
        return false;
    }
}

/** The purchase id a callback body claims to be about, read before the signature is checked (to find its settings). */
export function chipCallbackId(rawBody: Buffer | string): string | undefined {
    try {
        const body = JSON.parse(rawBody.toString()) as { id?: unknown };
        return typeof body?.id === 'string' && body.id ? body.id : undefined;
    } catch {
        return undefined;
    }
}

export interface ChipPurchase {
    id?: string;
    type?: string;
    status?: string;
    reference?: string;
    brand_id?: string;
    is_test?: boolean;
    checkout_url?: string;
    purchase?: { total?: number; currency?: string } | null;
    payment?: { amount?: number; currency?: string; paid_on?: number } | null;
    transaction_data?: { payment_method?: string } | null;
}

export function chipPaymentStatus(purchase: ChipPurchase, id: string): GatewayPaymentStatus {
    const state = chipState(purchase.status);
    const amount = toSen(purchase.purchase?.total) ?? 0;
    const paid = toSen(purchase.payment?.amount);
    return {
        id: purchase.id || id,
        reference: purchase.reference || undefined,
        state,
        gatewayStatus: purchase.status || 'unknown',
        amount,
        paidAmount: paid ?? (state === 'paid' ? amount : 0),
        currencyCode: purchase.payment?.currency || purchase.purchase?.currency || '',
        account: purchase.brand_id || undefined,
        method: purchase.transaction_data?.payment_method || undefined,
        paidAt: typeof purchase.payment?.paid_on === 'number' ? new Date(purchase.payment.paid_on * 1000) : undefined,
        test: purchase.is_test,
    };
}

interface CachedKey {
    pem: string;
    fetchedAt: number;
}
export type ChipKeyCache = Map<string, CachedKey>;

// The public key is company-wide and rarely changes, so it is fetched once and kept.
const sharedKeyCache: ChipKeyCache = new Map();
const keyRequests = new Map<string, Promise<string>>();
const KEY_TTL_MS = 12 * 60 * 60 * 1000;
// After a signature fails the key is fetched again (CHIP may have rotated it), but no more often than this,
// so forged callbacks can't make us hammer CHIP.
const KEY_REFRESH_MS = 5 * 60 * 1000;

export interface ChipClientOptions {
    brandId: string;
    secretKey: string;
    /** Limits the payment page to these CHIP methods; empty offers everything the account has. */
    paymentMethodWhitelist?: string[];
    /** API root; defaults to CHIP_API_URL. */
    baseUrl?: string;
    fetch?: FetchLike;
    timeoutMs?: number;
    keyCache?: ChipKeyCache;
    now?: () => number;
}

export class ChipClient implements HostedPaymentGateway {
    readonly name = 'CHIP';
    private readonly brandId: string;
    private readonly secretKey: string;
    private readonly baseUrl: URL;
    private readonly http: GatewayHttp;
    private readonly whitelist: string[];
    private readonly keyCache: ChipKeyCache;
    private readonly now: () => number;

    constructor(options: ChipClientOptions) {
        this.brandId = options.brandId?.trim() ?? '';
        this.secretKey = options.secretKey?.trim() ?? '';
        if (!this.brandId) throw new GatewayConfigError('CHIP brand ID is missing.');
        if (!this.secretKey) throw new GatewayConfigError('CHIP secret key is missing.');
        this.baseUrl = normaliseBaseUrl('CHIP', options.baseUrl, CHIP_API_URL);
        this.http = gatewayHttp(options);
        this.whitelist = options.paymentMethodWhitelist ?? [];
        this.keyCache = options.keyCache ?? sharedKeyCache;
        this.now = options.now ?? Date.now;
    }

    /** The POST /purchases/ body for a checkout. `callbackUrl` must pass chipCallbackUrlProblem. */
    purchaseRequest(request: CheckoutRequest) {
        assertAmount('CHIP', request.amount);
        const items = itemsAddingUpTo(request.items, request.amount);
        const products = items
            ? items.map(item => ({ name: truncate(item.name, 256), price: item.unitPrice, quantity: String(item.quantity) }))
            : [{ name: truncate(request.description, 256), price: request.amount, quantity: '1' }];
        const phone = malaysianPhone(request.customer.phone);
        const fullName = truncate(request.customer.fullName, 128);
        return {
            brand_id: this.brandId,
            client: {
                email: request.customer.email,
                ...(fullName ? { full_name: fullName } : {}),
                ...(phone ? { phone: `+60 ${phone.national}` } : {}),
            },
            purchase: { currency: request.currencyCode, products },
            reference: request.reference,
            success_redirect: request.returnUrl,
            // After a failed attempt the customer goes back too; the storefront shows the status and offers another try.
            failure_redirect: request.returnUrl,
            cancel_redirect: request.cancelUrl,
            ...(request.callbackUrl ? { success_callback: request.callbackUrl } : {}),
            ...(this.whitelist.length ? { payment_method_whitelist: this.whitelist } : {}),
            creator_agent: 'Vendure payments-my',
            platform: 'api',
        };
    }

    async createCheckout(request: CheckoutRequest): Promise<CheckoutSession> {
        const purchase = await this.call<ChipPurchase>('POST', 'purchases/', this.purchaseRequest(request));
        if (!purchase.id || !purchase.checkout_url) {
            throw new GatewayError("CHIP didn't return a payment page", { retryable: true });
        }
        return { id: purchase.id, url: this.checkoutUrl(purchase.checkout_url, request.preferredMethod) };
    }

    /** Pre-selects the hinted method on CHIP's page (?active=) without hiding the others. */
    checkoutUrl(checkoutUrl: string, hint?: PreferredMethod): string {
        const method = (hint ? HINTS[hint] : []).find(name => !this.whitelist.length || this.whitelist.includes(name));
        if (!method) return checkoutUrl;
        const url = new URL(checkoutUrl);
        url.searchParams.set('active', method);
        return url.href;
    }

    async getStatus(id: string): Promise<GatewayPaymentStatus> {
        const purchase = await this.call<ChipPurchase>('GET', `purchases/${encodeURIComponent(id)}/`);
        return chipPaymentStatus(purchase, id);
    }

    async verifyCallback(rawBody: Buffer | string, headers: HeaderMap): Promise<VerifiedCallback> {
        const signature = headerValue(headers, 'x-signature')?.trim();
        if (!signature) throw new CallbackVerificationError('the X-Signature header is missing');
        const body = typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : rawBody;
        const key = await this.publicKey(false);
        if (!rsaSha256Verify(body, signature, key)) {
            const fresh = await this.publicKey(true);
            if (fresh === key || !rsaSha256Verify(body, signature, fresh)) {
                throw new CallbackVerificationError("the signature doesn't match the body");
            }
        }
        let purchase: ChipPurchase;
        try {
            purchase = JSON.parse(body.toString('utf8')) as ChipPurchase;
        } catch {
            throw new CallbackVerificationError("the body isn't JSON");
        }
        if (typeof purchase?.id !== 'string' || !purchase.id) throw new CallbackVerificationError('the body has no purchase id');
        if (purchase.brand_id && purchase.brand_id !== this.brandId) {
            throw new CallbackVerificationError('the purchase belongs to another CHIP brand');
        }
        const state = chipState(purchase.status);
        return { id: purchase.id, reference: purchase.reference || undefined, paid: state === 'paid', state, gatewayStatus: purchase.status || 'unknown' };
    }

    async refund(id: string, amount: number): Promise<GatewayRefund> {
        assertAmount('CHIP', amount);
        let reply: ChipPurchase;
        try {
            reply = await this.call<ChipPurchase>('POST', `purchases/${encodeURIComponent(id)}/refund/`, { amount });
        } catch (error) {
            // CHIP refused (e.g. purchase_refund_error, more than the refundable amount): nothing was refunded.
            if (error instanceof GatewayError && error.status !== undefined && error.status < 500) {
                return { state: 'failed', message: error.message };
            }
            // No answer: the refund may or may not have gone through.
            return {
                state: 'pending',
                message: `CHIP didn't confirm the refund (${describeError(error)}). Check purchase ${id} in the CHIP portal before trying again.`,
            };
        }
        // A finished refund comes back as the refund Payment; a slow one as the Purchase in pending_refund.
        if (reply.type === 'purchase' || reply.status) {
            return reply.status === 'refunded' ? { state: 'settled' } : { state: 'pending', message: 'CHIP is still processing the refund.' };
        }
        return { state: 'settled', id: reply.id };
    }

    private async publicKey(refresh: boolean): Promise<string> {
        const cacheKey = createHash('sha256').update(`${this.baseUrl.href}\n${this.secretKey}`).digest('hex');
        const cached = this.keyCache.get(cacheKey);
        const age = cached ? this.now() - cached.fetchedAt : Infinity;
        if (cached && age < (refresh ? KEY_REFRESH_MS : KEY_TTL_MS)) return cached.pem;
        let request = keyRequests.get(cacheKey);
        if (!request) {
            request = this.fetchPublicKey().finally(() => keyRequests.delete(cacheKey));
            keyRequests.set(cacheKey, request);
        }
        const pem = await request;
        this.keyCache.set(cacheKey, { pem, fetchedAt: this.now() });
        return pem;
    }

    private async fetchPublicKey(): Promise<string> {
        // GET /public_key/ answers with the PEM as a JSON string.
        const pem = await this.call<unknown>('GET', 'public_key/');
        if (typeof pem !== 'string') throw new GatewayError("CHIP's public key reply isn't a PEM string", { retryable: true });
        try {
            createPublicKey(pem);
        } catch {
            throw new GatewayError("CHIP's public key couldn't be read", { retryable: true });
        }
        return pem;
    }

    private call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
        return requestJson<T>('CHIP', this.http, new URL(path, this.baseUrl), {
            method,
            headers: {
                authorization: `Bearer ${this.secretKey}`,
                ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
            },
            body: body !== undefined ? JSON.stringify(body) : undefined,
        });
    }
}
