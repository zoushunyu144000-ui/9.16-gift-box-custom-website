import { createHmac, timingSafeEqual } from 'node:crypto';
import { assertAmount, malaysianPhone, toSen, truncate } from './format';
import { GatewayHttp, gatewayHttp, normaliseBaseUrl, requestJson } from './http';
import {
    CallbackVerificationError,
    CheckoutRequest,
    CheckoutSession,
    FetchLike,
    GatewayConfigError,
    GatewayError,
    GatewayPaymentState,
    GatewayPaymentStatus,
    HeaderMap,
    HostedPaymentGateway,
    VerifiedCallback,
} from './types';

/** Billplz API v3 (https://www.billplz.com/api). Sandbox is a separate account with its own keys. */
export const BILLPLZ_API_URL = 'https://www.billplz.com/api/v3/';
export const BILLPLZ_SANDBOX_API_URL = 'https://www.billplz-sandbox.com/api/v3/';

/**
 * The string Billplz signs: every key and value pair except x_signature, each written as key + value,
 * sorted ascending ignoring case, joined with "|". Redirect keys lose their brackets
 * (billplz[paid_at] → billplzpaid_at).
 */
export function billplzSourceString(pairs: Iterable<readonly [string, string]>): string {
    const parts: string[] = [];
    for (const [key, value] of pairs) {
        const name = key.replace(/[[\]]/g, '');
        if (name === 'x_signature' || name === 'billplzx_signature') continue;
        parts.push(name + value);
    }
    return parts
        .sort((a, b) => {
            const x = a.toLowerCase();
            const y = b.toLowerCase();
            return x < y ? -1 : x > y ? 1 : 0;
        })
        .join('|');
}

/** X Signature: HMAC-SHA256 of the source string with the account's X Signature key, as lowercase hex. */
export function billplzSignature(pairs: Iterable<readonly [string, string]>, xSignatureKey: string): string {
    return createHmac('sha256', xSignatureKey).update(billplzSourceString(pairs)).digest('hex');
}

function signatureMatches(pairs: Array<[string, string]>, signature: string, xSignatureKey: string): boolean {
    const expected = Buffer.from(billplzSignature(pairs, xSignatureKey), 'utf8');
    const given = Buffer.from(signature.trim().toLowerCase(), 'utf8');
    return given.length === expected.length && timingSafeEqual(given, expected);
}

/** The bill id a callback body claims to be about, read before the signature is checked (to find its settings). */
export function billplzCallbackId(rawBody: Buffer | string): string | undefined {
    return new URLSearchParams(rawBody.toString()).get('id') || undefined;
}

export interface BillplzBill {
    id?: string;
    collection_id?: string;
    paid?: boolean | string;
    state?: string;
    amount?: number | string;
    paid_amount?: number | string;
    paid_at?: string | null;
    url?: string;
    reference_1?: string | null;
}

/** Bill states: due (unpaid; a failed attempt leaves it due), paid, deleted. */
export function billplzState(bill: Pick<BillplzBill, 'paid' | 'state'>): GatewayPaymentState {
    if (bill.paid === true || bill.paid === 'true' || bill.state === 'paid') return 'paid';
    if (bill.state === 'deleted') return 'cancelled';
    return 'pending';
}

/** "2018-09-27 15:15:09 +0800" → Date. */
export function parseBillplzTime(value: string | null | undefined): Date | undefined {
    const match = value && /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-])(\d{2})(\d{2})$/.exec(value.trim());
    if (!match) return undefined;
    const date = new Date(`${match[1]}T${match[2]}${match[3]}${match[4]}:${match[5]}`);
    return Number.isNaN(date.getTime()) ? undefined : date;
}

export function billplzPaymentStatus(bill: BillplzBill, id: string): GatewayPaymentStatus {
    const state = billplzState(bill);
    const amount = toSen(bill.amount) ?? 0;
    const paidAmount = toSen(bill.paid_amount) ?? 0;
    return {
        id: bill.id || id,
        reference: bill.reference_1 || undefined,
        state,
        gatewayStatus: bill.state || (state === 'paid' ? 'paid' : 'due'),
        amount,
        // Bills are paid in full; paid_amount is what Billplz recorded, the bill amount when it leaves it out.
        paidAmount: state === 'paid' ? (paidAmount > 0 ? paidAmount : amount) : 0,
        currencyCode: 'MYR',
        account: bill.collection_id || undefined,
        paidAt: parseBillplzTime(bill.paid_at),
    };
}

export interface BillplzClientOptions {
    /** API secret key (Basic auth username). */
    apiKey: string;
    collectionId: string;
    xSignatureKey: string;
    /** Use the sandbox address; ignored when baseUrl is given. */
    sandbox?: boolean;
    baseUrl?: string;
    fetch?: FetchLike;
    timeoutMs?: number;
}

export class BillplzClient implements HostedPaymentGateway {
    readonly name = 'Billplz';
    private readonly apiKey: string;
    private readonly collectionId: string;
    private readonly xSignatureKey: string;
    private readonly baseUrl: URL;
    private readonly http: GatewayHttp;

    constructor(options: BillplzClientOptions) {
        this.apiKey = options.apiKey?.trim() ?? '';
        this.collectionId = options.collectionId?.trim() ?? '';
        this.xSignatureKey = options.xSignatureKey?.trim() ?? '';
        if (!this.apiKey) throw new GatewayConfigError('Billplz API secret key is missing.');
        if (!this.collectionId) throw new GatewayConfigError('Billplz collection ID is missing.');
        // Without it callbacks can't be checked, so bills are never created without it.
        if (!this.xSignatureKey) throw new GatewayConfigError('Billplz X Signature key is missing.');
        this.baseUrl = normaliseBaseUrl('Billplz', options.baseUrl, options.sandbox ? BILLPLZ_SANDBOX_API_URL : BILLPLZ_API_URL);
        this.http = gatewayHttp(options);
    }

    /** The POST /bills form for a checkout. Billplz has no cancel link, so cancelUrl isn't used. */
    billRequest(request: CheckoutRequest): URLSearchParams {
        assertAmount('Billplz', request.amount);
        if (request.currencyCode !== 'MYR') throw new GatewayError('Billplz only takes ringgit (MYR)', { retryable: false });
        if (!request.callbackUrl) throw new GatewayConfigError('Billplz needs a callback URL.');
        const form = new URLSearchParams();
        form.set('collection_id', this.collectionId);
        form.set('email', request.customer.email);
        const phone = malaysianPhone(request.customer.phone);
        if (phone) form.set('mobile', phone.e164);
        form.set('name', truncate(request.customer.fullName || request.customer.email, 255));
        form.set('amount', String(request.amount));
        form.set('callback_url', request.callbackUrl);
        form.set('redirect_url', request.returnUrl);
        const items = request.items?.length ? `: ${request.items.map(i => (i.quantity > 1 ? `${i.quantity} × ${i.name}` : i.name)).join(', ')}` : '';
        form.set('description', truncate(`${request.description}${items}`, 200));
        // Not "Bank Code": that label makes Billplz skip its payment page.
        form.set('reference_1_label', 'Order');
        form.set('reference_1', truncate(request.reference, 120));
        return form;
    }

    async createCheckout(request: CheckoutRequest): Promise<CheckoutSession> {
        const bill = await this.call<BillplzBill>('POST', 'bills', this.billRequest(request));
        if (!bill.id || !bill.url) throw new GatewayError("Billplz didn't return a bill page", { retryable: true });
        return { id: bill.id, url: bill.url };
    }

    async getStatus(id: string): Promise<GatewayPaymentStatus> {
        const bill = await this.call<BillplzBill>('GET', `bills/${encodeURIComponent(id)}`);
        return billplzPaymentStatus(bill, id);
    }

    /** Checks an X Signature callback (form-encoded POST); the signature is in the body, so headers aren't used. */
    async verifyCallback(rawBody: Buffer | string, _headers: HeaderMap): Promise<VerifiedCallback> {
        const params = new URLSearchParams(rawBody.toString());
        const signature = params.get('x_signature');
        if (!signature) throw new CallbackVerificationError('x_signature is missing');
        if (!signatureMatches([...params], signature, this.xSignatureKey)) {
            throw new CallbackVerificationError("the signature doesn't match the body");
        }
        const id = params.get('id');
        if (!id) throw new CallbackVerificationError('the body has no bill id');
        const state = billplzState({ paid: params.get('paid') ?? undefined, state: params.get('state') ?? undefined });
        return { id, paid: state === 'paid', state, gatewayStatus: params.get('state') || (state === 'paid' ? 'paid' : 'due') };
    }

    private call<T>(method: 'GET' | 'POST', path: string, form?: URLSearchParams): Promise<T> {
        return requestJson<T>('Billplz', this.http, new URL(path, this.baseUrl), {
            method,
            headers: {
                authorization: `Basic ${Buffer.from(`${this.apiKey}:`).toString('base64')}`,
                ...(form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
            },
            body: form?.toString(),
        });
    }
}
