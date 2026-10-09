import { randomUUID } from 'node:crypto';
import { hmacSha256Hex } from '../crypto';
import { FetchFn, httpRequest, HttpResponse, ProviderError, snippet } from './http';

export const LALAMOVE_SANDBOX_URL = 'https://rest.sandbox.lalamove.com';
export const LALAMOVE_PRODUCTION_URL = 'https://rest.lalamove.com';

/**
 * Lalamove API v3 "Signature": lowercase hex HMAC-SHA256 of
 * `${TIMESTAMP}\r\n${METHOD}\r\n${PATH}\r\n\r\n${BODY}` with the API secret. PATH includes the version
 * (/v3/quotations); BODY is the exact JSON sent, or empty for GET and DELETE.
 */
export function lalamoveSignature(secret: string, timestamp: string, method: string, path: string, body: string): string {
    return hmacSha256Hex(secret, `${timestamp}\r\n${method.toUpperCase()}\r\n${path}\r\n\r\n${body}`);
}

/** `Authorization: hmac <KEY>:<TIMESTAMP>:<SIGNATURE>`, timestamp in milliseconds. */
export function lalamoveAuthorization(apiKey: string, secret: string, timestamp: string, method: string, path: string, body: string): string {
    return `hmac ${apiKey}:${timestamp}:${lalamoveSignature(secret, timestamp, method, path, body)}`;
}

export interface LalamoveCoordinates {
    lat: string;
    lng: string;
}

export interface LalamoveStop {
    stopId?: string;
    coordinates: LalamoveCoordinates;
    address: string;
}

export interface LalamoveQuotationRequest {
    serviceType: string;
    language: string;
    stops: LalamoveStop[];
    scheduleAt?: string;
    specialRequests?: string[];
}

export interface LalamovePriceBreakdown {
    total?: string;
    currency?: string;
    [item: string]: string | undefined;
}

export interface LalamoveQuotation {
    quotationId: string;
    scheduleAt?: string;
    expiresAt?: string;
    serviceType?: string;
    stops: Array<LalamoveStop & { stopId: string }>;
    priceBreakdown?: LalamovePriceBreakdown;
    distance?: { value: string; unit: string };
}

export interface LalamoveContact {
    stopId: string;
    name: string;
    phone: string;
    remarks?: string;
}

export interface LalamovePlaceOrderRequest {
    quotationId: string;
    sender: Omit<LalamoveContact, 'remarks'>;
    recipients: LalamoveContact[];
    isPODEnabled?: boolean;
    metadata?: Record<string, string>;
}

export interface LalamoveOrderStop {
    stopId?: string;
    address?: string;
    name?: string;
    phone?: string;
    POD?: { status?: string; image?: string; deliveredAt?: string };
}

export interface LalamoveOrder {
    /** 19 digits: always a string, never a number. */
    orderId: string;
    quotationId?: string;
    priceBreakdown?: LalamovePriceBreakdown;
    driverId?: string;
    shareLink?: string;
    status: string;
    distance?: { value: string; unit: string };
    stops?: LalamoveOrderStop[];
    metadata?: Record<string, string>;
}

export interface LalamoveCity {
    locode: string;
    name: string;
    services: Array<{ key: string; description?: string }>;
}

export interface LalamoveClientOptions {
    apiKey: string;
    apiSecret: string;
    baseUrl: string;
    /** UN/LOCODE country: MY. */
    market?: string;
    fetch?: FetchFn;
    timeoutMs?: number;
}

/** Thin client for the calls this plugin needs (the official SDK has not been updated since 2022). */
export class LalamoveClient {
    constructor(private readonly options: LalamoveClientOptions) {}

    async request<T>(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T | undefined> {
        const payload = body === undefined ? '' : JSON.stringify({ data: body });
        const timestamp = Date.now().toString();
        const headers: Record<string, string> = {
            Authorization: lalamoveAuthorization(this.options.apiKey, this.options.apiSecret, timestamp, method, path, payload),
            Market: this.options.market ?? 'MY',
            'Request-ID': randomUUID(),
            Accept: 'application/json',
        };
        if (payload) headers['Content-Type'] = 'application/json';
        const response = await httpRequest<{ data?: T }>(this.options.fetch ?? fetch, `${this.options.baseUrl.replace(/\/$/, '')}${path}`, {
            method,
            headers,
            body: payload || undefined,
            timeoutMs: this.options.timeoutMs,
        });
        if (!response.ok) throw lalamoveError(response);
        return response.json?.data;
    }

    async getCities(): Promise<LalamoveCity[]> {
        return (await this.request<LalamoveCity[]>('GET', '/v3/cities')) ?? [];
    }

    async createQuotation(input: LalamoveQuotationRequest): Promise<LalamoveQuotation> {
        const quotation = await this.request<LalamoveQuotation>('POST', '/v3/quotations', input);
        if (!quotation?.quotationId || (quotation.stops?.length ?? 0) < 2) {
            throw new ProviderError('lalamove', 'Lalamove returned a quotation without an id or stops.');
        }
        return quotation;
    }

    async placeOrder(input: LalamovePlaceOrderRequest): Promise<LalamoveOrder> {
        const order = await this.request<LalamoveOrder>('POST', '/v3/orders', input);
        if (!order?.orderId) throw new ProviderError('lalamove', 'Lalamove did not return an order id.');
        return normaliseOrder(order);
    }

    async getOrder(orderId: string): Promise<LalamoveOrder> {
        const order = await this.request<LalamoveOrder>('GET', `/v3/orders/${encodeURIComponent(orderId)}`);
        if (!order?.orderId) throw new ProviderError('lalamove', `Lalamove order ${orderId} was not found.`, 404);
        return normaliseOrder(order);
    }

    /** Allowed while a driver is being assigned, or within 5 minutes of a driver match. */
    async cancelOrder(orderId: string): Promise<void> {
        await this.request('DELETE', `/v3/orders/${encodeURIComponent(orderId)}`);
    }

    async setWebhookUrl(url: string): Promise<void> {
        await this.request('PATCH', '/v3/webhook', { url });
    }
}

/** Ids are 19-digit numbers; JSON numbers that long lose precision, so they are kept as strings. */
function normaliseOrder(order: LalamoveOrder): LalamoveOrder {
    return { ...order, orderId: String(order.orderId), driverId: order.driverId != null ? String(order.driverId) : undefined };
}

const FRIENDLY_ERRORS: Record<string, string> = {
    ERR_OUT_OF_SERVICE_AREA: 'the address is outside the Lalamove service area',
    ERR_INVALID_PHONE_NUMBER: 'a phone number was rejected; check the recipient and pickup phone numbers',
    ERR_INSUFFICIENT_CREDIT: 'the Lalamove wallet needs a top-up',
    ERR_INVALID_SERVICE_TYPE: 'unknown service type for this city (see GET /delivery/lalamove/service-types)',
    ERR_INVALID_SCHEDULE_TIME: 'the scheduled pickup time is in the past',
    ERR_CANCELLATION_FORBIDDEN: 'Lalamove no longer allows cancelling this order (a driver was matched more than 5 minutes ago)',
    ERR_REVERSE_GEOCODE_FAILURE: 'Lalamove could not locate the address',
    ERR_INVALID_QUOTATION_ID: 'the quotation expired; try again',
    ERR_RATE_LIMIT_EXCEEDED: 'too many requests to Lalamove; try again in a minute',
};

function lalamoveError(response: HttpResponse): ProviderError {
    const body = response.json as { message?: string; errors?: unknown } | undefined;
    const errors = Array.isArray(body?.errors) ? body?.errors : body?.errors ? [body.errors] : [];
    const first = errors[0] as { id?: string; message?: string; detail?: string } | undefined;
    const code = first?.id ?? (body?.message?.startsWith('ERR_') ? body.message : undefined);
    const detail = (code && FRIENDLY_ERRORS[code]) || first?.detail || first?.message || body?.message || snippet(response.text) || 'no details';
    const message = response.status === 401 ? 'Lalamove rejected the API key or signature (check LALAMOVE_API_KEY, LALAMOVE_API_SECRET and LALAMOVE_SANDBOX)' : `Lalamove: ${detail}`;
    return new ProviderError('lalamove', code ? `${message} [${code}]` : message, response.status, code);
}

export interface QuotationInput {
    serviceType: string;
    language: string;
    pickup: { lat: number; lng: number; address: string };
    dropoff: { lat: number; lng: number; address: string };
    scheduleAt?: Date;
}

/** Coordinates go as strings (up to 15 decimals); 7 is ~1 cm. */
export function formatCoordinate(value: number): string {
    return String(Number(value.toFixed(7)));
}

export function buildQuotationRequest(input: QuotationInput): LalamoveQuotationRequest {
    const stop = (point: QuotationInput['pickup']): LalamoveStop => ({
        coordinates: { lat: formatCoordinate(point.lat), lng: formatCoordinate(point.lng) },
        address: point.address,
    });
    return {
        serviceType: input.serviceType,
        language: input.language,
        stops: [stop(input.pickup), stop(input.dropoff)],
        // Omitted for an immediate order; Lalamove reads scheduleAt as UTC.
        ...(input.scheduleAt ? { scheduleAt: input.scheduleAt.toISOString() } : {}),
    };
}

export interface PlaceOrderInput {
    sender: { name: string; phone: string };
    recipient: { name: string; phone: string; remarks?: string };
    proofOfDelivery: boolean;
    metadata?: Record<string, string>;
}

/** Contact details per stop; the stop ids come from the quotation (first stop = pickup). */
export function buildPlaceOrderRequest(quotation: LalamoveQuotation, input: PlaceOrderInput): LalamovePlaceOrderRequest {
    const [pickup, dropoff] = quotation.stops;
    const remarks = input.recipient.remarks?.trim().slice(0, 1500);
    return {
        quotationId: quotation.quotationId,
        sender: { stopId: pickup.stopId, name: input.sender.name, phone: input.sender.phone },
        recipients: [{ stopId: dropoff.stopId, name: input.recipient.name, phone: input.recipient.phone, ...(remarks ? { remarks } : {}) }],
        isPODEnabled: input.proofOfDelivery,
        ...(input.metadata ? { metadata: input.metadata } : {}),
    };
}

/** Malaysian prices have one decimal ("50.5" → 5050 sen). */
export function lalamoveAmountToSen(value: string | undefined): number | undefined {
    if (value == null || value === '') return undefined;
    const amount = Number(value);
    return Number.isFinite(amount) ? Math.round(amount * 100) : undefined;
}

/** POD status of the last drop-off, which tells a completed delivery from a failed one. */
export function lastStopPodStatus(order: LalamoveOrder): string | undefined {
    const stops = order.stops ?? [];
    return stops.length > 1 ? stops[stops.length - 1].POD?.status : undefined;
}
