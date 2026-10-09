import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    BillplzClient,
    billplzCallbackId,
    billplzPaymentStatus,
    billplzSignature,
    billplzSourceString,
    billplzState,
    parseBillplzTime,
} from './billplz';
import { CallbackVerificationError, CheckoutRequest, GatewayConfigError, GatewayError } from './types';

type Reply = { status?: number; body?: unknown };
type Call = { url: URL; method: string; headers: Record<string, string>; body?: string };

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
        if (!route) return new Response(JSON.stringify({ error: { type: 'Not Found', message: ['Not found'] } }), { status: 404 });
        const reply = route(call);
        return new Response(JSON.stringify(reply.body ?? {}), { status: reply.status ?? 200 });
    };
    return { fetch, calls };
}

// The worked example from https://www.billplz.com/api (X Signature Callback URL / Redirect URL).
const DOCS_KEY = 'S-s7b4yWpp9h7rrkNM1i3Z_g';
const DOCS_CALLBACK: Array<[string, string]> = [
    ['id', 'zq0tm2wc'],
    ['collection_id', 'yhx5t1pp'],
    ['paid', 'true'],
    ['state', 'paid'],
    ['amount', '100'],
    ['paid_amount', '100'],
    ['due_at', '2018-9-27'],
    ['email', 'tester@test.com'],
    ['mobile', ''],
    ['name', 'TESTER'],
    ['url', 'http://www.billplz-sandbox.com/bills/zq0tm2wc'],
    ['paid_at', '2018-09-27 15:15:09 +0800'],
];
const DOCS_CALLBACK_SIGNATURE = '0fe0a20b8d557eeae570377783d062a3816a9ea80f368860bacfa7ec3ca4d00e';
const DOCS_REDIRECT =
    'billplz[id]=zq0tm2wc&billplz[paid]=true&billplz[paid_at]=2018-09-27%2015%3A15%3A09%20%2B0800' +
    '&billplz[x_signature]=4aab095fe5a39b1d534500988f9a0cb085cd1b6d5bbb55dd4e02ea6fa102b47b';

const request: CheckoutRequest = {
    reference: 'ABC123',
    amount: 18800,
    currencyCode: 'MYR',
    customer: { email: 'buyer@example.com', fullName: 'Sarah Tan', phone: '+60 12-345 6789' },
    items: [{ name: 'New Year Cookie Box', unitPrice: 18800, quantity: 1 }],
    description: 'Order ABC123',
    returnUrl: 'https://shop.example.com/checkout/return?order=ABC123',
    cancelUrl: 'https://shop.example.com/checkout?order=ABC123',
    callbackUrl: 'https://api.example.com/payments/billplz/callback?method=billplz',
};

const client = (fetch?: ReturnType<typeof stubFetch>['fetch'], extra: Partial<ConstructorParameters<typeof BillplzClient>[0]> = {}) =>
    new BillplzClient({ apiKey: 'api-key-1', collectionId: 'col-1', xSignatureKey: DOCS_KEY, fetch, ...extra });

describe('Billplz: X Signature', () => {
    it('builds the documented source string and signature', () => {
        assert.equal(
            billplzSourceString(DOCS_CALLBACK),
            'amount100|collection_idyhx5t1pp|due_at2018-9-27|emailtester@test.com|idzq0tm2wc|mobile|nameTESTER|paid_amount100|' +
                'paid_at2018-09-27 15:15:09 +0800|paidtrue|statepaid|urlhttp://www.billplz-sandbox.com/bills/zq0tm2wc',
        );
        assert.equal(billplzSignature(DOCS_CALLBACK, DOCS_KEY), DOCS_CALLBACK_SIGNATURE);
    });

    it('accepts the documented callback, sent as a form', async () => {
        const body = new URLSearchParams([...DOCS_CALLBACK, ['x_signature', DOCS_CALLBACK_SIGNATURE]]).toString();
        const verified = await client().verifyCallback(Buffer.from(body), { 'content-type': 'application/x-www-form-urlencoded' });
        assert.deepEqual(verified, { id: 'zq0tm2wc', paid: true, state: 'paid', gatewayStatus: 'paid' });
        assert.equal(billplzCallbackId(body), 'zq0tm2wc');
    });

    it('rejects a changed amount, a missing signature and the wrong key', async () => {
        const changed = new URLSearchParams([...DOCS_CALLBACK, ['x_signature', DOCS_CALLBACK_SIGNATURE]]);
        changed.set('paid_amount', '1');
        await assert.rejects(client().verifyCallback(changed.toString(), {}), CallbackVerificationError);
        await assert.rejects(client().verifyCallback(new URLSearchParams(DOCS_CALLBACK).toString(), {}), CallbackVerificationError);
        const body = new URLSearchParams([...DOCS_CALLBACK, ['x_signature', DOCS_CALLBACK_SIGNATURE]]).toString();
        await assert.rejects(client(undefined, { xSignatureKey: 'another-key' }).verifyCallback(body, {}), CallbackVerificationError);
    });

    it('accepts the documented redirect, ignoring our own ?order= parameter', () => {
        const verified = client().verifyRedirect(`order=ABC123&${DOCS_REDIRECT}`);
        assert.deepEqual(verified, { id: 'zq0tm2wc', paid: true, state: 'paid', gatewayStatus: 'paid' });
        assert.throws(() => client().verifyRedirect(DOCS_REDIRECT.replace('paid]=true', 'paid]=false')), CallbackVerificationError);
    });
});

describe('Billplz: creating a bill', () => {
    it('fills in the fields Billplz documents', () => {
        const form = client().billRequest(request);
        assert.deepEqual(Object.fromEntries(form), {
            collection_id: 'col-1',
            email: 'buyer@example.com',
            mobile: '+60123456789',
            name: 'Sarah Tan',
            amount: '18800',
            callback_url: request.callbackUrl,
            redirect_url: request.returnUrl,
            description: 'Order ABC123: New Year Cookie Box',
            reference_1_label: 'Order',
            reference_1: 'ABC123',
        });
    });

    it('keeps the description within 200 characters and leaves out a phone it cannot read', () => {
        const items = Array.from({ length: 30 }, (_, i) => ({ name: `Gift box number ${i}`, unitPrice: 100, quantity: 2 }));
        const form = client().billRequest({ ...request, items, customer: { email: 'a@b.co', fullName: '', phone: '12345' } });
        assert.ok((form.get('description') ?? '').length <= 200);
        assert.match(form.get('description') ?? '', /^Order ABC123: 2 × Gift box number 0, /);
        assert.equal(form.get('mobile'), null);
        assert.equal(form.get('name'), 'a@b.co');
    });

    it('needs ringgit, a callback URL and a positive amount', () => {
        assert.throws(() => client().billRequest({ ...request, currencyCode: 'SGD' }), GatewayError);
        assert.throws(() => client().billRequest({ ...request, callbackUrl: undefined }), GatewayConfigError);
        assert.throws(() => client().billRequest({ ...request, amount: -5 }), GatewayError);
    });

    it('posts the form with the secret key as the Basic auth user name', async () => {
        const { fetch, calls } = stubFetch({
            'POST /api/v3/bills': () => ({ body: { id: '8X0Iyzaw', url: 'https://www.billplz.com/bills/8X0Iyzaw', state: 'due', paid: false } }),
        });
        const session = await client(fetch).createCheckout(request);
        assert.deepEqual(session, { id: '8X0Iyzaw', url: 'https://www.billplz.com/bills/8X0Iyzaw' });
        assert.equal(calls[0].url.href, 'https://www.billplz.com/api/v3/bills');
        assert.equal(calls[0].headers.authorization, `Basic ${Buffer.from('api-key-1:').toString('base64')}`);
        assert.equal(calls[0].headers['content-type'], 'application/x-www-form-urlencoded');
        assert.equal(new URLSearchParams(calls[0].body).get('reference_1'), 'ABC123');
    });

    it('uses the sandbox address when asked, and an override before either', async () => {
        const { fetch, calls } = stubFetch({ 'GET /api/v3/bills/b-1': () => ({ body: { id: 'b-1', paid: false, state: 'due', amount: 100 } }) });
        await client(fetch, { sandbox: true }).getStatus('b-1');
        assert.equal(calls[0].url.origin, 'https://www.billplz-sandbox.com');
        await client(fetch, { sandbox: true, baseUrl: 'http://127.0.0.1:4011/api/v3' }).getStatus('b-1');
        assert.equal(calls[1].url.href, 'http://127.0.0.1:4011/api/v3/bills/b-1');
    });

    it('refuses to work without its three keys', () => {
        assert.throws(() => new BillplzClient({ apiKey: '', collectionId: 'c', xSignatureKey: 'x' }), GatewayConfigError);
        assert.throws(() => new BillplzClient({ apiKey: 'k', collectionId: '', xSignatureKey: 'x' }), GatewayConfigError);
        assert.throws(() => new BillplzClient({ apiKey: 'k', collectionId: 'c', xSignatureKey: '' }), GatewayConfigError);
    });
});

describe('Billplz: bill status', () => {
    it('maps due, paid and deleted bills', () => {
        assert.equal(billplzState({ paid: true, state: 'paid' }), 'paid');
        assert.equal(billplzState({ paid: 'true' }), 'paid');
        assert.equal(billplzState({ paid: false, state: 'due' }), 'pending');
        assert.equal(billplzState({ paid: false, state: 'deleted' }), 'cancelled');
    });

    it('reads amounts and the order reference from GET /bills/{id}', async () => {
        const { fetch } = stubFetch({
            'GET /api/v3/bills/b-1': () => ({
                body: { id: 'b-1', collection_id: 'col-1', paid: true, state: 'paid', amount: 18800, paid_amount: 18800, reference_1: 'ABC123' },
            }),
        });
        const status = await client(fetch).getStatus('b-1');
        assert.deepEqual(status, {
            id: 'b-1',
            reference: 'ABC123',
            state: 'paid',
            gatewayStatus: 'paid',
            amount: 18800,
            paidAmount: 18800,
            currencyCode: 'MYR',
            account: 'col-1',
            paidAt: undefined,
        });
    });

    it('takes the bill amount as paid when Billplz leaves paid_amount out, and nothing before payment', () => {
        assert.equal(billplzPaymentStatus({ id: 'b', paid: true, state: 'paid', amount: '500' }, 'b').paidAmount, 500);
        assert.equal(billplzPaymentStatus({ id: 'b', paid: false, state: 'due', amount: 500, paid_amount: 0 }, 'b').paidAmount, 0);
    });

    it('reads Billplz times', () => {
        assert.equal(parseBillplzTime('2018-09-27 15:15:09 +0800')?.toISOString(), '2018-09-27T07:15:09.000Z');
        assert.equal(parseBillplzTime('yesterday'), undefined);
        assert.equal(parseBillplzTime(null), undefined);
    });
});
