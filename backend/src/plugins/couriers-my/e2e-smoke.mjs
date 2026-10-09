// End-to-end smoke test for the couriers-my plugin against tiny local mocks of Lalamove, EasyParcel and
// Google Geocoding. It starts its own Vendure server and worker on the database in backend/.env (a shop
// set up with `npm run setup:store -- stores/moire`), so stop any server on that port first:
//   cd backend && node src/plugins/couriers-my/e2e-smoke.mjs        (E2E_PORT=3013 by default)
// It places orders through the Shop API (test payment), fulfils them through the Admin API with each
// handler, pushes webhooks (signed for Lalamove, secret URL for EasyParcel), runs the reconcile task and
// checks the fulfillments, the customer emails and the order as the Shop API shows it.
import { spawn } from 'node:child_process';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import dotenv from 'dotenv';

const backendDir = process.cwd();
dotenv.config({ path: path.join(backendDir, '.env'), quiet: true });

const PORT = Number(process.env.E2E_PORT || 3013);
const BASE = `http://localhost:${PORT}`;
const LALAMOVE = { key: 'pk_test_e2e_key', secret: 'sk_test_e2e_secret' };
const EASYPARCEL = { clientId: 'e2e-client', clientSecret: 'e2e-client-secret' };
const GOOGLE_KEY = 'e2e-google-key';
const RUN = randomBytes(3).toString('hex');
// Mock ids differ per run: earlier runs leave open shipments in the database that the reconcile still checks.
const RUN_DIGITS = String(100000 + (parseInt(RUN, 16) % 900000));
const CUSTOMER_EMAIL = `couriers-e2e-${RUN}@example.com`;
const EMAIL_DIR = path.join(backendDir, 'static/email/test-emails');

const results = [];
function expect(name, ok, detail = '') {
    results.push(!!ok);
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

// ── Mock servers ──────────────────────────────────────────────────────────

function listen(handler) {
    return new Promise(resolve => {
        const server = http.createServer(async (req, res) => {
            const chunks = [];
            for await (const chunk of req) chunks.push(chunk);
            const raw = Buffer.concat(chunks).toString('utf8');
            const url = new URL(req.url, 'http://127.0.0.1');
            const send = (status, body, headers = {}) => {
                res.writeHead(status, { 'content-type': 'application/json', ...headers });
                res.end(body === undefined ? undefined : JSON.stringify(body));
            };
            try {
                await handler({ req, url, raw, send });
            } catch (error) {
                send(500, { message: String(error) });
            }
        });
        server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` }));
    });
}

// Lalamove v3: checks every request's HMAC signature like Lalamove does.
const lm = { orders: new Map(), calls: { quotations: 0, orders: 0, get: 0, cancel: 0 }, badSignatures: 0, seq: 0 };
const publicOrder = ({ cancellable, ...order }) => order;
const lalamoveMock = await listen(({ req, url, raw, send }) => {
    const auth = (req.headers.authorization ?? '').match(/^hmac ([^:]+):(\d+):([0-9a-f]{64})$/);
    const expected = auth && createHmac('sha256', LALAMOVE.secret).update(`${auth[2]}\r\n${req.method}\r\n${url.pathname}\r\n\r\n${raw}`).digest('hex');
    if (!auth || auth[1] !== LALAMOVE.key || auth[3] !== expected || req.headers.market !== 'MY') {
        lm.badSignatures++;
        return send(401, { errors: [{ id: 'ERR_UNAUTHORIZED' }] });
    }
    const body = raw ? JSON.parse(raw).data : undefined;
    if (req.method === 'POST' && url.pathname === '/v3/quotations') {
        lm.calls.quotations++;
        lm.lastQuotation = body;
        const id = `15141409942270${String(++lm.seq).padStart(5, '0')}`;
        return send(201, {
            data: {
                quotationId: id,
                serviceType: body.serviceType,
                stops: body.stops.map((stop, i) => ({ ...stop, stopId: `${id}${i}` })),
                priceBreakdown: { base: '20', total: '25.5', currency: 'MYR' },
            },
        });
    }
    if (req.method === 'POST' && url.pathname === '/v3/orders') {
        lm.calls.orders++;
        lm.lastOrder = body;
        const order = newLalamoveOrder();
        return send(201, { data: publicOrder(order) });
    }
    const match = url.pathname.match(/^\/v3\/orders\/(\d+)$/);
    if (match) {
        const order = lm.orders.get(match[1]);
        if (!order) return send(404, { errors: [{ id: 'ERR_ORDER_NOT_FOUND' }] });
        if (req.method === 'GET') {
            lm.calls.get++;
            return send(200, { data: publicOrder(order) });
        }
        if (req.method === 'DELETE') {
            lm.calls.cancel++;
            if (!order.cancellable) return send(409, { message: 'ERR_CANCELLATION_FORBIDDEN' });
            order.status = 'CANCELED';
            return send(204);
        }
    }
    if (req.method === 'GET' && url.pathname === '/v3/cities') {
        return send(200, { data: [{ locode: 'MY KUL', name: 'Kuala Lumpur', services: [{ key: 'MOTORCYCLE' }, { key: 'CAR' }, { key: 'VAN' }] }] });
    }
    if (req.method === 'PATCH' && url.pathname === '/v3/webhook') {
        lm.webhookUrl = body.url;
        return send(200, { data: { url: body.url } });
    }
    send(404, { message: 'not found' });
});

function newLalamoveOrder(from) {
    const orderId = `3463${RUN_DIGITS}${String(++lm.seq).padStart(9, '0')}`;
    const order = {
        orderId,
        quotationId: from?.quotationId ?? `q${lm.seq}`,
        status: 'ASSIGNING_DRIVER',
        driverId: '',
        shareLink: `https://share.sandbox.lalamove.com?MY${orderId}&lang=en_MY&source=api_wrapper`,
        priceBreakdown: { total: '25.5', currency: 'MYR' },
        stops: [{ stopId: '1' }, { stopId: '2', POD: { status: 'PENDING' } }],
        cancellable: true,
    };
    lm.orders.set(orderId, order);
    return order;
}

// EasyParcel Open API 2026-09 with OAuth (code + PKCE, Basic client auth, rotating refresh tokens).
const ep = { codes: new Map(), access: new Set(), refresh: new Set(), grants: { code: 0, refresh: 0 }, shipments: new Map(), calls: {}, unauthorized: 0, seq: 0 };
const basic = `Basic ${Buffer.from(`${EASYPARCEL.clientId}:${EASYPARCEL.clientSecret}`).toString('base64')}`;
const issueTokens = () => {
    const n = ++ep.seq;
    ep.access.add(`ep-at-${n}`);
    ep.refresh.add(`ep-rt-${n}`);
    return { token_type: 'Bearer', expires_in: 3600, access_token: `ep-at-${n}`, refresh_token: `ep-rt-${n}`, refresh_token_expires_in: 31557600 };
};
const easyParcelMock = await listen(({ req, url, raw, send }) => {
    if (req.method === 'GET' && url.pathname === '/oauth/login') {
        const q = url.searchParams;
        if (q.get('client_id') !== EASYPARCEL.clientId || q.get('response_type') !== 'code' || q.get('code_challenge_method') !== 'S256') {
            return send(400, { error: 'invalid_request' });
        }
        const code = `code-${randomBytes(4).toString('hex')}`;
        ep.codes.set(code, { challenge: q.get('code_challenge'), redirectUri: q.get('redirect_uri') });
        const back = new URL(q.get('redirect_uri'));
        back.searchParams.set('code', code);
        back.searchParams.set('state', q.get('state'));
        return send(302, undefined, { location: back.toString() });
    }
    if (req.method === 'POST' && url.pathname === '/oauth/token') {
        if (req.headers.authorization !== basic) return send(401, { error: 'invalid_client' });
        const form = new URLSearchParams(raw);
        if (form.get('grant_type') === 'authorization_code') {
            const pending = ep.codes.get(form.get('code'));
            const challenge = createHash('sha256').update(form.get('code_verifier') ?? '').digest('base64url');
            if (!pending || pending.challenge !== challenge || pending.redirectUri !== form.get('redirect_uri')) return send(400, { error: 'invalid_grant' });
            ep.codes.delete(form.get('code'));
            ep.grants.code++;
            return send(200, issueTokens());
        }
        if (form.get('grant_type') === 'refresh_token') {
            if (!ep.refresh.delete(form.get('refresh_token'))) return send(400, { error: 'invalid_grant' });
            ep.grants.refresh++;
            return send(200, issueTokens());
        }
        return send(400, { error: 'unsupported_grant_type' });
    }
    const api = url.pathname.match(/^\/open_api\/2026-09\/(.+)$/);
    if (!api || req.method !== 'POST') return send(404, { message: 'not found' });
    if (!ep.access.has((req.headers.authorization ?? '').replace(/^Bearer /, ''))) {
        ep.unauthorized++;
        return send(401, { message: 'Unauthenticated.' });
    }
    const body = JSON.parse(raw || '{}');
    ep.calls[api[1]] = (ep.calls[api[1]] ?? 0) + 1;
    switch (api[1]) {
        case 'shipment/quotations': {
            ep.lastQuote = body.shipment[0];
            const quote = (id, courier, service, total, pickup) => ({
                courier: { service_id: id, service_name: service, courier_id: `${id}-c`, courier_name: courier, is_pickup: pickup, is_dropoff: !pickup },
                pricing: { currency: 'MYR', total_amount: total },
            });
            return send(200, {
                status_code: 200,
                data: [{ status: 'success', input: body.shipment[0], quotations: [
                    quote('EP-CS0PL', 'Pos Laju', 'Pos Laju (Pick Up)', 12.5, true),
                    quote('EP-CS0JT', 'J&T Express', 'J&T Express (Drop-Off)', '8.00', false),
                    quote('EP-CS0D9', 'City-Link Express', 'City-Link Express (Pick Up)', '10.20', true),
                ] }],
            });
        }
        case 'shipment/submit_orders': {
            ep.lastSubmit = body.shipment[0];
            const number = `ES-2610-${RUN.toUpperCase()}${++ep.seq}`;
            ep.shipments.set(number, { code: 7, text: 'Schedule In Arrangement', awb: null, awbUrl: null, trackingUrl: null, eventDate: '2026-10-09 03:00:00' });
            return send(200, {
                status_code: 200,
                message: '1 requests success, 0 request error.',
                data: [{ order_details: { order_number: `EI-2610-${ep.seq}` }, shipments: [{
                    status: 'success', shipment_number: number, courier: 'Pos Laju', awb_number: null, awb_url: '',
                    awb_urls_by_format: { A4: '', A5: '', A6: '' }, tracking_url: null, reference: body.shipment[0].reference,
                }] }],
            });
        }
        case 'shipment/details': {
            const s = ep.shipments.get(body.shipment_number);
            if (!s) return send(200, { status_code: 404, message: 'No Order found', data: [] });
            return send(200, { status_code: 200, data: [{ shipment_number: body.shipment_number, shipment_details: {
                shipment_status_code: s.code, shipment_status: s.text, awb_number: s.awb, awb_url: s.awbUrl, tracking_url: s.trackingUrl,
            } }] });
        }
        case 'shipment/tracking_status': {
            const results = body.awb_numbers.map(awb => {
                const [number, s] = [...ep.shipments].find(([, x]) => x.awb === awb) ?? [];
                if (!s) return { awb_number: awb, status: 'not_found', message: 'AWB number not found' };
                return { status: 'success', awb_number: awb, shipment_number: number, latest_shipment_status_code: s.code, latest_tracking_status: s.text,
                    latest_event_date: s.eventDate, status_log: [{ event_date: s.eventDate, shipment_status_code: s.code, tracking_status: s.text }] };
            });
            return send(200, { status_code: 200, data: { results } });
        }
        case 'shipment/cancel': {
            const data = body.cancel_list.map(({ shipment_number }) => {
                const s = ep.shipments.get(shipment_number);
                if (!s) return { status: 'error', message: 'Shipment Not Found', shipment_number };
                if (s.code !== 7) return { status: 'error', message: 'Shipment already processed by the courier', shipment_number };
                s.code = 0;
                s.text = 'Cancelled';
                return { status: 'success', message: 'Shipment Cancelled', shipment_number };
            });
            return send(200, { status_code: 200, data });
        }
        default:
            return send(404, { message: 'not found' });
    }
});

// Google Geocoding.
const google = { calls: 0 };
const googleMock = await listen(({ url, send }) => {
    if (url.pathname !== '/maps/api/geocode/json') return send(404, {});
    if (url.searchParams.get('key') !== GOOGLE_KEY) return send(200, { status: 'REQUEST_DENIED', error_message: 'The provided API key is invalid.' });
    google.calls++;
    google.lastAddress = url.searchParams.get('address');
    google.lastComponents = url.searchParams.get('components');
    return send(200, { status: 'OK', results: [{ geometry: { location: { lat: 3.0738321, lng: 101.5183467 }, location_type: 'ROOFTOP' } }] });
});

// ── Vendure server and worker ─────────────────────────────────────────────

const childEnv = {
    ...process.env,
    APP_ENV: 'dev',
    VENDURE_SERVER_PORT: String(PORT),
    PORT: String(PORT),
    VENDURE_PUBLIC_URL: BASE,
    LALAMOVE_API_KEY: LALAMOVE.key,
    LALAMOVE_API_SECRET: LALAMOVE.secret,
    LALAMOVE_SANDBOX: 'true',
    LALAMOVE_BASE_URL: lalamoveMock.url,
    EASYPARCEL_CLIENT_ID: EASYPARCEL.clientId,
    EASYPARCEL_CLIENT_SECRET: EASYPARCEL.clientSecret,
    EASYPARCEL_SANDBOX: 'true',
    EASYPARCEL_BASE_URL: easyParcelMock.url,
    GOOGLE_MAPS_API_KEY: GOOGLE_KEY,
    GOOGLE_GEOCODING_URL: `${googleMock.url}/maps/api/geocode/json`,
};

const children = [];
function start(name, script, ready) {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ['-r', 'ts-node/register/transpile-only', script], { cwd: backendDir, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] });
        children.push(child);
        let log = '';
        let settled = false;
        child.log = () => log;
        const onData = chunk => {
            log += chunk;
            if (!settled && ready.test(log)) {
                settled = true;
                resolve(child);
            }
        };
        child.stdout.on('data', onData);
        child.stderr.on('data', onData);
        child.on('exit', code => {
            if (!settled) {
                settled = true;
                reject(new Error(`${name} exited with ${code}:\n${log.slice(-3000)}`));
            }
        });
        setTimeout(() => {
            if (!settled) {
                settled = true;
                reject(new Error(`${name} did not start within 3 minutes:\n${log.slice(-3000)}`));
            }
        }, 180_000);
    });
}

async function stopAll() {
    await Promise.all(
        children.map(child => new Promise(resolve => {
            if (child.exitCode !== null) return resolve();
            child.once('exit', resolve);
            child.kill('SIGTERM');
            setTimeout(() => child.kill('SIGKILL'), 15_000).unref();
        })),
    );
    for (const mock of [lalamoveMock, easyParcelMock, googleMock]) mock.server.close();
}

// ── API helpers ───────────────────────────────────────────────────────────

function client(url) {
    let token = null;
    return {
        async raw(query, variables = {}) {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
                body: JSON.stringify({ query, variables }),
            });
            token = res.headers.get('vendure-auth-token') ?? token;
            return res.json();
        },
        async q(query, variables = {}) {
            const body = await this.raw(query, variables);
            if (body.errors) throw new Error(`${body.errors[0].message} in ${query.slice(0, 80)}`);
            return body.data;
        },
        get token() {
            return token;
        },
    };
}
const shop = client(`${BASE}/shop-api`);
const admin = client(`${BASE}/admin-api`);
const asAdmin = (headers = {}) => ({ authorization: `Bearer ${admin.token}`, accept: 'application/json', ...headers });

async function waitFor(check, timeoutMs = 20_000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        const value = await check();
        if (value) return value;
        await sleep(400);
    }
    return undefined;
}

const FULFILLMENT = 'id state method trackingCode customFields { provider providerOrderId trackingUrl labelUrl shipmentStatus lastEventAt }';
async function adminOrder(id) {
    return (await admin.q(`query($id:ID!){ order(id:$id){ id code state fulfillments { ${FULFILLMENT} } } }`, { id })).order;
}
async function fulfillmentOf(orderId, fulfillmentId) {
    return (await adminOrder(orderId)).fulfillments.find(f => f.id === fulfillmentId);
}
async function fulfil(lines, code, args) {
    const data = await admin.q(
        `mutation($input: FulfillOrderInput!){ addFulfillmentToOrder(input:$input){ __typename ... on Fulfillment { ${FULFILLMENT} }
            ... on CreateFulfillmentError { errorCode message fulfillmentHandlerError } ... on ErrorResult { errorCode message } } }`,
        { input: { lines: lines.map(l => ({ orderLineId: l.id, quantity: l.quantity })), handler: { code, arguments: Object.entries(args).map(([name, value]) => ({ name, value: String(value) })) } } },
    );
    return data.addFulfillmentToOrder;
}
async function transition(fulfillmentId, state) {
    const data = await admin.q(
        `mutation($id:ID!,$state:String!){ transitionFulfillmentToState(id:$id, state:$state){ __typename ... on Fulfillment { id state }
            ... on FulfillmentStateTransitionError { errorCode message transitionError } } }`,
        { id: fulfillmentId, state },
    );
    return data.transitionFulfillmentToState;
}

const variantIds = new Map();
async function placeOrder(items, address) {
    for (const [sku, quantity] of items) {
        const added = await shop.q(`mutation($id:ID!,$q:Int!){ addItemToOrder(productVariantId:$id, quantity:$q){ ... on Order { code } ... on ErrorResult { errorCode message } } }`, { id: variantIds.get(sku), q: quantity });
        if (!added.addItemToOrder.code) throw new Error(`Could not add ${sku}: ${added.addItemToOrder.message}`);
    }
    await shop.q(`mutation($input: CreateCustomerInput!){ setCustomerForOrder(input:$input){ ... on Order { id } ... on ErrorResult { errorCode message } } }`, {
        input: { emailAddress: CUSTOMER_EMAIL, firstName: 'Aisyah', lastName: 'Tan' },
    });
    await shop.q(`mutation($input: CreateAddressInput!){ setOrderShippingAddress(input:$input){ ... on Order { id } ... on ErrorResult { errorCode message } } }`, { input: address });
    const methods = await shop.q(`{ eligibleShippingMethods { id } }`);
    await shop.q(`mutation($id:[ID!]!){ setOrderShippingMethod(shippingMethodId:$id){ ... on Order { id } ... on ErrorResult { errorCode message } } }`, { id: [methods.eligibleShippingMethods[0].id] });
    const moved = await shop.q(`mutation{ transitionOrderToState(state:"ArrangingPayment"){ ... on Order { state } ... on OrderStateTransitionError { transitionError } } }`);
    if (moved.transitionOrderToState.state !== 'ArrangingPayment') throw new Error(moved.transitionOrderToState.transitionError);
    const payment = await shop.q(`{ eligiblePaymentMethods { code } }`);
    const paid = await shop.q(
        `mutation($input: PaymentInput!){ addPaymentToOrder(input:$input){ ... on Order { id code state lines { id quantity productVariant { sku name } } } ... on ErrorResult { errorCode message } } }`,
        { input: { method: payment.eligiblePaymentMethods[0].code, metadata: {} } },
    );
    const order = paid.addPaymentToOrder;
    if (!order.code) throw new Error(`Payment failed: ${order.message}`);
    const payments = await admin.q(`query($id:ID!){ order(id:$id){ payments { id } } }`, { id: order.id });
    await admin.q(`mutation($id:ID!){ settlePayment(id:$id){ ... on Payment { state } ... on ErrorResult { errorCode message } } }`, { id: payments.order.payments[0].id });
    return order;
}

let eventSeq = 0;
async function lalamoveWebhook(eventType, data, options = {}) {
    const timestamp = options.timestamp ?? Math.floor(Date.now() / 1000);
    const secret = options.secret ?? LALAMOVE.secret;
    const signature = createHmac('sha256', secret).update(`${timestamp}\r\nPOST\r\n/delivery/lalamove/webhook\r\n\r\n${JSON.stringify(data)}`).digest('hex');
    const body = options.body ?? JSON.stringify({ apiKey: LALAMOVE.key, timestamp, signature, eventId: options.eventId ?? `E2E-${RUN}-${++eventSeq}`, eventType, eventVersion: 'v3', data });
    const res = await fetch(`${BASE}/delivery/lalamove/webhook`, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
    return { status: res.status, body };
}
const minutesFromNow = minutes => new Date(Date.now() + minutes * 60_000).toISOString();
const statusEvent = (orderId, status, updatedAt) => ({ order: { orderId, status, market: 'MY_KUL', driverId: '79973', previousStatus: '' }, updatedAt });

function emailsFor(recipient) {
    if (!existsSync(EMAIL_DIR)) return [];
    return readdirSync(EMAIL_DIR)
        .filter(file => file.endsWith('.json'))
        .map(file => JSON.parse(readFileSync(path.join(EMAIL_DIR, file), 'utf8')))
        .filter(email => email.recipient === recipient);
}

// ── Scenario ──────────────────────────────────────────────────────────────

async function main() {
    const busy = await fetch(`${BASE}/health`).then(() => true, () => false);
    if (busy) throw new Error(`Something is already listening on port ${PORT}; stop it (or set E2E_PORT) first.`);
    console.log(`Mocks: Lalamove ${lalamoveMock.url}, EasyParcel ${easyParcelMock.url}, Google ${googleMock.url}`);
    const server = await start('server', 'src/index.ts', /Vendure server \(v[\d.]+\) now running/);
    const worker = await start('worker', 'src/index-worker.ts', /Vendure Worker is ready/);
    console.log(`Server and worker running on ${BASE}\n`);

    const login = await admin.q(`mutation($u:String!,$p:String!){ login(username:$u, password:$p){ ... on CurrentUser { id } ... on ErrorResult { message } } }`, {
        u: process.env.SUPERADMIN_USERNAME,
        p: process.env.SUPERADMIN_PASSWORD,
    });
    if (!login.login.id) throw new Error('Admin login failed');
    const products = await shop.q(`{ products(options:{ take: 100 }) { items { variants { id sku } } } }`);
    for (const product of products.products.items) for (const variant of product.variants) variantIds.set(variant.sku, variant.id);

    // 1 · Connect EasyParcel (OAuth code + PKCE), check rates through easyParcelRateProvider
    const connect = await fetch(`${BASE}/delivery/easyparcel/connect`, { headers: asAdmin() }).then(r => r.json());
    const authorise = await fetch(connect.url, { redirect: 'manual' });
    const callback = await fetch(authorise.headers.get('location'), { headers: asAdmin() }).then(r => r.json());
    const status = await fetch(`${BASE}/delivery/easyparcel/status`, { headers: asAdmin() }).then(r => r.json());
    expect('EasyParcel account connects through OAuth (code + PKCE)', callback.connected && status.connected && ep.grants.code === 1, callback.message);
    const anonymous = await fetch(`${BASE}/delivery/easyparcel/connect`);
    expect('connect route is admin-only', anonymous.status === 403, `HTTP ${anonymous.status}`);
    const webhookUrl = status.webhookUrl;
    expect('status shows the secret webhook URL for the Developer Hub', /\/delivery\/easyparcel\/webhook\/[0-9a-f]{40}$/.test(webhookUrl ?? ''));

    const rates = await fetch(`${BASE}/delivery/easyparcel/rates?toPostcode=11950&toState=Pulau%20Pinang&weightKg=2`, { headers: asAdmin() }).then(r => r.json());
    expect(
        'live rates: pickup services only, cheapest first, in sen',
        rates.length === 2 && rates[0].serviceId === 'EP-CS0D9' && rates[0].priceSen === 1020 && rates[1].priceSen === 1250,
        JSON.stringify(rates),
    );
    expect('rate check uses ISO subdivisions (KL → Penang)', ep.lastQuote?.sender.subdivision_code === 'MY-14' && ep.lastQuote?.receiver.subdivision_code === 'MY-07' && ep.lastQuote?.weight === 2);

    // 2 · Orders: A to Petaling Jaya (Lalamove + a hand-booked courier), B to Penang (EasyParcel), C for cancelling
    // A new address each run, so the first booking geocodes it and the second one finds it cached.
    const klAddress = { fullName: 'Aisyah Tan', streetLine1: `Lot ${RUN_DIGITS}, Jalan SS2/24`, city: 'Petaling Jaya', province: 'Selangor', postalCode: '47300', countryCode: 'MY', phoneNumber: '012-345 6789' };
    const orderA = await placeOrder([['tea-ceremony-set', 1], ['leather-journal', 1]], klAddress);
    const orderB = await placeOrder([['spring-blessings-box', 2]], { fullName: 'Tan Mei Ling', streetLine1: '12 Lorong Kampung Jawa', streetLine2: 'Taman Bayan', city: 'Bayan Lepas', province: 'Pulau Pinang', postalCode: '11950', countryCode: 'MY', phoneNumber: '+60 16-777 8888' });
    const orderC = await placeOrder([['artisan-chocolate-box', 1]], klAddress);
    expect('three orders placed and paid (test payment)', [orderA, orderB, orderC].every(o => o.code), `${orderA.code} ${orderB.code} ${orderC.code}`);

    // 3 · Lalamove booking
    const lalamove = await fulfil([orderA.lines[0]], 'lalamove', { serviceType: 'MOTORCYCLE', remarks: 'Call on arrival' });
    expect(
        'lalamove: books a driver, trackingCode = Lalamove order id, trackingUrl = share link',
        lalamove.__typename === 'Fulfillment' && lalamove.state === 'Pending' && /^\d{19}$/.test(lalamove.trackingCode) &&
            lalamove.customFields.provider === 'lalamove' && lalamove.customFields.trackingUrl?.includes(lalamove.trackingCode) && lalamove.customFields.shipmentStatus === 'booked',
        lalamove.__typename === 'Fulfillment' ? `${lalamove.method} ${lalamove.trackingCode}` : JSON.stringify(lalamove),
    );
    const firstLalamoveId = lalamove.trackingCode;
    expect(
        'lalamove quotation: shop origin → geocoded address, string coordinates, en_MY',
        lm.lastQuotation?.stops[0].coordinates.lat === '3.1478' && lm.lastQuotation?.stops[1].coordinates.lng === '101.5183467' &&
            lm.lastQuotation?.language === 'en_MY' && lm.lastQuotation?.serviceType === 'MOTORCYCLE' && google.lastComponents === 'country:MY',
        google.lastAddress,
    );
    expect(
        'lalamove order: E.164 phones, remarks, proof of delivery, order code',
        lm.lastOrder?.recipients[0].phone === '+60123456789' && lm.lastOrder?.recipients[0].remarks.includes('Call on arrival') &&
            lm.lastOrder?.recipients[0].remarks.includes(orderA.code) && lm.lastOrder?.isPODEnabled === true && lm.lastOrder?.metadata.orderCode === orderA.code,
    );

    // 4 · Courier booked by hand
    const rejected = await fulfil([orderA.lines[1]], 'manual-courier', { courierName: 'GDex', trackingNumber: 'GDX1', trackingUrl: 'javascript:alert(1)' });
    expect('manual-courier refuses a non-https tracking link', rejected.__typename === 'CreateFulfillmentError', rejected.fulfillmentHandlerError);
    const manual = await fulfil([orderA.lines[1]], 'manual-courier', { courierName: 'GDex', trackingNumber: 'GDX-E2E-001', trackingUrl: 'https://gdexpress.com/tracking/?consignmentno=GDX-E2E-001' });
    expect('manual-courier: courier, tracking number and link', manual.method === 'GDex' && manual.trackingCode === 'GDX-E2E-001' && manual.customFields.provider === 'manual' && manual.customFields.trackingUrl?.startsWith('https://gdexpress.com'));

    // 5 · EasyParcel booking (with an expired access token: refreshed on the 401, then retried)
    ep.access.clear();
    const easyparcel = await fulfil([orderB.lines[0]], 'easyparcel', { service: 'Pos Laju', labelSize: 'A6' });
    expect(
        'easyparcel: books Pos Laju, shipment number kept, AWB to follow',
        easyparcel.__typename === 'Fulfillment' && easyparcel.method === 'EasyParcel: Pos Laju (Pick Up)' && easyparcel.customFields.providerOrderId?.startsWith('ES-2610-') && easyparcel.trackingCode === '',
        easyparcel.__typename === 'Fulfillment' ? easyparcel.customFields.providerOrderId : JSON.stringify(easyparcel),
    );
    expect('easyparcel: expired access token refreshed once and the call retried', ep.grants.refresh === 1 && ep.unauthorized >= 1);
    expect(
        'easyparcel submit payload: MY-14 → MY-07, national phones, items, collection date',
        ep.lastSubmit?.sender.subdivision_code === 'MY-14' && ep.lastSubmit?.receiver.subdivision_code === 'MY-07' && ep.lastSubmit?.receiver.phone_number === '167778888' &&
            ep.lastSubmit?.service_id === 'EP-CS0PL' && /^\d{4}-\d{2}-\d{2}$/.test(ep.lastSubmit?.collection_date) && ep.lastSubmit?.item[0].quantity === 2 &&
            ep.lastSubmit?.item[0].value === 188 && ep.lastSubmit?.reference === orderB.code,
    );

    // 6 · Lalamove webhooks: driver, cancel-and-clone (ORDER_REPLACED), pickup, duplicate, forgery, delivery, late event
    lm.orders.get(firstLalamoveId).status = 'ON_GOING';
    const getsBefore = lm.calls.get;
    await lalamoveWebhook('ORDER_STATUS_CHANGED', statusEvent(firstLalamoveId, 'ON_GOING', minutesFromNow(1)));
    await waitFor(() => lm.calls.get > getsBefore);
    const replacement = newLalamoveOrder(lm.orders.get(firstLalamoveId));
    lm.orders.get(firstLalamoveId).status = 'CANCELED';
    await lalamoveWebhook('ORDER_STATUS_CHANGED', statusEvent(firstLalamoveId, 'CANCELED', minutesFromNow(2)));
    const cancelledFirst = await waitFor(async () => (await fulfillmentOf(orderA.id, lalamove.id)).customFields.shipmentStatus === 'cancelled');
    await lalamoveWebhook('ORDER_REPLACED', { order: { orderId: replacement.orderId }, prevOrderId: firstLalamoveId, updatedAt: minutesFromNow(3) });
    const replaced = await waitFor(async () => {
        const f = await fulfillmentOf(orderA.id, lalamove.id);
        return f.trackingCode === replacement.orderId && f;
    });
    expect(
        'ORDER_REPLACED: the fulfillment follows the cloned order (id, link, status)',
        cancelledFirst && replaced && replaced.customFields.providerOrderId === replacement.orderId && replaced.customFields.trackingUrl.includes(replacement.orderId) &&
            replaced.customFields.shipmentStatus === 'booked' && replaced.state === 'Pending',
        replaced ? `${firstLalamoveId} → ${replaced.trackingCode}` : 'not replaced',
    );

    replacement.status = 'PICKED_UP';
    const pickedUp = await lalamoveWebhook('ORDER_STATUS_CHANGED', statusEvent(replacement.orderId, 'PICKED_UP', minutesFromNow(5)));
    const shipped = await waitFor(async () => {
        const f = await fulfillmentOf(orderA.id, lalamove.id);
        return f.state === 'Shipped' && f;
    });
    expect('picked up → fulfillment Shipped, status out_for_delivery', shipped?.customFields.shipmentStatus === 'out_for_delivery', shipped?.state);

    const getsBeforeDuplicate = lm.calls.get;
    const duplicate = await lalamoveWebhook(null, null, { body: pickedUp.body });
    // eventId isn't signed: a replay under a new one must still be recognised.
    const renamed = await lalamoveWebhook(null, null, { body: pickedUp.body.replace(/"eventId":"[^"]+"/, `"eventId":"E2E-${RUN}-replayed"`) });
    const old = await lalamoveWebhook('ORDER_STATUS_CHANGED', statusEvent(replacement.orderId, 'PICKED_UP', minutesFromNow(5)), {
        timestamp: Math.floor(Date.now() / 1000) - 3 * 86_400,
    });
    await sleep(1500);
    expect(
        'a redelivered webhook (same body, or a new eventId) and a signed one 3 days old get 200 and are not processed',
        duplicate.status === 200 && renamed.status === 200 && old.status === 200 && lm.calls.get === getsBeforeDuplicate,
    );
    const forged = await lalamoveWebhook('ORDER_STATUS_CHANGED', statusEvent(replacement.orderId, 'COMPLETED', minutesFromNow(6)), { secret: 'sk_test_wrong' });
    const empty = await fetch(`${BASE}/delivery/lalamove/webhook`, { method: 'POST' });
    expect('a webhook with a wrong signature is rejected (401); an empty ping gets 200', forged.status === 401 && empty.status === 200);

    replacement.status = 'COMPLETED';
    replacement.stops[1].POD = { status: 'DELIVERED', deliveredAt: new Date().toISOString() };
    await lalamoveWebhook('ORDER_STATUS_CHANGED', statusEvent(replacement.orderId, 'COMPLETED', minutesFromNow(9)));
    const delivered = await waitFor(async () => {
        const f = await fulfillmentOf(orderA.id, lalamove.id);
        return f.state === 'Delivered' && f;
    });
    expect('completed → fulfillment Delivered', delivered?.customFields.shipmentStatus === 'delivered' && !!delivered?.customFields.lastEventAt, delivered?.customFields.lastEventAt);

    const getsBeforeLate = lm.calls.get;
    await lalamoveWebhook('ORDER_STATUS_CHANGED', statusEvent(replacement.orderId, 'PICKED_UP', minutesFromNow(7)));
    await sleep(2500);
    const afterLate = await fulfillmentOf(orderA.id, lalamove.id);
    expect(
        'an older event arriving late changes nothing (no re-fetch)',
        afterLate.state === 'Delivered' && afterLate.customFields.shipmentStatus === 'delivered' && lm.calls.get === getsBeforeLate,
    );

    // 7 · The hand-booked courier follows staff actions
    await transition(manual.id, 'Shipped');
    const manualShipped = await waitFor(async () => (await fulfillmentOf(orderA.id, manual.id)).customFields.shipmentStatus === 'in_transit');
    await transition(manual.id, 'Delivered');
    const manualDelivered = await waitFor(async () => {
        const order = await adminOrder(orderA.id);
        return order.state === 'Delivered' && order.fulfillments.find(f => f.id === manual.id).customFields.shipmentStatus === 'delivered' && order;
    });
    expect('manual-courier: Shipped/Delivered by staff, order A Delivered', manualShipped && manualDelivered, manualDelivered?.state);

    // 8 · EasyParcel webhooks (secret URL; the body is never trusted) and the reconcile task
    const shipmentNumber = easyparcel.customFields.providerOrderId;
    const shipment = ep.shipments.get(shipmentNumber);
    const post = (url, body) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const wrongSecret = await post(webhookUrl.replace(/[0-9a-f]{40}$/, '0'.repeat(40)), { topic: 'shipment.status.update', shipment_number: shipmentNumber });
    expect('EasyParcel webhook with a wrong secret → 404', wrongSecret.status === 404);

    Object.assign(shipment, {
        awb: '7028021894371796',
        awbUrl: `https://app.easyparcel.com/portal/v2/public/label/${shipmentNumber}/3972206?format=A4`,
        trackingUrl: 'https://app.easyparcel.com/tools/easytrack/details?courier=PosLaju&awb=7028021894371796',
    });
    await post(webhookUrl, { topic: 'shipment.awb.update', shipment_number: shipmentNumber, uuid: `awb-${RUN}`, timestamp: '2026-10-09 11:40:00', awb_number: '7028021894371796' });
    const withAwb = await waitFor(async () => {
        const f = await fulfillmentOf(orderB.id, easyparcel.id);
        return f.trackingCode === '7028021894371796' && f;
    });
    expect(
        'AWB update: trackingCode = AWB, A6 label and tracking links',
        withAwb && withAwb.customFields.labelUrl?.endsWith('format=A6') && withAwb.customFields.trackingUrl?.includes('easytrack'),
        withAwb?.customFields.labelUrl,
    );

    const detailsBefore = ep.calls['shipment/tracking_status'] ?? 0;
    await post(webhookUrl, { topic: 'shipment.tracking.update', shipment_number: shipmentNumber, uuid: `fake-${RUN}`, awb_number: '7028021894371796', latest_shipment_status_code: 5, latest_tracking_status: 'Delivered' });
    await waitFor(() => (ep.calls['shipment/tracking_status'] ?? 0) > detailsBefore);
    await sleep(500);
    const notFooled = await fulfillmentOf(orderB.id, easyparcel.id);
    expect('a webhook claiming "delivered" is checked with EasyParcel first (still booked)', notFooled.state === 'Pending' && notFooled.customFields.shipmentStatus === 'booked');

    Object.assign(shipment, { code: 3, text: 'Parcel has been collected at Kuala Lumpur', eventDate: '2026-10-09 15:00:00' });
    await post(webhookUrl, { topic: 'shipment.status.update', shipment_number: shipmentNumber, awb_number: '7028021894371796', event_date: '2026-10-09 15:00:00', shipment_status: 'Collected', shipment_status_code: 3 });
    const collected = await waitFor(async () => {
        const f = await fulfillmentOf(orderB.id, easyparcel.id);
        return f.state === 'Shipped' && f;
    });
    expect('collected → fulfillment Shipped, status picked_up', collected?.customFields.shipmentStatus === 'picked_up');

    Object.assign(shipment, { code: 5, text: 'Delivered to recipient', eventDate: '2026-10-10 10:30:00' });
    const run = await admin.q(`mutation{ runScheduledTask(id: "couriers-my-reconcile"){ success } }`);
    const reconciled = await waitFor(async () => {
        const order = await adminOrder(orderB.id);
        return order.state === 'Delivered' && order;
    }, 45_000);
    expect(
        'reconcile task (no webhook) → fulfillment and order B Delivered',
        run.runScheduledTask.success && reconciled?.fulfillments[0].customFields.shipmentStatus === 'delivered',
        reconciled?.fulfillments[0].customFields.lastEventAt,
    );

    // 9 · Cancelling a Lalamove booking
    const googleCalls = google.calls;
    const toCancel = await fulfil([orderC.lines[0]], 'lalamove', {});
    expect('the geocode of a known address comes from the cache', toCancel.__typename === 'Fulfillment' && google.calls === googleCalls);
    const cancelled = await transition(toCancel.id, 'Cancelled');
    const cancelledStatus = await waitFor(async () => (await fulfillmentOf(orderC.id, toCancel.id)).customFields.shipmentStatus === 'cancelled');
    expect('cancelling the fulfillment cancels the Lalamove order', cancelled.state === 'Cancelled' && cancelledStatus && lm.orders.get(toCancel.trackingCode).status === 'CANCELED');
    const rebooked = await fulfil([orderC.lines[0]], 'lalamove', { serviceType: 'CAR' });
    lm.orders.get(rebooked.trackingCode).cancellable = false;
    const refused = await transition(rebooked.id, 'Cancelled');
    expect(
        'a cancellation Lalamove refuses keeps the fulfillment, with the reason',
        refused.__typename === 'FulfillmentStateTransitionError' && /no longer allows cancelling/.test(refused.transitionError) && (await fulfillmentOf(orderC.id, rebooked.id)).state === 'Pending',
        refused.transitionError,
    );
    lm.orders.get(rebooked.trackingCode).status = 'EXPIRED';
    const afterExpiry = await transition(rebooked.id, 'Cancelled');
    expect('an order that already ended at Lalamove can be cancelled here', afterExpiry.state === 'Cancelled', afterExpiry.state ?? afterExpiry.transitionError);

    // 10 · Setup helpers
    const registered = await fetch(`${BASE}/delivery/lalamove/register-webhook`, { method: 'POST', headers: asAdmin() }).then(r => r.json());
    const serviceTypes = await fetch(`${BASE}/delivery/lalamove/service-types`, { headers: asAdmin() }).then(r => r.json());
    expect('Lalamove webhook registration and service types', registered.url === `${BASE}/delivery/lalamove/webhook` && lm.webhookUrl === registered.url && serviceTypes[0].serviceTypes.includes('MOTORCYCLE'));

    // 11 · What the customer sees: Shop API order and emails
    const shopOrder = await shop.q(`query($code:String!){ orderByCode(code:$code){ state fulfillments { state method trackingCode customFields { trackingUrl shipmentStatus } } } }`, { code: orderA.code });
    const shopFulfillments = shopOrder.orderByCode.fulfillments;
    expect(
        'Shop API: order A Delivered with tracking codes, links and statuses',
        shopOrder.orderByCode.state === 'Delivered' && shopFulfillments.length === 2 && shopFulfillments.every(f => f.trackingCode && f.customFields.trackingUrl && f.customFields.shipmentStatus === 'delivered'),
        JSON.stringify(shopFulfillments),
    );
    const shopOrderB = await shop.q(`query($code:String!){ orderByCode(code:$code){ state fulfillments { trackingCode customFields { trackingUrl shipmentStatus } } } }`, { code: orderB.code });
    expect('Shop API: order B Delivered with the AWB', shopOrderB.orderByCode.state === 'Delivered' && shopOrderB.orderByCode.fulfillments[0].trackingCode === '7028021894371796');
    const hidden = await shop.raw(`query($code:String!){ orderByCode(code:$code){ fulfillments { customFields { labelUrl providerOrderId } } } }`, { code: orderA.code });
    expect('Shop API does not expose label or booking ids', !!hidden.errors);

    const emails = await waitFor(() => {
        const found = emailsFor(CUSTOMER_EMAIL);
        const shippedCount = found.filter(e => e.subject.includes('is on its way')).length;
        const deliveredCount = found.filter(e => e.subject.includes('has been delivered')).length;
        return shippedCount >= 3 && deliveredCount >= 3 && found;
    }, 30_000);
    const shippedLalamove = emails?.find(e => e.subject === `Your order ${orderA.code} is on its way` && e.body.includes(replacement.orderId));
    expect(
        'customer emails: shipped (with tracking link) and delivered for each shipment',
        !!emails && !!shippedLalamove,
        emails ? emails.filter(e => !e.subject.startsWith('Order confirmation')).map(e => e.subject).join(' | ') : 'no emails',
    );

    const errors = [server, worker].flatMap(child => child.log().split('\n').filter(line => /^error /.test(line)));
    expect('no errors logged by the server or worker', errors.length === 0, errors.slice(0, 3).join(' / '));
    expect('every Lalamove request was correctly signed', lm.badSignatures === 0);
}

try {
    await main();
} catch (error) {
    results.push(false);
    console.log(`FAIL  ${error.message}`);
    for (const child of children) console.log(child.log?.().split('\n').slice(-25).join('\n'));
} finally {
    await stopAll();
}
const pluginLog = children.flatMap(child => (child.log?.() ?? '').split('\n').filter(line => line.includes('[CouriersMy]')));
if (pluginLog.length) console.log(`\nPlugin log (server and worker):\n${pluginLog.map(line => `  ${line.trim()}`).join('\n')}`);
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.length && results.every(Boolean) ? 0 : 1);
