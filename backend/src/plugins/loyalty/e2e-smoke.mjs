// End-to-end smoke test of the loyalty and staff-permissions plugins through the Shop and Admin APIs.
// Needs a running server set up from stores/moire, with the loyalty promotion (setupLoyalty). From backend/:
//   npx ts-node --transpile-only src/index.ts      (in another terminal; or npm run dev), then
//   node src/plugins/loyalty/e2e-smoke.mjs
// Each run creates a customer, two staff accounts and a few orders: use a development database.
import 'dotenv/config';

const BASE = process.env.VENDURE_URL || `http://localhost:${process.env.VENDURE_SERVER_PORT || 3000}`;
const results = [];

/** A GraphQL session (its own auth token) on the shop-api or admin-api. */
function session(path) {
    let token = null;
    return async (query, variables = {}) => {
        const res = await fetch(`${BASE}/${path}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify({ query, variables }),
        });
        token = res.headers.get('vendure-auth-token') ?? token;
        const body = await res.json();
        return body.errors ? { error: body.errors[0].message, code: body.errors[0].extensions?.code } : body.data;
    };
}

function expect(name, ok, detail = '') {
    results.push(Boolean(ok));
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}
const rm = sen => `RM ${(sen / 100).toFixed(2)}`;

const LOGIN = `mutation($u: String!, $p: String!) { login(username: $u, password: $p) { ... on CurrentUser { id } ... on ErrorResult { message } } }`;
const ORDER_FIELDS = `id code state subTotalWithTax shippingWithTax totalWithTax customFields { loyaltyPointsApplied } discounts { description amountWithTax }
                      lines { id quantity productVariant { sku } }`;
const APPLY = `mutation($points: Int!) { applyLoyaltyPoints(points: $points) {
    __typename ... on Order { ${ORDER_FIELDS} } ... on LoyaltyPointsError { errorCode message } } }`;
const BALANCE = `{ activeCustomer { id customFields { loyaltyPoints } } }`;
const HISTORY = `{ loyaltyHistory(options: { take: 20 }) { totalItems items { points reason note orderCode } } }`;
const ADJUST = `mutation($id: ID!, $points: Int!, $note: String!) { adjustLoyaltyPoints(customerId: $id, points: $points, note: $note) { id customFields { loyaltyPoints } } }`;
const ADMIN_ORDER = `query($id: ID!) { order(id: $id) { id code state payments { id state } fulfillments { id state method trackingCode } lines { id quantity } } }`;

const admin = session('admin-api');
const shop = session('shop-api');
const stamp = Date.now();

async function variantIds() {
    const d = await shop(`{ products(options: { take: 100 }) { items { variants { id sku } } } }`);
    return new Map(d.products.items.flatMap(p => p.variants.map(v => [v.sku, v.id])));
}

async function addItem(client, variants, sku, quantity) {
    const d = await client(
        `mutation($id: ID!, $q: Int!) { addItemToOrder(productVariantId: $id, quantity: $q) { ... on Order { ${ORDER_FIELDS} } ... on ErrorResult { errorCode message } } }`,
        { id: variants.get(sku), q: quantity },
    );
    return d.addItemToOrder;
}

/** Address, delivery, ArrangingPayment and the test payment (authorised, settled later by staff). */
async function checkout(client) {
    await client(`mutation { setOrderShippingAddress(input: { fullName: "Mei Tan", streetLine1: "1 Jalan Test", city: "Kuala Lumpur", postalCode: "50450",
                  province: "Kuala Lumpur", countryCode: "MY", phoneNumber: "+60123456789" }) { ... on Order { id } ... on ErrorResult { message } } }`);
    const { eligibleShippingMethods } = await client(`{ eligibleShippingMethods { id } }`);
    await client(`mutation($id: [ID!]!) { setOrderShippingMethod(shippingMethodId: $id) { ... on Order { id } ... on ErrorResult { message } } }`, {
        id: [eligibleShippingMethods[0].id],
    });
    const t = await client(`mutation { transitionOrderToState(state: "ArrangingPayment") {
        ... on Order { id state } ... on OrderStateTransitionError { transitionError } } }`);
    if (t.transitionOrderToState?.transitionError) return { refused: t.transitionOrderToState.transitionError };
    const { eligiblePaymentMethods } = await client(`{ eligiblePaymentMethods { code } }`);
    const p = await client(`mutation($input: PaymentInput!) { addPaymentToOrder(input: $input) {
        ... on Order { ${ORDER_FIELDS} payments { id state } } ... on ErrorResult { errorCode message } } }`, {
        input: { method: eligiblePaymentMethods[0].code, metadata: {} },
    });
    return p.addPaymentToOrder;
}

async function settle(order) {
    const d = await admin(`mutation($id: ID!) { settlePayment(id: $id) { ... on Payment { id state } ... on ErrorResult { message } } }`, {
        id: order.payments[0].id,
    });
    return d.settlePayment;
}

const balance = async () => (await shop(BALANCE)).activeCustomer?.customFields.loyaltyPoints;
const orderState = async id => (await admin(ADMIN_ORDER, { id })).order.state;

async function main() {
    // ── Staff session and the loyalty promotion ───────────────────────────────
    const a = await admin(LOGIN, { u: process.env.SUPERADMIN_USERNAME, p: process.env.SUPERADMIN_PASSWORD });
    if (!a.login?.id) throw new Error(`Admin login failed: ${JSON.stringify(a)}`);
    const promos = await admin(`{ promotions(options: { take: 100 }) { items { id name enabled actions { code } } } }`);
    const promo = promos.promotions.items.find(p => p.actions.some(x => x.code === 'loyalty_points_discount'));
    expect('the loyalty points promotion exists (setupLoyalty)', promo?.enabled, promo ? `#${promo.id} "${promo.name}"` : 'run setupLoyalty(app, ctx) first');
    if (!promo) return;

    const settings = (await shop(`{ loyaltySettings { pointsPerRinggit pointValueSen minRedeemPoints maxRedeemPercent } }`)).loyaltySettings;
    expect('loyaltySettings is public', settings?.minRedeemPoints === 500, JSON.stringify(settings));
    const guestHistory = await shop(HISTORY);
    expect('loyaltyHistory needs a signed-in customer', guestHistory.code === 'FORBIDDEN', guestHistory.code);

    // ── A registered customer ────────────────────────────────────────────────
    const email = `member-${stamp}@example.com`;
    const password = `points-${stamp}`;
    const created = await admin(
        `mutation($input: CreateCustomerInput!, $password: String) { createCustomer(input: $input, password: $password) {
            ... on Customer { id emailAddress } ... on ErrorResult { message } } }`,
        { input: { firstName: 'Mei', lastName: 'Tan', emailAddress: email }, password },
    );
    const customerId = created.createCustomer.id;
    const login = await shop(LOGIN, { u: email, p: password });
    expect('customer created (verified, via Admin API) and signed in', login.login?.id, email);
    expect('a new customer starts with 0 points', (await balance()) === 0);

    const variants = await variantIds();

    // ── Earn: 3 × RM 188 = RM 564 → 564 points, on PaymentSettled ────────────
    await addItem(shop, variants, 'spring-blessings-box', 3);
    const order1 = await checkout(shop);
    expect('order 1 placed with the test payment', order1.state === 'PaymentAuthorized', `${order1.code}: items ${rm(order1.subTotalWithTax)} + delivery ${rm(order1.shippingWithTax)}`);
    expect('no points before the payment is settled', (await balance()) === 0);
    const settled1 = await settle(order1);
    expect('staff settle the payment', settled1.state === 'Settled', `order ${await orderState(order1.id)}`);
    let points = await balance();
    expect('points earned on the products total, delivery excluded: floor(RM 564) × 1', points === 564, `${points} points`);
    let history = (await shop(HISTORY)).loyaltyHistory;
    expect('history shows the earned entry with its order', history.items[0]?.reason === 'earned' && history.items[0]?.orderCode === order1.code, JSON.stringify(history.items[0]));

    // Reaching PaymentSettled again (after an order modification) must not earn twice.
    const toModifying = await admin(`mutation($id: ID!) { transitionOrderToState(id: $id, state: "Modifying") { ... on Order { state } ... on OrderStateTransitionError { transitionError } } }`, { id: order1.id });
    const backToSettled = await admin(`mutation($id: ID!) { transitionOrderToState(id: $id, state: "PaymentSettled") { ... on Order { state } ... on OrderStateTransitionError { transitionError } } }`, { id: order1.id });
    points = await balance();
    expect('earning is once per order (PaymentSettled reached twice)', toModifying.transitionOrderToState?.state === 'Modifying' && backToSettled.transitionOrderToState?.state === 'PaymentSettled' && points === 564,
        `${points} points, ${(await shop(HISTORY)).loyaltyHistory.totalItems} entry`);

    // ── Staff adjustment ─────────────────────────────────────────────────────
    let r = await admin(ADJUST, { id: customerId, points: 100, note: 'Welcome bonus' });
    expect('staff add 100 points with a note', r.adjustLoyaltyPoints?.customFields.loyaltyPoints === 664, `balance ${r.adjustLoyaltyPoints?.customFields.loyaltyPoints}`);
    r = await admin(ADJUST, { id: customerId, points: -1000, note: 'Too much' });
    expect('staff can’t take the balance below 0', r.error, r.error);
    r = await admin(ADJUST, { id: customerId, points: 50, note: '  ' });
    expect('a staff adjustment needs a note', r.error, r.error);
    const staffView = await admin(`query($id: ID!) { customerLoyaltyHistory(customerId: $id, options: { take: 5 }) { totalItems items { points reason note orderCode administratorName } } }`, { id: customerId });
    expect('Admin API customerLoyaltyHistory shows who adjusted', staffView.customerLoyaltyHistory?.items[0]?.administratorName, JSON.stringify(staffView.customerLoyaltyHistory?.items[0]));

    // ── Redeem on a new order: RM 188 box ────────────────────────────────────
    await addItem(shop, variants, 'spring-blessings-box', 1);
    r = (await shop(APPLY, { points: 400 })).applyLoyaltyPoints;
    expect('fewer than 500 points are refused', r.__typename === 'LoyaltyPointsError', r.message);
    r = (await shop(APPLY, { points: 700 })).applyLoyaltyPoints;
    expect('more points than the balance are refused', r.__typename === 'LoyaltyPointsError', r.message);
    r = (await shop(APPLY, { points: 600 })).applyLoyaltyPoints;
    const discount = r.discounts?.find(d => d.description === promo.name);
    expect('600 points take RM 6.00 off through the promotion', r.__typename === 'Order' && discount?.amountWithTax === -600 && r.subTotalWithTax === 18200,
        `items ${rm(r.subTotalWithTax)}, discounts ${JSON.stringify(r.discounts)}, loyaltyPointsApplied ${r.customFields?.loyaltyPointsApplied}`);
    expect('points stay in the balance until the order is placed', (await balance()) === 664);
    const line = r.lines[0];
    r = (await shop(`mutation($id: ID!) { adjustOrderLine(orderLineId: $id, quantity: 2) { ... on Order { ${ORDER_FIELDS} } } }`, { id: line.id })).adjustOrderLine;
    expect('the discount follows bag changes', r.subTotalWithTax === 2 * 18800 - 600, `items ${rm(r.subTotalWithTax)}`);
    r = (await shop(APPLY, { points: 0 })).applyLoyaltyPoints;
    expect('0 removes the points', r.__typename === 'Order' && r.discounts.length === 0 && r.customFields.loyaltyPointsApplied === 0, `items ${rm(r.subTotalWithTax)}`);
    await shop(`mutation($id: ID!) { adjustOrderLine(orderLineId: $id, quantity: 1) { ... on Order { id } } }`, { id: line.id });
    r = (await shop(APPLY, { points: 600 })).applyLoyaltyPoints;
    const order2 = await checkout(shop);
    points = await balance();
    expect('placing the order takes the 600 points', order2.state === 'PaymentAuthorized' && points === 64,
        `${order2.code}: total ${rm(order2.totalWithTax)} (RM 188.00 − RM 6.00 + delivery), balance ${points}`);
    history = (await shop(HISTORY)).loyaltyHistory;
    expect('history shows the redemption', history.items[0]?.reason === 'redeemed' && history.items[0]?.points === -600, JSON.stringify(history.items[0]));

    // ── Cancellations reverse ───────────────────────────────────────────────
    const CANCEL = `mutation($id: ID!) { cancelOrder(input: { orderId: $id, reason: "Smoke test" }) { ... on Order { id state } ... on ErrorResult { errorCode message } } }`;
    r = await admin(CANCEL, { id: order2.id });
    points = await balance();
    expect('cancelling the order gives the 600 points back', r.cancelOrder?.state === 'Cancelled' && points === 664, `balance ${points}`);
    r = await admin(CANCEL, { id: order1.id });
    points = await balance();
    expect('cancelling the settled order takes its 564 earned points back', r.cancelOrder?.state === 'Cancelled' && points === 100, `balance ${points}`);
    history = (await shop(HISTORY)).loyaltyHistory;
    console.log('      history:', history.items.map(i => `${i.points > 0 ? '+' : ''}${i.points} ${i.reason}${i.orderCode ? ` ${i.orderCode}` : ''}${i.note ? ` (${i.note})` : ''}`).join(' | '));

    // ── Half the subtotal at most, and the check before payment ──────────────
    await admin(ADJUST, { id: customerId, points: 10000, note: 'Test top-up' });
    await addItem(shop, variants, 'coffee-gift-set--whole-bean', 1); // RM 138
    r = (await shop(APPLY, { points: 7000 })).applyLoyaltyPoints;
    expect('points over half the items are refused', r.__typename === 'LoyaltyPointsError', r.message);
    r = (await shop(APPLY, { points: 6900 })).applyLoyaltyPoints;
    expect('exactly half the items is allowed', r.__typename === 'Order' && r.subTotalWithTax === 6900, `items ${rm(r.subTotalWithTax)}`);
    await admin(ADJUST, { id: customerId, points: -9600, note: 'Test: spent elsewhere' });
    const refused = await checkout(shop);
    expect('checkout stops when the balance no longer covers the points', refused.refused, refused.refused);
    r = (await shop(APPLY, { points: 0 })).applyLoyaltyPoints;
    const order3 = await checkout(shop);
    expect('without points the order goes through', order3.state === 'PaymentAuthorized', order3.code);
    await settle(order3);
    points = await balance();
    expect('order 3 earns floor(RM 138) points', points === 500 + 138, `balance ${points}`);

    // Removing points always works, even from a bag that has been emptied.
    await addItem(shop, variants, 'leather-journal', 1);
    r = (await shop(APPLY, { points: 500 })).applyLoyaltyPoints;
    await shop(`mutation { removeAllOrderLines { ... on Order { id } ... on ErrorResult { message } } }`);
    r = (await shop(APPLY, { points: 0 })).applyLoyaltyPoints;
    expect('points can be removed from an emptied bag', r.__typename === 'Order' && r.customFields.loyaltyPointsApplied === 0, r.message ?? `balance ${await balance()}`);

    // ── Guests don't earn ────────────────────────────────────────────────────
    const guest = session('shop-api');
    await addItem(guest, variants, 'notebook-and-pen-set', 1);
    r = (await guest(APPLY, { points: 500 })).applyLoyaltyPoints;
    expect('guests can’t use points', r.__typename === 'LoyaltyPointsError', r.message);
    const guestEmail = `guest-${stamp}@example.com`;
    await guest(`mutation($e: String!) { setCustomerForOrder(input: { emailAddress: $e, firstName: "Guest", lastName: "Buyer" }) { ... on Order { id } ... on ErrorResult { message } } }`, { e: guestEmail });
    const guestOrder = await checkout(guest);
    await settle(guestOrder);
    const guestCustomer = (await admin(`query($e: String!) { customers(options: { filter: { emailAddress: { eq: $e } } }) { items { id customFields { loyaltyPoints } } } }`, { e: guestEmail })).customers.items[0];
    const guestLedger = await admin(`query($id: ID!) { customerLoyaltyHistory(customerId: $id) { totalItems } }`, { id: guestCustomer.id });
    expect('a guest order earns nothing', (await orderState(guestOrder.id)) === 'PaymentSettled' && guestCustomer.customFields.loyaltyPoints === 0 && guestLedger.customerLoyaltyHistory.totalItems === 0,
        `${guestOrder.code} settled, guest balance ${guestCustomer.customFields.loyaltyPoints}`);
    await admin(CANCEL, { id: guestOrder.id }); // releases the stock again

    // ── Packer: ReadOrder + ShipOrder, no UpdateOrder ────────────────────────
    const role = await admin(`mutation($input: CreateRoleInput!) { createRole(input: $input) { id code permissions } }`, {
        input: {
            code: `packer-smoke-${stamp}`,
            description: 'Smoke test packer',
            permissions: ['ReadCatalog', 'ReadOrder', 'ShipOrder', 'ReadShippingMethod', 'ReadStockLocation', 'ReadCountry', 'ReadZone'],
        },
    });
    expect('a packer role with ShipOrder and without UpdateOrder', role.createRole && !role.createRole.permissions.includes('UpdateOrder'), role.createRole?.permissions.join(', ') ?? role.error);
    const packerEmail = `packer-${stamp}@example.com`;
    await admin(`mutation($input: CreateAdministratorInput!) { createAdministrator(input: $input) { id } }`, {
        input: { firstName: 'Pat', lastName: 'Packer', emailAddress: packerEmail, password, roleIds: [role.createRole.id] },
    });
    const packer = session('admin-api');
    await packer(LOGIN, { u: packerEmail, p: password });
    const seen = await packer(ADMIN_ORDER, { id: order3.id });
    expect('the packer can read the order', seen.order?.state === 'PaymentSettled', `${seen.order?.code} ${seen.order?.state}`);
    const handlers = await packer(`{ fulfillmentHandlers { code args { name } } }`);
    expect('the packer can list fulfilment handlers', handlers.fulfillmentHandlers?.length, handlers.fulfillmentHandlers?.map(h => h.code).join(', '));
    const shipped = await packer(
        `mutation($input: ShipOrderInput!) { shipOrder(input: $input) { __typename ... on Fulfillment { id state method trackingCode } ... on ErrorResult { errorCode message } } }`,
        { input: { orderId: order3.id, handler: { code: 'manual-fulfillment', arguments: [{ name: 'method', value: 'GDex' }, { name: 'trackingCode', value: 'GD123456789' }] } } },
    );
    expect('shipOrder works for the packer (all unshipped items)', shipped.shipOrder?.state === 'Shipped', `${JSON.stringify(shipped.shipOrder ?? shipped)}; order ${await orderState(order3.id)}`);
    const delivered = await packer(`mutation($id: ID!) { markFulfillmentDelivered(fulfillmentId: $id) { __typename ... on Fulfillment { id state } ... on ErrorResult { message } } }`, {
        id: shipped.shipOrder?.id,
    });
    expect('markFulfillmentDelivered works for the packer', delivered.markFulfillmentDelivered?.state === 'Delivered', `order ${await orderState(order3.id)}`);

    const paymentId = seen.order.payments[0].id;
    const forbidden = {
        refundOrder: await packer(`mutation($id: ID!) { refundOrder(input: { paymentId: $id, amount: 100, reason: "test" }) { ... on Refund { id } ... on ErrorResult { message } } }`, { id: paymentId }),
        settlePayment: await packer(`mutation($id: ID!) { settlePayment(id: $id) { ... on Payment { id } ... on ErrorResult { message } } }`, { id: paymentId }),
        updateProduct: await packer(`mutation($id: ID!) { updateProduct(input: { id: $id, enabled: true }) { id } }`, {
            id: (await packer(`{ products(options: { take: 1 }) { items { id } } }`)).products.items[0].id,
        }),
        addFulfillmentToOrder: await packer(`mutation { addFulfillmentToOrder(input: { lines: [], handler: { code: "manual-fulfillment", arguments: [] } }) { ... on Fulfillment { id } } }`),
        cancelOrder: await packer(CANCEL, { id: order3.id }),
    };
    for (const [operation, result] of Object.entries(forbidden)) {
        expect(`the packer gets FORBIDDEN for ${operation}`, result.code === 'FORBIDDEN', result.code ?? JSON.stringify(result));
    }

    // Staff without ShipOrder can't use it.
    const readerRole = await admin(`mutation($input: CreateRoleInput!) { createRole(input: $input) { id } }`, {
        input: { code: `order-reader-smoke-${stamp}`, description: 'Smoke test reader', permissions: ['ReadOrder'] },
    });
    const readerEmail = `reader-${stamp}@example.com`;
    await admin(`mutation($input: CreateAdministratorInput!) { createAdministrator(input: $input) { id } }`, {
        input: { firstName: 'Rae', lastName: 'Reader', emailAddress: readerEmail, password, roleIds: [readerRole.createRole.id] },
    });
    const reader = session('admin-api');
    await reader(LOGIN, { u: readerEmail, p: password });
    const notAllowed = await reader(`mutation($input: ShipOrderInput!) { shipOrder(input: $input) { __typename } }`, {
        input: { orderId: order3.id, handler: { code: 'manual-fulfillment', arguments: [] } },
    });
    expect('staff without ShipOrder get FORBIDDEN for shipOrder', notAllowed.code === 'FORBIDDEN', notAllowed.code);
}

try {
    await main();
} catch (e) {
    expect('smoke test ran to the end', false, e instanceof Error ? e.stack : String(e));
}
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.length && results.every(Boolean) ? 0 : 1);
