import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { AddressInfo } from 'node:net';
import { describe, it } from 'node:test';
import { formatMoney, itemsAddingUpTo, malaysianPhone, truncate } from './format';
import { gatewayHttp, headerValue, normaliseBaseUrl, requestJson, summariseErrorBody } from './http';
import { GatewayConfigError, GatewayError } from './types';

describe('gateway requests', () => {
    it('gives up after the timeout with an error worth retrying', async () => {
        const server = createServer(() => undefined).listen(0, '127.0.0.1');
        await new Promise(resolve => server.once('listening', resolve));
        const { port } = server.address() as AddressInfo;
        try {
            await assert.rejects(
                requestJson('CHIP', gatewayHttp({ timeoutMs: 200 }), new URL(`http://127.0.0.1:${port}/`), { method: 'GET', headers: {} }),
                (error: GatewayError) => error instanceof GatewayError && error.retryable && /didn't answer within/.test(error.message),
            );
        } finally {
            server.closeAllConnections();
            server.close();
        }
    });

    it('treats a reply that is not JSON, or a 5xx, as worth retrying and a 4xx as final', async () => {
        const reply = (status: number, text: string) => gatewayHttp({ fetch: async () => new Response(text, { status }) });
        const url = new URL('https://gate.example.com/');
        await assert.rejects(requestJson('CHIP', reply(200, '<html>maintenance</html>'), url, { method: 'GET', headers: {} }), (e: GatewayError) => e.retryable);
        await assert.rejects(requestJson('CHIP', reply(503, 'down'), url, { method: 'GET', headers: {} }), (e: GatewayError) => e.retryable && e.status === 503);
        await assert.rejects(requestJson('CHIP', reply(429, '{}'), url, { method: 'GET', headers: {} }), (e: GatewayError) => e.retryable);
        await assert.rejects(requestJson('CHIP', reply(401, '{}'), url, { method: 'GET', headers: {} }), (e: GatewayError) => !e.retryable && e.status === 401);
    });

    it('does not follow redirects, so credentials stay with the gateway', async () => {
        let seen: RequestInit | undefined;
        const http = gatewayHttp({
            fetch: async (_url, init) => {
                seen = init;
                return new Response('{}');
            },
        });
        await requestJson('Billplz', http, new URL('https://www.billplz.com/api/v3/bills'), { method: 'GET', headers: { authorization: 'Basic x' } });
        assert.equal(seen?.redirect, 'error');
        assert.equal((seen?.headers as Record<string, string>).accept, 'application/json');
    });

    it('summarises CHIP and Billplz error replies', () => {
        assert.equal(summariseErrorBody({ __all__: { message: 'Invalid brand', code: 'invalid_brand' } }, ''), 'Invalid brand (invalid_brand)');
        assert.equal(
            summariseErrorBody({ purchase: { products: [{ price: [{ message: 'Must be at least 0.', code: 'min_value' }] }] } }, ''),
            'purchase.products.price: Must be at least 0. (min_value)',
        );
        assert.equal(summariseErrorBody({ error: { type: 'RateLimit', message: ['Too many requests'] } }, ''), 'Too many requests (RateLimit)');
        assert.equal(summariseErrorBody(undefined, '<h1>Bad Gateway</h1>'), 'Bad Gateway');
        assert.ok(summariseErrorBody(undefined, 'x'.repeat(1000)).length <= 300);
    });

    it('checks API addresses and finds headers in any case', () => {
        assert.equal(normaliseBaseUrl('CHIP', undefined, 'https://gate.chip-in.asia/api/v1').href, 'https://gate.chip-in.asia/api/v1/');
        assert.equal(normaliseBaseUrl('CHIP', '  ', 'https://gate.chip-in.asia/api/v1/').href, 'https://gate.chip-in.asia/api/v1/');
        assert.throws(() => normaliseBaseUrl('CHIP', 'https://user:pw@gate.example.com/', 'https://x/'), GatewayConfigError);
        assert.throws(() => normaliseBaseUrl('CHIP', 'https://gate.example.com/?key=1', 'https://x/'), GatewayConfigError);
        assert.equal(headerValue({ 'X-Signature': ['a', 'b'] }, 'x-signature'), 'a');
        assert.equal(headerValue({}, 'x-signature'), undefined);
    });
});

describe('payment formatting', () => {
    it('reads Malaysian phone numbers written in the usual ways', () => {
        assert.deepEqual(malaysianPhone('012-345 6789'), { e164: '+60123456789', national: '123456789' });
        assert.deepEqual(malaysianPhone('+60 11-2345 6789'), { e164: '+601123456789', national: '1123456789' });
        assert.deepEqual(malaysianPhone('60312345678'), { e164: '+60312345678', national: '312345678' });
        assert.deepEqual(malaysianPhone('(088) 123 456'), { e164: '+6088123456', national: '88123456' });
        assert.equal(malaysianPhone('+65 9123 4567'), undefined);
        assert.equal(malaysianPhone('0012345678'), undefined);
        assert.equal(malaysianPhone(''), undefined);
        assert.equal(malaysianPhone(null), undefined);
    });

    it('uses line items only when they add up to the amount', () => {
        const items = [
            { name: 'Box', unitPrice: 18800, quantity: 2 },
            { name: 'Delivery', unitPrice: 2000, quantity: 1 },
        ];
        assert.equal(itemsAddingUpTo(items, 39600), items);
        assert.equal(itemsAddingUpTo(items, 39601), undefined);
        assert.equal(itemsAddingUpTo([{ name: 'Discount', unitPrice: -100, quantity: 1 }], -100), undefined);
        assert.equal(itemsAddingUpTo([{ name: ' ', unitPrice: 100, quantity: 1 }], 100), undefined);
        assert.equal(itemsAddingUpTo([], 0), undefined);
    });

    it('truncates and formats money', () => {
        assert.equal(truncate('  New   Year  Box ', 50), 'New Year Box');
        assert.equal(truncate('abcdefghij', 5), 'abcd…');
        assert.equal(formatMoney(18800), 'RM 188.00');
        assert.equal(formatMoney(5, 'SGD'), 'SGD 0.05');
    });
});
