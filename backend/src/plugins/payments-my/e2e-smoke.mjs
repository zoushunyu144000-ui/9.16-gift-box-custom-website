// End-to-end smoke test for payments-my: CHIP and Billplz through the real server, against mock gateways.
//
// Needs a server set up from stores/moire, running with this backend's .env (SUPERADMIN_*, STOREFRONT_URL and
// VENDURE_PUBLIC_URL are read from it), then from backend/:
//   npx ts-node --transpile-only src/index.ts          (another terminal)
//   node src/plugins/payments-my/e2e-smoke.mjs
// It starts mock CHIP and Billplz APIs on this machine, points two payment methods at them through the Admin API
// (e2e-chip, e2e-billplz; disabled again at the end), pays real orders through the Shop API and sends callbacks
// signed the way the gateways sign them.
import 'dotenv/config';
import { createHmac, generateKeyPairSync, randomBytes, randomUUID, sign } from 'node:crypto';
import { createServer } from 'node:http';

const SERVER = (process.env.VENDURE_URL || `http://localhost:${process.env.PORT || process.env.VENDURE_SERVER_PORT || 3000}`).replace(/\/$/, '');
const PUBLIC_URL = (process.env.VENDURE_PUBLIC_URL || SERVER).replace(/\/$/, '');
const STOREFRONT = (process.env.STOREFRONT_URL || 'http://localhost:3001').replace(/\/$/, '');
const RETURN_URL = `${STOREFRONT}/checkout/return`;
const CHIP = { code: 'e2e-chip', brandId: 'e2e-brand', secretKey: `e2e-${randomBytes(8).toString('hex')}` };
const BILLPLZ = { code: 'e2e-billplz', apiKey: `e2e-${randomBytes(8).toString('hex')}`, collectionId: 'e2ecoll1', xSignatureKey: `S-${randomBytes(12).toString('base64url')}` };
// In-stock items without alcohol (no age check) from stores/moire.
const SKUS = ['artisan-chocolate-box', 'notebook-and-pen-set', 'leather-journal', 'tea-ceremony-set', 'engraved-keepsake-box', 'raya-dates-collection', 'spring-blessings-box'];

const results = [];
function check(name, ok, detail = '') {
    results.push(Boolean(ok));
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

/** A GraphQL client keeping its own session, like one browser. */
function graphql(url) {
    let token = null;
    return async (query, variables = {}) => {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify({ query, variables }),
        });
        token = res.headers.get('vendure-auth-token') ?? token;
        const body = await res.json();
        if (body.errors) return { error: body.errors[0].message, code: body.errors[0].extensions?.code };
        return body.data;
    };
}

function listen(handler) {
    return new Promise(resolve => {
        const server = createServer((req, res) => {
            const chunks = [];
            req.on('data', chunk => chunks.push(chunk));
            req.on('end', async () => {
                const reply = await handler(req, new URL(req.url, 'http://127.0.0.1'), Buffer.concat(chunks).toString('utf8'));
                res.writeHead(reply.status ?? 200, { 'content-type': 'application/json' });
                res.end(JSON.stringify(reply.body));
            });
        });
        server.listen(0, '127.0.0.1', () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` }));
    });
}

/** CHIP Collect as documented: Bearer auth, purchases, refunds, and callbacks signed with RSA (PKCS#1 v1.5, SHA-256). */
async function mockChip() {
    const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const pem = keys.publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const purchases = new Map();
    const requests = [];
    const mock = await listen((req, url, body) => {
        requests.push({ method: req.method, path: url.pathname, authorization: req.headers.authorization, body });
        if (req.headers.authorization !== `Bearer ${CHIP.secretKey}`) {
            return { status: 401, body: { __all__: { message: 'Invalid token.', code: 'authentication_failed' } } };
        }
        if (req.method === 'GET' && url.pathname === '/api/v1/public_key/') return { body: pem };
        if (req.method === 'POST' && url.pathname === '/api/v1/purchases/') {
            const input = JSON.parse(body);
            const id = randomUUID();
            const total = input.purchase.products.reduce((sum, p) => sum + p.price * Number(p.quantity ?? 1), 0);
            const purchase = {
                ...input,
                id,
                type: 'purchase',
                status: 'created',
                is_test: true,
                purchase: { ...input.purchase, total },
                payment: null,
                transaction_data: { payment_method: '' },
                checkout_url: `${mock.base}/p/${id}/`,
            };
            purchases.set(id, purchase);
            return { status: 201, body: purchase };
        }
        const match = /^\/api\/v1\/purchases\/([^/]+)\/(refund\/)?$/.exec(url.pathname);
        const purchase = match && purchases.get(match[1]);
        if (!purchase) return { status: 404, body: { detail: 'Not found.' } };
        if (req.method === 'GET' && !match[2]) return { body: purchase };
        if (req.method === 'POST' && match[2]) {
            purchase.status = 'refunded';
            return { body: { type: 'payment', id: randomUUID(), payment: { amount: JSON.parse(body || '{}').amount, payment_type: 'refund', currency: 'MYR' } } };
        }
        return { status: 405, body: {} };
    });
    return {
        ...mock,
        purchases,
        requests,
        /** The customer pays on CHIP's page (optionally a different amount, to test the amount check). */
        pay(id, amount) {
            const purchase = purchases.get(id);
            Object.assign(purchase, {
                status: 'paid',
                payment: { amount: amount ?? purchase.purchase.total, currency: 'MYR', paid_on: Math.floor(Date.now() / 1000) },
                transaction_data: { payment_method: 'fpx' },
            });
            return JSON.stringify({ ...purchase, event_type: 'purchase.paid' });
        },
        sign: body => sign('sha256', Buffer.from(body), keys.privateKey).toString('base64'),
    };
}

/** Billplz v3 X Signature: HMAC-SHA256 over key+value pairs (except x_signature) sorted ignoring case, joined with |. */
function billplzSignature(params, key) {
    const source = [...params]
        .filter(([name]) => name !== 'x_signature')
        .map(([name, value]) => name + value)
        .sort((a, b) => (a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0))
        .join('|');
    return createHmac('sha256', key).update(source).digest('hex');
}

/** Billplz v3 as documented: Basic auth with the secret key, form-encoded bills, X Signature callbacks. */
async function mockBillplz() {
    const bills = new Map();
    const requests = [];
    const auth = `Basic ${Buffer.from(`${BILLPLZ.apiKey}:`).toString('base64')}`;
    const mock = await listen((req, url, body) => {
        requests.push({ method: req.method, path: url.pathname, authorization: req.headers.authorization, contentType: req.headers['content-type'], body });
        if (req.headers.authorization !== auth) return { status: 401, body: { error: { type: 'Unauthorized', message: ['Invalid access token'] } } };
        if (req.method === 'POST' && url.pathname === '/api/v3/bills') {
            const form = Object.fromEntries(new URLSearchParams(body));
            const id = randomBytes(6).toString('base64url').slice(0, 8);
            const bill = {
                id,
                collection_id: form.collection_id,
                paid: false,
                state: 'due',
                amount: Number(form.amount),
                paid_amount: 0,
                due_at: '2026-10-9',
                email: form.email,
                mobile: form.mobile ?? null,
                name: form.name,
                url: `${mock.base}/bills/${id}`,
                reference_1_label: form.reference_1_label,
                reference_1: form.reference_1,
                redirect_url: form.redirect_url,
                callback_url: form.callback_url,
                description: form.description,
            };
            bills.set(id, bill);
            return { body: bill };
        }
        const bill = req.method === 'GET' && bills.get(/^\/api\/v3\/bills\/([^/]+)$/.exec(url.pathname)?.[1]);
        return bill ? { body: bill } : { status: 404, body: { error: { type: 'Not Found', message: ['Not found'] } } };
    });
    return {
        ...mock,
        bills,
        requests,
        pay(id) {
            Object.assign(bills.get(id), { paid: true, state: 'paid', paid_amount: bills.get(id).amount, paid_at: '2026-10-09 10:15:00 +0800' });
        },
        /** The form Billplz POSTs to callback_url. */
        callback(id, key = BILLPLZ.xSignatureKey) {
            const b = bills.get(id);
            const params = new URLSearchParams({
                id: b.id,
                collection_id: b.collection_id,
                paid: String(b.paid),
                state: b.state,
                amount: String(b.amount),
                paid_amount: String(b.paid_amount),
                due_at: b.due_at,
                email: b.email,
                mobile: b.mobile ?? '',
                name: b.name,
                url: b.url,
                paid_at: b.paid_at ?? '',
                transaction_id: `E2E${id.toUpperCase()}`,
                transaction_status: b.paid ? 'completed' : 'pending',
            });
            params.set('x_signature', billplzSignature(params, key));
            return params.toString();
        },
    };
}

async function postCallback(gateway, method, body, contentType) {
    const res = await fetch(`${SERVER}/payments/${gateway}/callback?method=${encodeURIComponent(method)}`, {
        method: 'POST',
        headers: { 'content-type': contentType.type, ...(contentType.signature ? { 'x-signature': contentType.signature } : {}) },
        body,
    });
    return { status: res.status, text: await res.text() };
}
const asJson = signature => ({ type: 'application/json', signature });
const asForm = { type: 'application/x-www-form-urlencoded' };

const admin = graphql(`${SERVER}/admin-api`);
const ORDER_FIELDS = `id code state totalWithTax
    payments { id state amount method transactionId errorMessage metadata }
    history(options: { take: 100 }) { items { type data } }`;
const adminOrder = async code => (await admin(`query($code:String!){ orders(options:{ filter:{ code:{ eq:$code } } }){ items { ${ORDER_FIELDS} } } }`, { code })).orders.items[0];
const notesOf = order => order.history.items.filter(h => h.type === 'ORDER_NOTE').map(h => h.data.note);
const settledOf = order => order.payments.filter(p => p.state === 'Settled');
// Like the dashboard: Vendure 3.7 still writes the deprecated shipping/adjustment columns, which can't be null.
const REFUND_AS_DASHBOARD = { lines: [], shipping: 0, adjustment: 0 };
const REFUND = `mutation($input:RefundOrderInput!){ refundOrder(input:$input){ ... on Refund { id state total metadata } ... on ErrorResult { errorCode message } } }`;

async function upsertMethod(code, name, handler) {
    const found = await admin(`query($code:String!){ paymentMethods(options:{ filter:{ code:{ eq:$code } } }){ items { id } } }`, { code });
    const id = found.paymentMethods?.items?.[0]?.id;
    const fields = 'id code enabled';
    if (id) return (await admin(`mutation($input:UpdatePaymentMethodInput!){ updatePaymentMethod(input:$input){ ${fields} } }`, { input: { id, enabled: true, handler } })).updatePaymentMethod;
    const input = { code, enabled: true, handler, translations: [{ languageCode: 'en', name, description: 'Created by the payments-my e2e smoke test' }] };
    return (await admin(`mutation($input:CreatePaymentMethodInput!){ createPaymentMethod(input:$input){ ${fields} } }`, { input })).createPaymentMethod;
}

const CREATE = `mutation($input:CreateHostedPaymentInput!){ createHostedPayment(input:$input){
    __typename ... on HostedPaymentRedirect { url reference } ... on HostedPaymentError { errorCode message } } }`;
const STATUS = `query($code:String!){ hostedPaymentStatus(orderCode:$code){ orderCode orderState paid } }`;

/** A new customer session with a bag of in-stock items, delivery chosen, in ArrangingPayment. */
async function orderAtPayment(label) {
    const shop = graphql(`${SERVER}/shop-api`);
    const listed = await shop(`{ products(options:{ take: 100 }) { items { variants { id sku stockLevel } } } }`);
    const bySku = new Map(listed.products.items.flatMap(p => p.variants).map(v => [v.sku, v]));
    const [first, second] = SKUS.map(sku => bySku.get(sku)).filter(v => v && v.stockLevel !== 'OUT_OF_STOCK');
    if (!first || !second) throw new Error('Not enough in-stock items left in the sample catalogue');
    const add = (id, q) => shop(`mutation($id:ID!,$q:Int!){ addItemToOrder(productVariantId:$id, quantity:$q){ ... on Order { id } ... on ErrorResult { message } } }`, { id, q });
    await add(first.id, 2);
    await add(second.id, 1);
    await shop(`mutation($input:CreateCustomerInput!){ setCustomerForOrder(input:$input){ ... on Order { id } ... on ErrorResult { message } } }`, {
        input: { emailAddress: `e2e-${label}-${Date.now()}@example.com`, firstName: 'Sarah', lastName: 'Tan', phoneNumber: '012-345 6789' },
    });
    await shop(`mutation($input:CreateAddressInput!){ setOrderShippingAddress(input:$input){ ... on Order { id } ... on ErrorResult { message } } }`, {
        input: { fullName: 'Gift Recipient', streetLine1: '1 Jalan Test', city: 'Kuala Lumpur', postalCode: '50450', province: 'Kuala Lumpur', countryCode: 'MY', phoneNumber: '019-876 5432' },
    });
    const methods = await shop(`{ eligibleShippingMethods { id } }`);
    await shop(`mutation($id:[ID!]!){ setOrderShippingMethod(shippingMethodId:$id){ ... on Order { id } ... on ErrorResult { message } } }`, { id: [methods.eligibleShippingMethods[0].id] });
    const before = await shop(CREATE, { input: { paymentMethodCode: CHIP.code, returnUrl: RETURN_URL } });
    const moved = await shop(`mutation{ transitionOrderToState(state:"ArrangingPayment"){ ... on Order { code state totalWithTax } ... on OrderStateTransitionError { transitionError } } }`);
    const order = moved.transitionOrderToState;
    if (order?.state !== 'ArrangingPayment') throw new Error(`The order didn't reach ArrangingPayment: ${JSON.stringify(moved)}`);
    return { shop, order, before: before.createHostedPayment };
}

async function main() {
    const chip = await mockChip();
    const billplz = await mockBillplz();
    console.log(`Server ${SERVER} (public ${PUBLIC_URL}), storefront ${STOREFRONT}; mock CHIP ${chip.base}, mock Billplz ${billplz.base}\n`);
    const login = await admin(`mutation($u:String!,$p:String!){ login(username:$u, password:$p){ ... on CurrentUser { id } ... on ErrorResult { message } } }`, {
        u: process.env.SUPERADMIN_USERNAME,
        p: process.env.SUPERADMIN_PASSWORD,
    });
    if (!login.login?.id) throw new Error(`Admin login failed: ${JSON.stringify(login)}`);
    const methods = [
        await upsertMethod(CHIP.code, 'CHIP (e2e)', {
            code: 'chip',
            arguments: [
                { name: 'brandId', value: CHIP.brandId },
                { name: 'secretKey', value: CHIP.secretKey },
                { name: 'paymentMethodWhitelist', value: '' },
                { name: 'apiBaseUrl', value: `${chip.base}/api/v1/` },
            ],
        }),
        await upsertMethod(BILLPLZ.code, 'Billplz (e2e)', {
            code: 'billplz',
            arguments: [
                { name: 'apiKey', value: BILLPLZ.apiKey },
                { name: 'collectionId', value: BILLPLZ.collectionId },
                { name: 'xSignatureKey', value: BILLPLZ.xSignatureKey },
                { name: 'sandbox', value: 'false' },
                { name: 'apiBaseUrl', value: `${billplz.base}/api/v3/` },
            ],
        }),
    ];
    check('payment methods point at the mock gateways', methods.every(m => m?.enabled), methods.map(m => m?.code).join(', '));

    try {
        // 1 · CHIP: refused requests, the purchase CHIP gets, a signed callback, replays, a second payment, a refund
        {
            const { shop, order, before } = await orderAtPayment('chip');
            check('no payment before delivery details are done', before?.errorCode === 'ORDER_PAYMENT_STATE_ERROR', before?.message);
            let r = await shop(CREATE, { input: { paymentMethodCode: CHIP.code, returnUrl: 'https://evil.example.com/return' } });
            check('a return URL on another site is refused', r.createHostedPayment?.errorCode === 'HOSTED_PAYMENT_ERROR', r.createHostedPayment?.message);
            r = await shop(CREATE, { input: { paymentMethodCode: CHIP.code, returnUrl: RETURN_URL, cancelUrl: 'https://evil.example.com/cancel' } });
            check('a cancel URL on another site is refused', r.createHostedPayment?.errorCode === 'HOSTED_PAYMENT_ERROR');
            r = await shop(CREATE, { input: { paymentMethodCode: 'no-such-method', returnUrl: RETURN_URL } });
            check('an unknown payment method is refused', r.createHostedPayment?.errorCode === 'INELIGIBLE_PAYMENT_METHOD_ERROR', r.createHostedPayment?.message);
            check('nothing was created at CHIP for refused requests', !chip.requests.some(q => q.path === '/api/v1/purchases/'));

            r = await shop(CREATE, { input: { paymentMethodCode: CHIP.code, returnUrl: RETURN_URL, cancelUrl: `${STOREFRONT}/checkout`, preferredMethod: 'fpx' } });
            const redirect = r.createHostedPayment;
            const purchase = chip.purchases.get(redirect?.reference);
            check('createHostedPayment returns the CHIP payment page', redirect?.url === `${chip.base}/p/${redirect?.reference}/?active=fpx`, redirect?.url);
            check('the purchase is for the order total in ringgit, referenced by order code', purchase?.purchase.total === order.totalWithTax && purchase.purchase.currency === 'MYR' && purchase.reference === order.code && purchase.brand_id === CHIP.brandId, `${order.code}, RM ${(order.totalWithTax / 100).toFixed(2)}`);
            check('it lists the items and delivery', purchase?.purchase.products.length === 3 && purchase.purchase.products[0].quantity === '2' && purchase.purchase.products.at(-1).name === 'Delivery', purchase?.purchase.products.map(p => `${p.quantity} × ${p.name} @ ${p.price}`).join('; '));
            check('customers come back with ?order=<code>', purchase?.success_redirect === `${RETURN_URL}?order=${order.code}` && purchase.cancel_redirect === `${STOREFRONT}/checkout?order=${order.code}`, purchase?.success_redirect);
            check('the buyer’s details are sent, not the recipient’s', purchase?.client.full_name === 'Sarah Tan' && purchase.client.phone === '+60 123456789' && purchase.client.email.startsWith('e2e-chip'));
            const portInUrl = new URL(PUBLIC_URL).port !== '';
            check(
                portInUrl ? 'no success_callback while the public URL has a port (CHIP refuses those)' : 'CHIP is given the callback URL',
                portInUrl ? !('success_callback' in purchase) : purchase?.success_callback === `${PUBLIC_URL}/payments/chip/callback?method=${CHIP.code}`,
                purchase?.success_callback,
            );
            const second = (await shop(CREATE, { input: { paymentMethodCode: CHIP.code, returnUrl: RETURN_URL } })).createHostedPayment;

            let status = (await shop(STATUS, { code: order.code })).hostedPaymentStatus;
            check('before paying, hostedPaymentStatus says unpaid', status?.paid === false && status.orderState === 'ArrangingPayment', JSON.stringify(status));

            const body = chip.pay(redirect.reference);
            let cb = await postCallback('chip', CHIP.code, body, asJson(chip.sign(body.replace('"paid"', '"paid" '))));
            let o = await adminOrder(order.code);
            check('a callback with a bad signature is refused and changes nothing', cb.status === 400 && o.state === 'ArrangingPayment' && o.payments.length === 0, `HTTP ${cb.status} ${cb.text}`);
            cb = await postCallback('chip', CHIP.code, body, asJson());
            check('a callback without a signature is refused', cb.status === 400, `HTTP ${cb.status}`);

            cb = await postCallback('chip', CHIP.code, body, asJson(chip.sign(body)));
            o = await adminOrder(order.code);
            const [payment] = settledOf(o);
            check('a signed callback settles the order', cb.status === 200 && o.state === 'PaymentSettled' && settledOf(o).length === 1, `HTTP ${cb.status}, order ${o.state}`);
            check('the payment is the purchase, for the full amount, confirmed with CHIP', payment?.transactionId === redirect.reference && payment.amount === order.totalWithTax && payment.metadata?.method === 'fpx' && chip.requests.some(q => q.method === 'GET' && q.path === `/api/v1/purchases/${redirect.reference}/`), `${payment?.transactionId} ${payment?.amount}`);

            const replays = await Promise.all(Array.from({ length: 5 }, () => postCallback('chip', CHIP.code, body, asJson(chip.sign(body)))));
            o = await adminOrder(order.code);
            check('5 replayed callbacks at once don’t pay twice', replays.every(x => x.status === 200) && settledOf(o).length === 1 && o.payments.length === 1, replays.map(x => x.status).join(','));

            status = (await shop(STATUS, { code: order.code })).hostedPaymentStatus;
            check('hostedPaymentStatus says paid', status?.paid === true && status.orderState === 'PaymentSettled', JSON.stringify(status));

            const body2 = chip.pay(second.reference);
            cb = await postCallback('chip', CHIP.code, body2, asJson(chip.sign(body2)));
            o = await adminOrder(order.code);
            const note = notesOf(o).find(n => n.includes(second.reference));
            check('a second paid purchase isn’t recorded; staff get a note to refund it', cb.status === 200 && settledOf(o).length === 1 && /already been paid/.test(note ?? ''), note);

            const refund = (await admin(REFUND, { input: { ...REFUND_AS_DASHBOARD, paymentId: payment.id, amount: 1000, reason: 'e2e partial refund' } })).refundOrder;
            const refundCall = chip.requests.find(q => q.path === `/api/v1/purchases/${redirect.reference}/refund/`);
            check('a refund goes through CHIP’s API', refund?.state === 'Settled' && JSON.parse(refundCall?.body ?? '{}').amount === 1000, `${refund?.state} RM ${(refund?.total ?? 0) / 100}`);

            cb = await postCallback('chip', CHIP.code, JSON.stringify({ id: randomUUID(), status: 'paid' }), asJson('x'));
            check('a callback for a purchase this shop never made is ignored', cb.status === 200 && cb.text === 'Ignored');
        }

        // 2 · Billplz: the customer is back before the callback; the late callback; a forged one; manual refund
        {
            const { shop, order } = await orderAtPayment('billplz');
            const redirect = (await shop(CREATE, { input: { paymentMethodCode: BILLPLZ.code, returnUrl: RETURN_URL, preferredMethod: 'fpx' } })).createHostedPayment;
            const bill = billplz.bills.get(redirect?.reference);
            const created = billplz.requests.find(q => q.method === 'POST');
            check('createHostedPayment returns the Billplz bill page', Boolean(bill) && redirect.url === bill.url, redirect?.url);
            check('the bill is for the order total, referenced by order code, sent as a form with Basic auth', bill?.amount === order.totalWithTax && bill.reference_1 === order.code && bill.collection_id === BILLPLZ.collectionId && created.authorization === `Basic ${Buffer.from(`${BILLPLZ.apiKey}:`).toString('base64')}` && created.contentType === 'application/x-www-form-urlencoded', `${order.code}, RM ${(order.totalWithTax / 100).toFixed(2)}`);
            check('Billplz is given the callback and return URLs', bill?.callback_url === `${PUBLIC_URL}/payments/billplz/callback?method=${BILLPLZ.code}` && bill.redirect_url === `${RETURN_URL}?order=${order.code}`, bill?.callback_url);

            const stranger = await graphql(`${SERVER}/shop-api`)(STATUS, { code: order.code });
            check('another visitor can’t read the payment status of an unplaced order', Boolean(stranger.error), stranger.error);

            billplz.pay(redirect.reference);
            const status = (await shop(STATUS, { code: order.code })).hostedPaymentStatus;
            let o = await adminOrder(order.code);
            check('back before the callback, the customer sees it paid (Billplz was asked)', status?.paid === true && o.state === 'PaymentSettled' && settledOf(o)[0]?.transactionId === redirect.reference, JSON.stringify(status));

            const late = await postCallback('billplz', BILLPLZ.code, billplz.callback(redirect.reference), asForm);
            const forged = await postCallback('billplz', BILLPLZ.code, billplz.callback(redirect.reference, 'not-the-key'), asForm);
            o = await adminOrder(order.code);
            check('the late callback is accepted without paying twice; a forged one is refused', late.status === 200 && forged.status === 400 && o.payments.length === 1, `late ${late.status}, forged ${forged.status}`);

            const refund = (await admin(REFUND, { input: { ...REFUND_AS_DASHBOARD, paymentId: o.payments[0].id, amount: o.payments[0].amount, reason: 'e2e' } })).refundOrder;
            check('a Billplz refund waits as Pending with a note to refund by hand', refund?.state === 'Pending' && /refund through its API/.test(refund.metadata?.note ?? ''), refund?.metadata?.note ?? JSON.stringify(refund));
        }

        // 3 · Wrong amount, and the Shop API's own addPaymentToOrder
        {
            const { shop, order } = await orderAtPayment('mismatch');
            const redirect = (await shop(CREATE, { input: { paymentMethodCode: CHIP.code, returnUrl: RETURN_URL } })).createHostedPayment;
            const direct = await shop(`mutation($input:PaymentInput!){ addPaymentToOrder(input:$input){ ... on Order { state } ... on ErrorResult { errorCode message } } }`, {
                input: { method: CHIP.code, metadata: { reference: redirect.reference } },
            });
            check('the Shop API’s addPaymentToOrder can’t mark a hosted payment paid', direct.addPaymentToOrder?.errorCode === 'PAYMENT_FAILED_ERROR', direct.addPaymentToOrder?.message);

            const body = chip.pay(redirect.reference, order.totalWithTax - 100);
            const cb = await postCallback('chip', CHIP.code, body, asJson(chip.sign(body)));
            const o = await adminOrder(order.code);
            const declined = o.payments.find(p => p.state === 'Declined');
            check('a payment RM 1 short is not accepted', cb.status === 200 && o.state === 'ArrangingPayment' && settledOf(o).length === 0 && /was paid with CHIP, but .* is owed/.test(declined?.errorMessage ?? ''), declined?.errorMessage);
            check('staff get a note about it on the order', notesOf(o).some(n => n.includes(redirect.reference)), notesOf(o).find(n => n.includes(redirect.reference)));
            const status = (await shop(STATUS, { code: order.code })).hostedPaymentStatus;
            check('hostedPaymentStatus still says unpaid', status?.paid === false, JSON.stringify(status));
        }
    } finally {
        for (const m of methods.filter(Boolean)) await admin(`mutation($id:ID!){ updatePaymentMethod(input:{ id:$id, enabled:false }){ id } }`, { id: m.id });
        chip.server.close();
        billplz.server.close();
    }

    console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
    process.exit(results.every(Boolean) ? 0 : 1);
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
