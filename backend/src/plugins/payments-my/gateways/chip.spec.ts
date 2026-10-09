import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, it } from 'node:test';
import { ChipClient, chipCallbackId, chipCallbackUrlProblem, ChipKeyCache, chipPaymentStatus, chipState, parseChipMethods } from './chip';
import { CallbackVerificationError, CheckoutRequest, GatewayConfigError, GatewayError } from './types';

type Reply = { status?: number; body?: unknown; text?: string };
type Call = { url: URL; method: string; headers: Record<string, string>; body?: string };

/** Routes "METHOD /path" to canned replies and records each call. */
function stubFetch(routes: Record<string, (call: Call) => Reply>) {
    const calls: Call[] = [];
    const fetch = async (url: string, init: RequestInit) => {
        const call: Call = {
            url: new URL(url),
            method: init.method ?? 'GET',
            headers: Object.fromEntries(Object.entries(init.headers as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v])),
            body: typeof init.body === 'string' ? init.body : undefined,
        };
        calls.push(call);
        const route = routes[`${call.method} ${call.url.pathname}`];
        if (!route) return new Response(JSON.stringify({ detail: 'Not found.' }), { status: 404 });
        const reply = route(call);
        return new Response(reply.text ?? JSON.stringify(reply.body ?? {}), { status: reply.status ?? 200 });
    };
    return { fetch, calls };
}

const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const PEM = keys.publicKey.export({ type: 'spki', format: 'pem' }).toString();
const signBody = (body: string, privateKey = keys.privateKey) => sign('sha256', Buffer.from(body), privateKey).toString('base64');

const request: CheckoutRequest = {
    reference: 'ABC123',
    amount: 40000,
    currencyCode: 'MYR',
    customer: { email: 'buyer@example.com', fullName: 'Sarah Tan', phone: '012-345 6789' },
    items: [
        { name: 'New Year Cookie Box', unitPrice: 18800, quantity: 2 },
        { name: 'Personalised name', unitPrice: 800, quantity: 3 },
    ],
    description: 'Order ABC123',
    returnUrl: 'https://shop.example.com/checkout/return?order=ABC123',
    cancelUrl: 'https://shop.example.com/checkout?order=ABC123',
    callbackUrl: 'https://api.example.com/payments/chip/callback?method=chip',
};

const client = (fetch: ReturnType<typeof stubFetch>['fetch'], extra: Partial<ConstructorParameters<typeof ChipClient>[0]> = {}) =>
    new ChipClient({ brandId: 'brand-1', secretKey: 'sk-test', baseUrl: 'http://127.0.0.1:9/api/v1', fetch, keyCache: new Map(), ...extra });

describe('CHIP: creating a purchase', () => {
    it('builds the body CHIP documents', () => {
        const body = client(stubFetch({}).fetch, { paymentMethodWhitelist: ['fpx', 'visa'] }).purchaseRequest(request);
        assert.equal(body.brand_id, 'brand-1');
        assert.deepEqual(body.client, { email: 'buyer@example.com', full_name: 'Sarah Tan', phone: '+60 123456789' });
        assert.deepEqual(body.purchase, {
            currency: 'MYR',
            products: [
                { name: 'New Year Cookie Box', price: 18800, quantity: '2' },
                { name: 'Personalised name', price: 800, quantity: '3' },
            ],
        });
        assert.equal(body.reference, 'ABC123');
        assert.equal(body.success_redirect, request.returnUrl);
        assert.equal(body.failure_redirect, request.returnUrl);
        assert.equal(body.cancel_redirect, request.cancelUrl);
        assert.equal(body.success_callback, request.callbackUrl);
        assert.deepEqual(body.payment_method_whitelist, ['fpx', 'visa']);
        assert.ok(body.creator_agent.length <= 32);
    });

    it('shows one line for the order when the items do not add up, and leaves out what it was not given', () => {
        const body = client(stubFetch({}).fetch).purchaseRequest({
            ...request,
            items: [{ name: 'Box', unitPrice: 100, quantity: 1 }],
            customer: { email: 'buyer@example.com', fullName: ' ', phone: '+44 20 7946 0000' },
            callbackUrl: undefined,
        });
        assert.deepEqual(body.purchase.products, [{ name: 'Order ABC123', price: 40000, quantity: '1' }]);
        assert.deepEqual(body.client, { email: 'buyer@example.com' });
        assert.equal('success_callback' in body, false);
        assert.equal('payment_method_whitelist' in body, false);
    });

    it('refuses an amount that is not a positive number of sen', () => {
        const c = client(stubFetch({}).fetch);
        assert.throws(() => c.purchaseRequest({ ...request, amount: 0 }), GatewayError);
        assert.throws(() => c.purchaseRequest({ ...request, amount: 12.5 }), GatewayError);
    });

    it('sends the secret key as a bearer token and returns the payment page with the hinted method selected', async () => {
        const { fetch, calls } = stubFetch({
            'POST /api/v1/purchases/': () => ({ status: 201, body: { id: 'p-1', status: 'created', checkout_url: 'https://gate.chip-in.asia/p/p-1/' } }),
        });
        const session = await client(fetch).createCheckout({ ...request, preferredMethod: 'fpx' });
        assert.deepEqual(session, { id: 'p-1', url: 'https://gate.chip-in.asia/p/p-1/?active=fpx' });
        assert.equal(calls[0].headers.authorization, 'Bearer sk-test');
        assert.equal(calls[0].headers['content-type'], 'application/json');
        assert.equal(JSON.parse(calls[0].body ?? '{}').reference, 'ABC123');
    });

    it('only hints at a method the whitelist allows', () => {
        const c = client(stubFetch({}).fetch, { paymentMethodWhitelist: ['fpx', 'razer_grabpay'] });
        assert.equal(c.checkoutUrl('https://gate.chip-in.asia/p/1/', 'ewallet'), 'https://gate.chip-in.asia/p/1/?active=razer_grabpay');
        assert.equal(c.checkoutUrl('https://gate.chip-in.asia/p/1/', 'card'), 'https://gate.chip-in.asia/p/1/');
        assert.equal(c.checkoutUrl('https://gate.chip-in.asia/p/1/'), 'https://gate.chip-in.asia/p/1/');
    });

    it('reports what CHIP refused, without the key', async () => {
        const { fetch } = stubFetch({
            'POST /api/v1/purchases/': () => ({ status: 400, body: { client: { email: [{ message: 'Enter a valid email address.', code: 'invalid' }] } } }),
        });
        await assert.rejects(client(fetch).createCheckout(request), (error: GatewayError) => {
            assert.ok(error instanceof GatewayError);
            assert.equal(error.status, 400);
            assert.equal(error.retryable, false);
            assert.match(error.message, /client\.email: Enter a valid email address\. \(invalid\)/);
            assert.doesNotMatch(error.message, /sk-test/);
            return true;
        });
    });
});

describe('CHIP: purchase status', () => {
    it('maps every purchase status', () => {
        for (const s of ['paid', 'cleared', 'settled']) assert.equal(chipState(s), 'paid');
        for (const s of ['created', 'sent', 'viewed', 'overdue', 'pending_execute', 'pending_charge', 'hold', 'pending_capture', 'preauthorized']) {
            assert.equal(chipState(s), 'pending');
        }
        for (const s of ['error', 'blocked']) assert.equal(chipState(s), 'failed');
        for (const s of ['cancelled', 'released', 'pending_release']) assert.equal(chipState(s), 'cancelled');
        assert.equal(chipState('expired'), 'expired');
        for (const s of ['pending_refund', 'refunded', 'chargeback']) assert.equal(chipState(s), 'refunded');
        assert.equal(chipState('something_new'), 'pending');
        assert.equal(chipState(undefined), 'pending');
    });

    it('reads amounts, reference, brand and method from GET /purchases/{id}/', async () => {
        const { fetch, calls } = stubFetch({
            'GET /api/v1/purchases/p-1/': () => ({
                body: {
                    id: 'p-1',
                    status: 'paid',
                    reference: 'ABC123',
                    brand_id: 'brand-1',
                    is_test: true,
                    purchase: { total: 40000, currency: 'MYR' },
                    payment: { amount: 40000, currency: 'MYR', paid_on: 1791500000 },
                    transaction_data: { payment_method: 'fpx' },
                },
            }),
        });
        const status = await client(fetch).getStatus('p-1');
        assert.equal(calls[0].headers.authorization, 'Bearer sk-test');
        assert.deepEqual(status, {
            id: 'p-1',
            reference: 'ABC123',
            state: 'paid',
            gatewayStatus: 'paid',
            amount: 40000,
            paidAmount: 40000,
            currencyCode: 'MYR',
            account: 'brand-1',
            method: 'fpx',
            paidAt: new Date(1791500000 * 1000),
            test: true,
        });
    });

    it('counts nothing as paid before payment', () => {
        const status = chipPaymentStatus({ id: 'p-2', status: 'viewed', purchase: { total: 500, currency: 'MYR' }, payment: null }, 'p-2');
        assert.equal(status.state, 'pending');
        assert.equal(status.paidAmount, 0);
        assert.equal(status.amount, 500);
    });
});

describe('CHIP: callbacks', () => {
    const body = JSON.stringify({ id: 'p-1', status: 'paid', reference: 'ABC123', brand_id: 'brand-1', event_type: 'purchase.paid' });
    const keyRoute = { 'GET /api/v1/public_key/': () => ({ body: PEM }) };

    it('accepts a callback signed with CHIP’s key and fetches the key once', async () => {
        const { fetch, calls } = stubFetch(keyRoute);
        const c = client(fetch);
        const verified = await c.verifyCallback(Buffer.from(body), { 'x-signature': signBody(body) });
        assert.deepEqual(verified, { id: 'p-1', reference: 'ABC123', paid: true, state: 'paid', gatewayStatus: 'paid' });
        await c.verifyCallback(body, { 'X-Signature': signBody(body) });
        assert.equal(calls.length, 1);
        assert.equal(calls[0].headers.authorization, 'Bearer sk-test');
    });

    it('rejects a changed body, a missing signature and a signature from another key', async () => {
        const c = client(stubFetch(keyRoute).fetch);
        const changed = body.replace('"paid"', '"paid" ').replace('ABC123', 'ABC124');
        await assert.rejects(c.verifyCallback(changed, { 'x-signature': signBody(body) }), CallbackVerificationError);
        await assert.rejects(c.verifyCallback(body, {}), CallbackVerificationError);
        const other = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
        await assert.rejects(c.verifyCallback(body, { 'x-signature': signBody(body, other) }), CallbackVerificationError);
        await assert.rejects(c.verifyCallback(body, { 'x-signature': 'not base64 at all' }), CallbackVerificationError);
    });

    it('rejects a purchase from another brand even when the signature is good', async () => {
        const c = client(stubFetch(keyRoute).fetch);
        const foreign = JSON.stringify({ id: 'p-9', status: 'paid', brand_id: 'brand-2' });
        await assert.rejects(c.verifyCallback(foreign, { 'x-signature': signBody(foreign) }), /another CHIP brand/);
    });

    it('fetches the key again when CHIP has rotated it, but not more than once every few minutes', async () => {
        const old = generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({ type: 'spki', format: 'pem' }).toString();
        let now = 1_000_000_000;
        const cache: ChipKeyCache = new Map();
        const { fetch, calls } = stubFetch(keyRoute);
        const c = client(fetch, { keyCache: cache, now: () => now });
        // Prime the cache with the old key, as if fetched an hour ago.
        const { fetch: oldFetch } = stubFetch({ 'GET /api/v1/public_key/': () => ({ body: old }) });
        const primed = client(oldFetch, { keyCache: cache, now: () => now - 60 * 60 * 1000 });
        await assert.rejects(primed.verifyCallback(body, { 'x-signature': signBody(body) }), CallbackVerificationError);

        const verified = await c.verifyCallback(body, { 'x-signature': signBody(body) });
        assert.equal(verified.paid, true);
        assert.equal(calls.length, 1);

        // A forged callback right after doesn't trigger another fetch.
        now += 60 * 1000;
        const forged = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
        await assert.rejects(c.verifyCallback(body, { 'x-signature': signBody(body, forged) }), CallbackVerificationError);
        assert.equal(calls.length, 1);
    });

    it('reads the purchase id from a body before checking it', () => {
        assert.equal(chipCallbackId(body), 'p-1');
        assert.equal(chipCallbackId('not json'), undefined);
        assert.equal(chipCallbackId('{"id": 5}'), undefined);
    });
});

describe('CHIP: refunds', () => {
    it('settles when CHIP returns the refund payment', async () => {
        const { fetch, calls } = stubFetch({ 'POST /api/v1/purchases/p-1/refund/': () => ({ body: { type: 'payment', id: 'r-1', payment: { amount: 1500 } } }) });
        assert.deepEqual(await client(fetch).refund('p-1', 1500), { state: 'settled', id: 'r-1' });
        assert.deepEqual(JSON.parse(calls[0].body ?? '{}'), { amount: 1500 });
    });

    it('stays pending while CHIP is still processing', async () => {
        const { fetch } = stubFetch({ 'POST /api/v1/purchases/p-1/refund/': () => ({ body: { type: 'purchase', id: 'p-1', status: 'pending_refund' } }) });
        assert.equal((await client(fetch).refund('p-1', 1500)).state, 'pending');
    });

    it('fails when CHIP refuses, and stays pending when CHIP does not answer', async () => {
        const { fetch } = stubFetch({
            'POST /api/v1/purchases/p-1/refund/': () => ({ status: 400, body: { __all__: { message: 'Refund amount is too big', code: 'purchase_refund_error' } } }),
        });
        const refused = await client(fetch).refund('p-1', 999999);
        assert.equal(refused.state, 'failed');
        assert.match(refused.message ?? '', /Refund amount is too big \(purchase_refund_error\)/);

        const down = new ChipClient({ brandId: 'b', secretKey: 's', fetch: async () => Promise.reject(new TypeError('fetch failed')) });
        const unknown = await down.refund('p-1', 100);
        assert.equal(unknown.state, 'pending');
        assert.match(unknown.message ?? '', /Check purchase p-1 in the CHIP portal/);
    });
});

describe('CHIP: settings', () => {
    it('needs a brand ID and a secret key', () => {
        assert.throws(() => new ChipClient({ brandId: '', secretKey: 'sk' }), GatewayConfigError);
        assert.throws(() => new ChipClient({ brandId: 'b', secretKey: ' ' }), GatewayConfigError);
    });

    it('only talks to https addresses, or plain http on this machine', () => {
        assert.throws(() => new ChipClient({ brandId: 'b', secretKey: 's', baseUrl: 'http://gate.example.com/api/v1/' }), GatewayConfigError);
        assert.throws(() => new ChipClient({ brandId: 'b', secretKey: 's', baseUrl: 'not a url' }), GatewayConfigError);
        assert.doesNotThrow(() => new ChipClient({ brandId: 'b', secretKey: 's', baseUrl: 'http://localhost:4010/api/v1' }));
    });

    it('reads a whitelist written by hand', () => {
        assert.deepEqual(parseChipMethods(' FPX, duitnow_qr  visa,,mastercard, visa, bad-name '), ['fpx', 'duitnow_qr', 'visa', 'mastercard']);
        assert.deepEqual(parseChipMethods(''), []);
    });

    it('knows which callback addresses CHIP will call', () => {
        assert.equal(chipCallbackUrlProblem('https://api.example.com/payments/chip/callback?method=chip'), undefined);
        assert.equal(chipCallbackUrlProblem('https://api.example.com:443/payments/chip/callback'), undefined);
        assert.match(chipCallbackUrlProblem('http://localhost:3011/payments/chip/callback') ?? '', /port/);
        assert.match(chipCallbackUrlProblem('ftp://api.example.com/x') ?? '', /http/);
    });
});
