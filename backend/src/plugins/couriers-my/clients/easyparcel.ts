import { FetchFn, httpRequest, HttpResponse, ProviderError, snippet } from './http';

/** Sandbox and live share these endpoints: the account the merchant connects decides the environment. */
export const EASYPARCEL_BASE_URL = 'https://api.easyparcel.com';
export const EASYPARCEL_API_VERSION = '2026-09';

export type LabelSize = 'A4' | 'A5' | 'A6';
export type CollectionMethod = 'pickup' | 'dropoff' | 'any';

// ── OAuth 2.0 (authorization code + PKCE) ────────────────────────────────

export interface EasyParcelTokens {
    accessToken: string;
    refreshToken?: string | null;
    expiresAt?: Date | null;
    refreshTokenExpiresAt?: Date | null;
}

export interface EasyParcelOAuthOptions {
    baseUrl: string;
    clientId: string;
    clientSecret: string;
    fetch?: FetchFn;
    timeoutMs?: number;
}

export class EasyParcelOAuth {
    constructor(private readonly options: EasyParcelOAuthOptions) {}

    authorizeUrl(input: { redirectUri: string; state: string; codeChallenge: string }): string {
        const url = new URL('/oauth/login', this.options.baseUrl);
        url.searchParams.set('response_type', 'code');
        url.searchParams.set('client_id', this.options.clientId);
        url.searchParams.set('redirect_uri', input.redirectUri);
        url.searchParams.set('state', input.state);
        url.searchParams.set('code_challenge', input.codeChallenge);
        url.searchParams.set('code_challenge_method', 'S256');
        return url.toString();
    }

    exchangeCode(input: { code: string; redirectUri: string; codeVerifier: string }): Promise<EasyParcelTokens> {
        return this.tokenRequest({
            grant_type: 'authorization_code',
            code: input.code,
            redirect_uri: input.redirectUri,
            code_verifier: input.codeVerifier,
        });
    }

    refresh(refreshToken: string, redirectUri: string): Promise<EasyParcelTokens> {
        return this.tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken, redirect_uri: redirectUri });
    }

    private async tokenRequest(params: Record<string, string>): Promise<EasyParcelTokens> {
        const basic = Buffer.from(`${this.options.clientId}:${this.options.clientSecret}`).toString('base64');
        const response = await httpRequest(this.options.fetch ?? fetch, new URL('/oauth/token', this.options.baseUrl).toString(), {
            method: 'POST',
            headers: {
                Authorization: `Basic ${basic}`,
                'Content-Type': 'application/x-www-form-urlencoded',
                Accept: 'application/json',
            },
            body: new URLSearchParams(params).toString(),
            timeoutMs: this.options.timeoutMs,
        });
        const tokens = tokensFromResponse(response.json, Date.now());
        if (!response.ok || !tokens) {
            const body = response.json as { error?: string; error_description?: string; message?: string } | undefined;
            // Never echo the response body here: a token endpoint's body may contain tokens.
            const reason = body?.error_description ?? body?.error ?? body?.message ?? `HTTP ${response.status}`;
            throw new ProviderError('easyparcel', `EasyParcel token request failed: ${reason}`, response.status);
        }
        return tokens;
    }
}

/** Token responses are sometimes wrapped in `{ status_code, message, data }`. */
export function tokensFromResponse(json: unknown, now: number): EasyParcelTokens | undefined {
    const outer = json as Record<string, unknown> | undefined;
    const body = (outer?.access_token ? outer : (outer?.data as Record<string, unknown> | undefined)) ?? undefined;
    if (!body || typeof body.access_token !== 'string') return undefined;
    const date = (value: unknown, seconds: unknown): Date | null => {
        if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) return new Date(value);
        if (typeof seconds === 'number' && seconds > 0) return new Date(now + seconds * 1000);
        return null;
    };
    return {
        accessToken: body.access_token,
        refreshToken: typeof body.refresh_token === 'string' ? body.refresh_token : null,
        expiresAt: date(body.expires_at, body.expires_in),
        refreshTokenExpiresAt: date(body.refresh_token_expires_at, body.refresh_token_expires_in),
    };
}

// ── API ──────────────────────────────────────────────────────────────────

export interface EasyParcelEnvelope<T> {
    status_code?: number;
    message?: string;
    request_id?: string;
    data?: T;
}

export interface EasyParcelApiOptions {
    baseUrl: string;
    apiVersion: string;
    fetch?: FetchFn;
    timeoutMs?: number;
    /** Returns a valid access token; called again with `refresh: true` after a 401. */
    accessToken: (refresh: boolean) => Promise<string>;
}

export interface QuotationParty {
    postcode: string;
    subdivision_code: string;
    country: string;
}

export interface QuotationShipment {
    sender: QuotationParty;
    receiver: QuotationParty;
    weight: number;
    length?: number;
    width?: number;
    height?: number;
    parcel_value?: number;
}

export interface EasyParcelQuotation {
    courier: {
        service_id: string;
        service_name: string;
        courier_id?: string;
        courier_name: string;
        delivery_duration?: string | null;
        is_pickup?: boolean;
        is_dropoff?: boolean;
    };
    pricing: { currency?: string; total_amount: number | string; shipment_price?: number | string };
}

export interface EasyParcelQuotationResult {
    status: string;
    quotations?: EasyParcelQuotation[];
    errors?: string[];
}

export interface SubmitParty {
    name: string;
    company?: string;
    phone_number_country_code: string;
    phone_number: string;
    email?: string;
    address_1: string;
    address_2?: string;
    postcode: string;
    city: string;
    subdivision_code?: string;
    country_code: string;
}

export interface SubmitItem {
    content: string;
    weight: number;
    length: number;
    width: number;
    height: number;
    currency_code: string;
    value: number;
    quantity: number;
}

export interface SubmitShipment {
    reference?: string;
    service_id: string;
    collection_date: string;
    weight: number;
    length: number;
    width: number;
    height: number;
    item: SubmitItem[];
    sender: SubmitParty;
    receiver: SubmitParty;
    feature: { sms_tracking: boolean; email_tracking: boolean; whatsapp_tracking: boolean };
}

export interface SubmittedShipment {
    status: string;
    shipment_number?: string;
    courier?: string;
    courier_service?: string | null;
    awb_number?: string | null;
    awb_url?: string | null;
    awb_urls_by_format?: Partial<Record<LabelSize, string>>;
    tracking_url?: string | null;
    pricing_breakdown?: { total_paid_amount?: string };
    reference?: string;
    errors?: string[];
}

export interface EasyParcelShipmentDetails {
    shipment_number: string;
    order_number?: string;
    shipment_details?: {
        shipment_status_code?: number | string | null;
        shipment_status?: string | null;
        awb_number?: string | null;
        awb_url?: string | null;
        tracking_url?: string | null;
    };
    courier?: { courier_name?: string; service_id?: string; service_types?: string };
}

export interface EasyParcelTrackingResult {
    status: string;
    awb_number: string;
    shipment_number?: string;
    latest_shipment_status_code?: number | string;
    latest_tracking_status?: string;
    latest_event_date?: string;
    status_log?: Array<{ event_date?: string; shipment_status_code?: number | string; tracking_status?: string; location?: string | null }>;
    message?: string;
}

export class EasyParcelApi {
    constructor(private readonly options: EasyParcelApiOptions) {}

    async quote(shipments: QuotationShipment[]): Promise<EasyParcelQuotationResult[]> {
        const envelope = await this.post<EasyParcelQuotationResult[]>('shipment/quotations', { shipment: shipments });
        return envelope.data ?? [];
    }

    /** Debits the prepaid wallet. Each shipment succeeds or fails on its own. */
    async submitOrders(shipments: SubmitShipment[]): Promise<SubmittedShipment[]> {
        const envelope = await this.post<Array<{ shipments?: SubmittedShipment[]; errors?: string[] }>>('shipment/submit_orders', {
            shipment: shipments,
        });
        return (envelope.data ?? []).flatMap(order => order.shipments ?? []);
    }

    async shipmentDetails(shipmentNumber: string): Promise<EasyParcelShipmentDetails | undefined> {
        const envelope = await this.post<EasyParcelShipmentDetails[]>('shipment/details', { shipment_number: shipmentNumber }, [404]);
        return envelope.data?.[0];
    }

    /** Up to 50 AWBs per call (the CLI's limit; the 2026-09 docs say 100). */
    async trackingStatus(awbNumbers: string[]): Promise<EasyParcelTrackingResult[]> {
        const results: EasyParcelTrackingResult[] = [];
        for (let i = 0; i < awbNumbers.length; i += 50) {
            const envelope = await this.post<{ results?: EasyParcelTrackingResult[] }>('shipment/tracking_status', {
                awb_numbers: awbNumbers.slice(i, i + 50),
            });
            results.push(...(envelope.data?.results ?? []));
        }
        return results;
    }

    /** Only before the courier has processed the shipment. */
    async cancel(shipmentNumber: string, remark: string): Promise<{ status: string; message?: string }> {
        const envelope = await this.post<Array<{ status: string; message?: string; shipment_number?: string }>>('shipment/cancel', {
            cancel_list: [{ shipment_number: shipmentNumber, remark }],
        });
        return envelope.data?.find(r => r.shipment_number === shipmentNumber) ?? envelope.data?.[0] ?? { status: 'error', message: envelope.message };
    }

    private async post<T>(path: string, body: unknown, allowedStatuses: number[] = []): Promise<EasyParcelEnvelope<T>> {
        const url = `${this.options.baseUrl.replace(/\/$/, '')}/open_api/${this.options.apiVersion}/${path}`;
        const send = async (token: string) =>
            httpRequest<EasyParcelEnvelope<T>>(this.options.fetch ?? fetch, url, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify(body),
                timeoutMs: this.options.timeoutMs,
            });
        let response = await send(await this.options.accessToken(false));
        if (response.status === 401) response = await send(await this.options.accessToken(true));
        const status = typeof response.json?.status_code === 'number' ? response.json.status_code : response.status;
        if ((!response.ok || status >= 400) && !allowedStatuses.includes(status)) throw easyParcelError(response, path);
        return response.json ?? {};
    }
}

function easyParcelError(response: HttpResponse<EasyParcelEnvelope<unknown>>, path: string): ProviderError {
    if (response.status === 401) {
        return new ProviderError('easyparcel', 'EasyParcel rejected the access token; reconnect the account (GET /delivery/easyparcel/connect).', 401);
    }
    const reason = response.json?.message ?? snippet(response.text);
    return new ProviderError('easyparcel', `EasyParcel ${path} failed: ${reason || `HTTP ${response.status}`}`, response.status);
}

// ── Mapping (pure) ───────────────────────────────────────────────────────

export function toSen(amount: number | string | null | undefined): number | undefined {
    if (amount == null || amount === '') return undefined;
    const value = typeof amount === 'number' ? amount : Number(amount);
    return Number.isFinite(value) ? Math.round(value * 100) : undefined;
}

/** EasyParcel takes kilograms and centimetres with two decimals. */
export function round2(value: number): number {
    return Math.round(value * 100) / 100;
}

export function matchesCollection(quotation: EasyParcelQuotation, collection: CollectionMethod): boolean {
    if (collection === 'pickup') return quotation.courier.is_pickup !== false;
    if (collection === 'dropoff') return quotation.courier.is_dropoff !== false;
    return true;
}

/**
 * Chooses a service from a quotation: "cheapest", an exact service id (EP-CS…), or a courier/service name
 * such as "J&T" or "Pos Laju" (the cheapest matching service). The error lists what was available.
 */
export function pickQuotation(
    quotations: EasyParcelQuotation[],
    choice: string | undefined,
    collection: CollectionMethod,
): { quotation: EasyParcelQuotation } | { error: string } {
    const wanted = (choice ?? '').trim();
    const usable = quotations.filter(q => matchesCollection(q, collection) && toSen(q.pricing?.total_amount) !== undefined);
    const byPrice = (list: EasyParcelQuotation[]) =>
        [...list].sort((a, b) => (toSen(a.pricing.total_amount) ?? 0) - (toSen(b.pricing.total_amount) ?? 0));
    const available = () =>
        byPrice(usable)
            .slice(0, 12)
            .map(q => `${q.courier.service_name} (${q.courier.service_id}) RM ${(toSen(q.pricing.total_amount)! / 100).toFixed(2)}`)
            .join('; ') || 'none';
    if (!usable.length) return { error: `EasyParcel has no ${collection === 'any' ? '' : `${collection} `}service for this parcel.` };
    if (!wanted || wanted.toLowerCase() === 'cheapest') return { quotation: byPrice(usable)[0] };
    const exact = quotations.find(q => q.courier.service_id.toLowerCase() === wanted.toLowerCase());
    if (exact) return { quotation: exact };
    if (/^EP-/i.test(wanted)) return { error: `EasyParcel service ${wanted} is not offered for this parcel. Available: ${available()}` };
    const needle = wanted.toLowerCase();
    const named = usable.filter(
        q => q.courier.courier_name.toLowerCase().includes(needle) || q.courier.service_name.toLowerCase().includes(needle),
    );
    if (named.length) return { quotation: byPrice(named)[0] };
    return { error: `No EasyParcel service matches "${wanted}". Available: ${available()}` };
}

/** The label in the requested size; links given without a size carry a `format` parameter that selects it. */
export function labelUrlFor(shipment: Pick<SubmittedShipment, 'awb_url' | 'awb_urls_by_format'>, size: LabelSize): string | undefined {
    const bySize = shipment.awb_urls_by_format?.[size];
    if (bySize) return bySize;
    return withLabelSize(shipment.awb_url, size);
}

export function withLabelSize(url: string | null | undefined, size: LabelSize): string | undefined {
    if (!url) return undefined;
    try {
        const parsed = new URL(url);
        if (parsed.searchParams.has('format')) parsed.searchParams.set('format', size);
        return parsed.toString();
    } catch {
        return url;
    }
}

/**
 * Tracking times come as ISO (UTC) or "YYYY-MM-DD HH:MM:SS". The docs say UTC; read them that way.
 * Only used for ordering and display, never for decisions.
 */
export function parseEasyParcelTime(value: string | null | undefined): Date | undefined {
    if (!value) return undefined;
    const plain = value.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/);
    const date = plain ? new Date(Date.UTC(+plain[1], +plain[2] - 1, +plain[3], +plain[4], +plain[5], +plain[6])) : new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
}
