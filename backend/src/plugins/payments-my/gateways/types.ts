/**
 * The hosted-payment gateway layer: plain TypeScript with no Vendure imports, so CHIP and Billplz can be
 * reused (and tested) on their own. Amounts are integer sen, like everything in Vendure.
 */

/** Where a payment stands at the gateway, in the same words for every gateway. */
export type GatewayPaymentState = 'pending' | 'paid' | 'failed' | 'cancelled' | 'expired' | 'refunded';

/** The storefront's hint for which method to open the payment page on. Gateways may ignore it. */
export const PREFERRED_METHODS = ['fpx', 'fpx_b2b', 'card', 'ewallet', 'duitnow_qr'] as const;
export type PreferredMethod = (typeof PREFERRED_METHODS)[number];

export function isPreferredMethod(value: unknown): value is PreferredMethod {
    return typeof value === 'string' && (PREFERRED_METHODS as readonly string[]).includes(value);
}

export interface CheckoutItem {
    name: string;
    /** Sen. */
    unitPrice: number;
    quantity: number;
}

export interface CheckoutRequest {
    /** Our reference for the payment: the order code. */
    reference: string;
    /** Amount to collect, in sen. */
    amount: number;
    currencyCode: string;
    customer: { email: string; fullName: string; phone?: string };
    /** Shown on the payment page when they add up to `amount`; otherwise the page shows one line for the order. */
    items?: CheckoutItem[];
    /** One line about the payment, e.g. "Order ABC123". */
    description: string;
    /** Where the customer lands after paying, or after a failed attempt. */
    returnUrl: string;
    /** Where the customer lands if they give up (gateways without a cancel link ignore it). */
    cancelUrl: string;
    /** Server-to-server notification address. Leave out when the gateway can't reach this server. */
    callbackUrl?: string;
    preferredMethod?: PreferredMethod;
}

export interface CheckoutSession {
    /** The gateway's id for the payment: CHIP purchase id, Billplz bill id. */
    id: string;
    /** The hosted payment page to send the customer to. */
    url: string;
}

export interface GatewayPaymentStatus {
    id: string;
    /** Our reference as the gateway holds it (CHIP `reference`, Billplz `reference_1`). */
    reference?: string;
    state: GatewayPaymentState;
    /** The gateway's own status word, for messages and logs. */
    gatewayStatus: string;
    /** Amount asked for, sen. */
    amount: number;
    /** Amount actually paid, sen; 0 until paid. */
    paidAmount: number;
    currencyCode: string;
    /** The merchant account the payment belongs to: CHIP brand id, Billplz collection id. */
    account?: string;
    /** How the customer paid, in the gateway's words (e.g. fpx, visa). */
    method?: string;
    paidAt?: Date;
    /** Made with test credentials. */
    test?: boolean;
}

/** A server-to-server callback whose signature has been checked. */
export interface VerifiedCallback {
    /** The gateway's id for the payment the callback is about. */
    id: string;
    /** Our reference, when the callback carries it (CHIP does, Billplz doesn't). */
    reference?: string;
    paid: boolean;
    state: GatewayPaymentState;
    gatewayStatus: string;
}

export interface GatewayRefund {
    /** settled: money is on its way back; pending: not confirmed yet; failed: nothing was refunded. */
    state: 'settled' | 'pending' | 'failed';
    /** The gateway's id for the refund, when it gives one. */
    id?: string;
    message?: string;
}

export type HeaderMap = Record<string, string | string[] | undefined>;

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface HostedPaymentGateway {
    /** Display name for messages: "CHIP", "Billplz". */
    readonly name: string;
    createCheckout(request: CheckoutRequest): Promise<CheckoutSession>;
    getStatus(id: string): Promise<GatewayPaymentStatus>;
    /** Checks a callback's signature against the raw request body; throws CallbackVerificationError when it doesn't match. */
    verifyCallback(rawBody: Buffer | string, headers: HeaderMap): Promise<VerifiedCallback>;
    /** Gateways without a refund API leave this out. */
    refund?(id: string, amount: number): Promise<GatewayRefund>;
}

/** The gateway couldn't be reached or refused a request. */
export class GatewayError extends Error {
    readonly status?: number;
    /** Worth trying again later (network trouble, timeouts, 5xx, rate limits). */
    readonly retryable: boolean;

    constructor(message: string, options: { status?: number; retryable: boolean }) {
        super(message);
        this.name = 'GatewayError';
        this.status = options.status;
        this.retryable = options.retryable;
    }
}

/** The payment method's settings are missing or invalid, so the gateway can't be used. */
export class GatewayConfigError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'GatewayConfigError';
    }
}

/** A callback's signature is missing or doesn't match its body. */
export class CallbackVerificationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'CallbackVerificationError';
    }
}
