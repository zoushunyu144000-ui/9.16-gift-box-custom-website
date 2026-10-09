import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { describe, it } from 'node:test';
import {
    buildPlaceOrderRequest,
    buildQuotationRequest,
    LalamoveClient,
    lalamoveAmountToSen,
    lalamoveAuthorization,
    lalamoveSignature,
    LalamoveQuotation,
} from './clients/lalamove';
import { parseLalamoveTime, topLevelProperties, verifyLalamoveWebhook } from './clients/lalamove-webhook';
import { ProviderError } from './clients/http';
import { hmacSha256Hex } from './crypto';

describe('Lalamove request signature', () => {
    it('uses standard HMAC-SHA256 hex (RFC 4231 test case 2)', () => {
        assert.equal(
            hmacSha256Hex('Jefe', 'what do ya want for nothing?'),
            '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843',
        );
    });

    // The docs' example elides the body ("{...}"), so these vectors were computed separately with Python's hmac module.
    it('signs `${timestamp}\\r\\n${METHOD}\\r\\n${path}\\r\\n\\r\\n${body}` with the secret', () => {
        assert.equal(
            lalamoveSignature('sk_test_Lalamove', '1545880607433', 'POST', '/v3/quotations', '{"data":{"serviceType":"MOTORCYCLE"}}'),
            'e94177c983f8cae86e68c33d85274171927399df32a3f00677183555b737b030',
        );
        assert.equal(
            lalamoveSignature('sk_test_Lalamove', '1545880607433', 'GET', '/v3/orders/3463513590991397204', ''),
            '5dc320b0a481ff4a2fbcd88d287471124e59d17065ee29896f9e97d070e59cce',
        );
    });

    it('builds the Authorization header as hmac KEY:TIMESTAMP:SIGNATURE', () => {
        assert.equal(
            lalamoveAuthorization('pk_test_key', 'sk_test_Lalamove', '1545880607433', 'POST', '/v3/quotations', '{"data":{"serviceType":"MOTORCYCLE"}}'),
            'hmac pk_test_key:1545880607433:e94177c983f8cae86e68c33d85274171927399df32a3f00677183555b737b030',
        );
    });
});

/** A fetch that records requests and answers from a script, checking each signature as Lalamove would. */
function mockLalamove(responses: Array<{ status: number; body?: unknown }>) {
    const calls: Array<{ url: string; method: string; headers: Record<string, string>; body: string }> = [];
    const fetchFn = async (url: string, init?: RequestInit) => {
        const headers = init?.headers as Record<string, string>;
        const body = (init?.body as string) ?? '';
        calls.push({ url, method: init?.method ?? 'GET', headers, body });
        const [, key, timestamp, signature] = headers.Authorization.match(/^hmac ([^:]+):(\d+):([0-9a-f]{64})$/) ?? [];
        const path = new URL(url).pathname;
        const expected = createHmac('sha256', 'sk_test_secret').update(`${timestamp}\r\n${init?.method}\r\n${path}\r\n\r\n${body}`).digest('hex');
        if (key !== 'pk_test_key' || signature !== expected) return new Response(JSON.stringify({ message: 'ERR_UNAUTHORIZED' }), { status: 401 });
        const next = responses.shift() ?? { status: 500 };
        return new Response(next.body === undefined ? null : JSON.stringify(next.body), { status: next.status });
    };
    return { calls, fetchFn };
}

const quotation: LalamoveQuotation = {
    quotationId: '1514140994227007571',
    stops: [
        { stopId: '1514140995971838016', coordinates: { lat: '3.1478', lng: '101.713' }, address: 'Shop' },
        { stopId: '1514140995971838017', coordinates: { lat: '3.1', lng: '101.6' }, address: 'Recipient' },
    ],
    priceBreakdown: { total: '25.5', currency: 'MYR' },
};

describe('Lalamove request bodies', () => {
    it('quotes from the shop to the recipient with string coordinates', () => {
        const body = buildQuotationRequest({
            serviceType: 'MOTORCYCLE',
            language: 'en_MY',
            pickup: { lat: 3.1478, lng: 101.713, address: 'Jalan Ampang, 50450 Kuala Lumpur' },
            dropoff: { lat: 3.0738012345678, lng: 101.5183, address: '1 Jalan SS2/24, 47300 Petaling Jaya, Selangor, Malaysia' },
        });
        assert.deepEqual(body, {
            serviceType: 'MOTORCYCLE',
            language: 'en_MY',
            stops: [
                { coordinates: { lat: '3.1478', lng: '101.713' }, address: 'Jalan Ampang, 50450 Kuala Lumpur' },
                { coordinates: { lat: '3.0738012', lng: '101.5183' }, address: '1 Jalan SS2/24, 47300 Petaling Jaya, Selangor, Malaysia' },
            ],
        });
        const scheduled = buildQuotationRequest({
            serviceType: 'MOTORCYCLE',
            language: 'en_MY',
            pickup: { lat: 1, lng: 2, address: 'a' },
            dropoff: { lat: 1, lng: 2, address: 'b' },
            scheduleAt: new Date('2026-10-10T02:00:00Z'),
        });
        assert.equal(scheduled.scheduleAt, '2026-10-10T02:00:00.000Z');
    });

    it('places the order with the quotation stop ids, contacts and proof of delivery', () => {
        const body = buildPlaceOrderRequest(quotation, {
            sender: { name: 'Moire Co.', phone: '+60312345678' },
            recipient: { name: 'Aisyah', phone: '+60123456789', remarks: 'Order ABC123\r\nLevel 3' },
            proofOfDelivery: true,
            metadata: { orderCode: 'ABC123' },
        });
        assert.deepEqual(body, {
            quotationId: '1514140994227007571',
            sender: { stopId: '1514140995971838016', name: 'Moire Co.', phone: '+60312345678' },
            recipients: [{ stopId: '1514140995971838017', name: 'Aisyah', phone: '+60123456789', remarks: 'Order ABC123\r\nLevel 3' }],
            isPODEnabled: true,
            metadata: { orderCode: 'ABC123' },
        });
    });

    it('sends {"data": …} bodies with signed headers, the MY market and a request id', async () => {
        const { calls, fetchFn } = mockLalamove([
            { status: 201, body: { data: quotation } },
            { status: 201, body: { data: { orderId: 3463513590991397, status: 'ASSIGNING_DRIVER', shareLink: 'https://share' } } },
        ]);
        const client = new LalamoveClient({ apiKey: 'pk_test_key', apiSecret: 'sk_test_secret', baseUrl: 'https://rest.sandbox.lalamove.com', fetch: fetchFn });
        const q = await client.createQuotation(buildQuotationRequest({
            serviceType: 'CAR',
            language: 'en_MY',
            pickup: { lat: 3.1478, lng: 101.713, address: 'a' },
            dropoff: { lat: 3.1, lng: 101.6, address: 'b' },
        }));
        assert.equal(q.quotationId, '1514140994227007571');
        const order = await client.placeOrder(buildPlaceOrderRequest(q, { sender: { name: 's', phone: '+60312345678' }, recipient: { name: 'r', phone: '+60123456789' }, proofOfDelivery: false }));
        assert.equal(typeof order.orderId, 'string');

        assert.equal(calls[0].url, 'https://rest.sandbox.lalamove.com/v3/quotations');
        assert.equal(calls[0].headers.Market, 'MY');
        assert.match(calls[0].headers['Request-ID'], /^[0-9a-f-]{36}$/);
        assert.equal(JSON.parse(calls[0].body).data.serviceType, 'CAR');
        assert.equal(calls[1].url, 'https://rest.sandbox.lalamove.com/v3/orders');
        assert.equal(JSON.parse(calls[1].body).data.quotationId, '1514140994227007571');
    });

    it('signs GET and DELETE with an empty body', async () => {
        const { calls, fetchFn } = mockLalamove([
            { status: 200, body: { data: { orderId: '3463513590991397204', status: 'PICKED_UP' } } },
            { status: 204 },
        ]);
        const client = new LalamoveClient({ apiKey: 'pk_test_key', apiSecret: 'sk_test_secret', baseUrl: 'https://rest.lalamove.com/', fetch: fetchFn });
        assert.equal((await client.getOrder('3463513590991397204')).status, 'PICKED_UP');
        await client.cancelOrder('3463513590991397204');
        assert.equal(calls[0].body, '');
        assert.equal(calls[1].method, 'DELETE');
        assert.equal(calls[1].url, 'https://rest.lalamove.com/v3/orders/3463513590991397204');
    });

    it('turns Lalamove errors into messages staff can act on', async () => {
        const { fetchFn } = mockLalamove([{ status: 422, body: { errors: [{ id: 'ERR_OUT_OF_SERVICE_AREA', message: 'Out of service area' }] } }]);
        const client = new LalamoveClient({ apiKey: 'pk_test_key', apiSecret: 'sk_test_secret', baseUrl: 'https://x', fetch: fetchFn });
        await assert.rejects(
            () => client.createQuotation(buildQuotationRequest({ serviceType: 'CAR', language: 'en_MY', pickup: { lat: 1, lng: 1, address: 'a' }, dropoff: { lat: 1, lng: 1, address: 'b' } })),
            (error: ProviderError) => error.code === 'ERR_OUT_OF_SERVICE_AREA' && /service area/.test(error.message),
        );
    });

    it('reads Malaysian one-decimal prices as sen', () => {
        assert.equal(lalamoveAmountToSen('50.5'), 5050);
        assert.equal(lalamoveAmountToSen('130'), 13000);
        assert.equal(lalamoveAmountToSen(undefined), undefined);
    });
});

// ORDER_STATUS_CHANGED: COMPLETED from the webhook spec (v1.5), signed with a test secret for path /delivery/lalamove/webhook.
const completedData = {
    order: {
        orderId: '3463513590991397204',
        scheduleAt: '2026-04-01T15:10.00Z',
        shareLink: 'https://share.sandbox.lalamove.com?HK100260401151036148920010088740225&lang=zh_HK&sign=e38899e5940473bf167c6a13c92ef90a&source=api_wrapper',
        market: 'HK_HKG',
        createdAt: '2026-04-01T15:10.00Z',
        driverId: '79973',
        previousStatus: 'PICKED_UP',
        status: 'COMPLETED',
    },
    updatedAt: '2026-04-01T15:17.00Z',
};
const keys = { apiKey: 'pk_test_69d70a31a0e00e80d02050750984a7ee', apiSecret: 'sk_test_webhook_secret', paths: ['/delivery/lalamove/webhook'] };
const envelope = (data: unknown, signature: string, extra: Record<string, unknown> = {}) => ({
    apiKey: keys.apiKey,
    timestamp: 1775027867,
    signature,
    eventId: 'A784FE12-D336-4776-ABDB-CFEE9A9DB995',
    eventType: 'ORDER_STATUS_CHANGED',
    eventVersion: 'v3',
    data,
    ...extra,
});
// Computed with Python: hmac(secret, "1775027867\r\nPOST\r\n/delivery/lalamove/webhook\r\n\r\n" + compact JSON of data).
const COMPLETED_SIGNATURE = '37097368726dcf825dcafb550ab79a23de1ac8196de43e1576996dce9f8459eb';

describe('Lalamove webhook verification', () => {
    it('accepts the signed event as sent (compact JSON)', () => {
        const result = verifyLalamoveWebhook(JSON.stringify(envelope(completedData, COMPLETED_SIGNATURE)), keys);
        assert.equal(result.kind, 'event');
        if (result.kind !== 'event') return;
        assert.equal(result.event.orderId, '3463513590991397204');
        assert.equal(result.event.status, 'COMPLETED');
        assert.equal(result.event.eventId, 'A784FE12-D336-4776-ABDB-CFEE9A9DB995');
        assert.equal(result.event.occurredAt?.toISOString(), '2026-04-01T15:17:00.000Z');
    });

    it('accepts a pretty-printed body by re-serialising data like the spec sample code', () => {
        const result = verifyLalamoveWebhook(JSON.stringify(envelope(completedData, COMPLETED_SIGNATURE), null, 2), keys);
        assert.equal(result.kind, 'event');
    });

    it('accepts the path behind a proxy prefix when that path is configured', () => {
        const result = verifyLalamoveWebhook(JSON.stringify(envelope(completedData, COMPLETED_SIGNATURE)), { ...keys, paths: ['/backend/delivery/lalamove/webhook', '/delivery/lalamove/webhook'] });
        assert.equal(result.kind, 'event');
    });

    it('rejects a wrong signature, secret, path or API key', () => {
        const body = JSON.stringify(envelope(completedData, COMPLETED_SIGNATURE));
        assert.equal(verifyLalamoveWebhook(JSON.stringify(envelope(completedData, '0'.repeat(64))), keys).kind, 'rejected');
        assert.equal(verifyLalamoveWebhook(body, { ...keys, apiSecret: 'other' }).kind, 'rejected');
        assert.equal(verifyLalamoveWebhook(body, { ...keys, paths: ['/other'] }).kind, 'rejected');
        assert.equal(verifyLalamoveWebhook(body, { ...keys, apiKey: 'pk_test_other' }).kind, 'rejected');
    });

    it('rejects edited data', () => {
        const tampered = { ...completedData, order: { ...completedData.order, orderId: '1111111111111111111' } };
        assert.equal(verifyLalamoveWebhook(JSON.stringify(envelope(tampered, COMPLETED_SIGNATURE)), keys).kind, 'rejected');
    });

    it('rejects a second, unsigned data field appended to a signed body', () => {
        const signed = JSON.stringify(envelope(completedData, COMPLETED_SIGNATURE));
        const smuggled = `${signed.slice(0, -1)},"data":${JSON.stringify({ order: { orderId: '999', status: 'COMPLETED' } })}}`;
        assert.equal(verifyLalamoveWebhook(smuggled, keys).kind, 'rejected');
    });

    it('answers pings: an empty body or a body without an event', () => {
        assert.equal(verifyLalamoveWebhook('', keys).kind, 'ping');
        assert.equal(verifyLalamoveWebhook('{}', keys).kind, 'ping');
        assert.equal(verifyLalamoveWebhook('not json', keys).kind, 'ping');
        assert.equal(verifyLalamoveWebhook(JSON.stringify({ eventType: 'ORDER_STATUS_CHANGED', data: {} }), keys).kind, 'rejected');
    });

    it('reads ORDER_REPLACED with the previous and new order ids', () => {
        const data = { order: { orderId: '3463513590991397328' }, prevOrderId: '3463513590991397305', updatedAt: '2026-04-01T15:39.00Z' };
        const timestamp = 1775029147;
        const signature = createHmac('sha256', keys.apiSecret)
            .update(`${timestamp}\r\nPOST\r\n/delivery/lalamove/webhook\r\n\r\n${JSON.stringify(data)}`)
            .digest('hex');
        const result = verifyLalamoveWebhook(JSON.stringify(envelope(data, signature, { timestamp, eventType: 'ORDER_REPLACED' })), keys);
        assert.equal(result.kind, 'event');
        if (result.kind !== 'event') return;
        assert.equal(result.event.eventType, 'ORDER_REPLACED');
        assert.equal(result.event.prevOrderId, '3463513590991397305');
        assert.equal(result.event.orderId, '3463513590991397328');
    });
});

describe('Lalamove webhook helpers', () => {
    it('parses the ISO times and the HH:MM.ss form used in the spec samples', () => {
        assert.equal(parseLalamoveTime('2026-04-01T15:17.00Z')?.toISOString(), '2026-04-01T15:17:00.000Z');
        assert.equal(parseLalamoveTime('2022-04-22T11:09.00Z')?.toISOString(), '2022-04-22T11:09:00.000Z');
        assert.equal(parseLalamoveTime('2026-04-01T15:17:42.123Z')?.toISOString(), '2026-04-01T15:17:42.123Z');
        assert.equal(parseLalamoveTime('yesterday'), undefined);
    });

    it('finds the exact text of top-level properties, including nested strings with braces', () => {
        const text = '{ "a" : 1, "data":{"x":"}{\\"","y":[1,{"z":2}]} ,"b":"c"}';
        const properties = topLevelProperties(text);
        assert.equal(properties?.get('data'), '{"x":"}{\\"","y":[1,{"z":2}]}');
        assert.equal(properties?.get('a'), '1');
        assert.equal(properties?.get('b'), '"c"');
        assert.equal(topLevelProperties('{"a":1,"a":2}'), undefined);
        assert.equal(topLevelProperties('[1]'), undefined);
    });
});
