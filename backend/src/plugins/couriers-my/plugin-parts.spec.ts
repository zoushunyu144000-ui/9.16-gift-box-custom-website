import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { describe, it } from 'node:test';
import { RequestContext } from '@vendure/core';
import { rawBodyMiddleware, RawBodyRequest } from './api/raw-body.middleware';
import { EasyParcelQuotationResult } from './clients/easyparcel';
import { EasyParcelRateService, easyParcelRateProvider } from './easyparcel-rate-provider';
import { manualCourierHandler, trackingLink } from './handlers/manual-courier.handler';
import { originAddress, PLACEHOLDER_ORIGIN, resolveOptions } from './options';
import { EasyParcelAuthService } from './services/easyparcel-auth.service';

describe('plugin options', () => {
    it('defaults to the Lalamove sandbox and builds URLs from the public URL', () => {
        const options = resolveOptions({ origin: PLACEHOLDER_ORIGIN, publicUrl: 'https://api.shop.my/' }, {});
        assert.equal(options.publicUrl, 'https://api.shop.my');
        assert.equal(options.lalamove.baseUrl, 'https://rest.sandbox.lalamove.com');
        assert.equal(options.lalamove.configured, false);
        assert.equal(options.easyParcel.baseUrl, 'https://api.easyparcel.com');
        assert.equal(options.easyParcel.apiVersion, '2026-09');
        assert.equal(options.easyParcel.defaultLabelSize, 'A6');
        assert.equal(options.reconcileSchedule, '*/30 * * * *');
    });

    it('uses production only when sandbox is false, and env overrides for tests', () => {
        const live = resolveOptions({ origin: PLACEHOLDER_ORIGIN, lalamove: { apiKey: 'pk_prod_x', apiSecret: 's', sandbox: false } }, {});
        assert.equal(live.lalamove.baseUrl, 'https://rest.lalamove.com');
        assert.ok(live.lalamove.configured);
        const mocked = resolveOptions({ origin: PLACEHOLDER_ORIGIN }, { LALAMOVE_BASE_URL: 'http://127.0.0.1:1', EASYPARCEL_BASE_URL: 'http://127.0.0.1:2', VENDURE_SERVER_PORT: '3013' });
        assert.equal(mocked.lalamove.baseUrl, 'http://127.0.0.1:1');
        assert.equal(mocked.easyParcel.baseUrl, 'http://127.0.0.1:2');
        assert.equal(mocked.publicUrl, 'http://localhost:3013');
    });

    it('derives a stable webhook secret per client secret and server', () => {
        const a = resolveOptions({ origin: PLACEHOLDER_ORIGIN, publicUrl: 'https://a.my', easyParcel: { clientId: 'c', clientSecret: 's' } }, {});
        const again = resolveOptions({ origin: PLACEHOLDER_ORIGIN, publicUrl: 'https://a.my', easyParcel: { clientId: 'c', clientSecret: 's' } }, {});
        const otherShop = resolveOptions({ origin: PLACEHOLDER_ORIGIN, publicUrl: 'https://b.my', easyParcel: { clientId: 'c', clientSecret: 's' } }, {});
        assert.match(a.easyParcel.webhookSecret, /^[0-9a-f]{40}$/);
        assert.equal(a.easyParcel.webhookSecret, again.easyParcel.webhookSecret);
        assert.notEqual(a.easyParcel.webhookSecret, otherShop.easyParcel.webhookSecret);
        assert.equal(resolveOptions({ origin: PLACEHOLDER_ORIGIN }, {}).easyParcel.webhookSecret, '');
    });

    it('writes the origin state out in full for couriers', () => {
        const options = resolveOptions({ origin: PLACEHOLDER_ORIGIN }, {});
        assert.equal(originAddress(options.origin).province, 'Kuala Lumpur');
    });
});

describe('manual courier', () => {
    it('only accepts http(s) tracking links', () => {
        assert.equal(trackingLink('https://gdexpress.com/tracking/?consignmentno=1'), 'https://gdexpress.com/tracking/?consignmentno=1');
        assert.equal(trackingLink(' '), null);
        assert.throws(() => trackingLink('javascript:alert(1)'), /https/);
        assert.throws(() => trackingLink('gdex.com/123'), /https/);
    });

    it('creates a booked fulfillment with the courier as method', async () => {
        const result = await manualCourierHandler.createFulfillment(RequestContext.empty(), [], [], [
            { name: 'courierName', value: 'GDex' },
            { name: 'trackingNumber', value: ' GDX123 ' },
            { name: 'trackingUrl', value: 'https://gdexpress.com/t/GDX123' },
        ]);
        assert.equal(result.method, 'GDex');
        assert.equal(result.trackingCode, 'GDX123');
        assert.equal(result.customFields?.provider, 'manual');
        assert.equal(result.customFields?.shipmentStatus, 'booked');
        await assert.rejects(async () =>
            manualCourierHandler.createFulfillment(RequestContext.empty(), [], [], [{ name: 'courierName', value: 'GDex' }]),
        );
    });
});

function fakeRequest(method: string, chunks: string[]) {
    const req = new EventEmitter() as unknown as RawBodyRequest & { resume(): void };
    (req as { method?: string }).method = method;
    req.resume = () => undefined;
    const res = { statusCode: 200, headers: {} as Record<string, string>, body: '', setHeader(k: string, v: string) { this.headers[k] = v; }, end(b: string) { this.body = b; } };
    setImmediate(() => {
        for (const chunk of chunks) req.emit('data', Buffer.from(chunk));
        req.emit('end');
    });
    return { req, res };
}

describe('webhook raw body', () => {
    it('keeps the exact bytes and parses JSON leniently', async () => {
        const { req, res } = fakeRequest('POST', ['{"a": 1,', ' "b":"x"}']);
        await new Promise<void>(resolve => rawBodyMiddleware()(req, res as never, () => resolve()));
        assert.equal(req.rawBody?.toString(), '{"a": 1, "b":"x"}');
        assert.deepEqual(req.body, { a: 1, b: 'x' });

        const broken = fakeRequest('POST', ['{"topic": "x", "status_log":[ "0":{} ]}']);
        await new Promise<void>(resolve => rawBodyMiddleware()(broken.req, broken.res as never, () => resolve()));
        assert.deepEqual(broken.req.body, {});
        assert.ok(broken.req.rawBody?.length);
    });

    it('refuses bodies over the limit', async () => {
        const { req, res } = fakeRequest('POST', ['x'.repeat(10), 'y'.repeat(10)]);
        let calledNext = false;
        rawBodyMiddleware(15)(req, res as never, () => (calledNext = true));
        await new Promise(resolve => setTimeout(resolve, 20));
        assert.equal(res.statusCode, 413);
        assert.ok(!calledNext);
    });
});

describe('EasyParcel rate provider', () => {
    const quotation = (id: string, total: number, pickup: boolean) => ({
        courier: { service_id: id, service_name: `${id} service`, courier_name: `${id} courier`, is_pickup: pickup, is_dropoff: !pickup },
        pricing: { total_amount: total },
    });
    function service(quote: () => Promise<EasyParcelQuotationResult[]>, connected = true) {
        let calls = 0;
        const auth = {
            configured: true,
            connectionChannelId: async () => {
                if (!connected) throw new Error('not connected');
                return '1';
            },
            api: () => ({
                quote: async () => {
                    calls++;
                    return quote();
                },
            }),
        } as unknown as EasyParcelAuthService;
        const options = resolveOptions({ origin: PLACEHOLDER_ORIGIN, easyParcel: { clientId: 'c', clientSecret: 's' } }, {});
        return { rates: new EasyParcelRateService(auth, options), calls: () => calls };
    }
    const ctx = RequestContext.empty();
    const query = { fromPostcode: '50450', toPostcode: '11950', toState: 'Penang', weightKg: 2 };

    it('returns pickup services cheapest first, in sen, and caches identical queries', async () => {
        const { rates, calls } = service(async () => [
            { status: 'success', quotations: [quotation('EP-B', 12.5, true), quotation('EP-A', 9.8, true), quotation('EP-C', 5, false)] },
        ]);
        const first = await rates.getRates(ctx, query);
        assert.deepEqual(first, [
            { courier: 'EP-A courier', service: 'EP-A service', serviceId: 'EP-A', priceSen: 980 },
            { courier: 'EP-B courier', service: 'EP-B service', serviceId: 'EP-B', priceSen: 1250 },
        ]);
        await rates.getRates(ctx, query);
        assert.equal(calls(), 1);
    });

    it('returns [] instead of failing checkout', async () => {
        assert.deepEqual(await service(async () => { throw new Error('timeout'); }).rates.getRates(ctx, query), []);
        assert.deepEqual(await service(async () => [], false).rates.getRates(ctx, query), []);
        assert.deepEqual(await service(async () => []).rates.getRates(ctx, { ...query, toPostcode: '99999', toState: 'Nowhere' }), []);
        assert.deepEqual(await service(async () => []).rates.getRates(ctx, { ...query, weightKg: 0 }), []);
    });

    it('matches delivery-my\'s LiveRateProvider shape', () => {
        assert.equal(typeof easyParcelRateProvider.getRates, 'function');
        assert.equal(easyParcelRateProvider.getRates.length, 2);
    });
});
