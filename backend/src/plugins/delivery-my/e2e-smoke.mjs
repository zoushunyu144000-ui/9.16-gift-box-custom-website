// Drives a running server through the Shop API: delivery promises, quotes, and checkout with a preferred date.
// Needs a shop set up from stores/moire with setupDeliveryMethods() run (Same-day + Courier delivery methods).
//   npm run dev   (or: npx ts-node --transpile-only src/index.ts), then
//   SHOP_API_URL=http://localhost:3000/shop-api node src/plugins/delivery-my/e2e-smoke.mjs
const API = process.env.SHOP_API_URL || `http://localhost:${process.env.VENDURE_SERVER_PORT || 3000}/shop-api`;
let token = null;
const results = [];

async function gql(query, variables = {}) {
    const res = await fetch(API, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ query, variables }),
    });
    token = res.headers.get('vendure-auth-token') ?? token;
    const body = await res.json();
    if (body.errors) throw new Error(body.errors.map(e => e.message).join('; '));
    return body.data;
}
function expect(name, ok, detail = '') {
    results.push(Boolean(ok));
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}
const rm = sen => `RM ${(sen / 100).toFixed(2)}`;
const addDays = (date, days) => {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
};
const weekday = date => new Date(`${date}T00:00:00Z`).getUTCDay();

const skuIds = new Map();
for (const p of (await gql('{ products(options:{take:100}) { items { variants { id sku } } } }')).products.items) {
    for (const v of p.variants) skuIds.set(v.sku, v.id);
}
const line = (sku, quantity) => ({ productVariantId: skuIds.get(sku), quantity });

// 1 · Delivery promise by postcode
console.log('\n— deliveryPromise');
const PROMISE = 'query($pc:String!){ deliveryPromise(postalCode:$pc){ zone zoneLabel sameDayAvailable earliestDispatchDate cutoffTime closedDates message } }';
const zones = [
    ['50450', 'klang-valley'],
    ['47301', 'klang-valley'],
    ['62000', 'peninsular'], // Putrajaya, unless includePutrajaya
    ['10200', 'peninsular'],
    ['87000', 'sabah-labuan'],
    ['88000', 'sabah-labuan'],
    ['93050', 'sarawak'],
    ['99999', 'unknown'],
];
let kl;
for (const [postcode, zone] of zones) {
    const p = (await gql(PROMISE, { pc: postcode })).deliveryPromise;
    if (postcode === '50450') kl = p;
    expect(`${postcode} → ${zone}`, p.zone === zone, `${p.zoneLabel}; same day ${p.sameDayAvailable}; dispatch ${p.earliestDispatchDate}; “${p.message}”`);
}
const sundays = kl.closedDates.filter(d => weekday(d) === 0);
expect(
    'cut-off is 15:00; closed dates list the next 90 days’ Sundays',
    kl.cutoffTime === '15:00' && sundays.length >= 12 && sundays.every((d, i) => i === 0 || addDays(sundays[i - 1], 7) === d),
    `${kl.closedDates.length} dates, first ${kl.closedDates.slice(0, 3).join(', ')}`,
);
expect('outstation never offers same day', !(await gql(PROMISE, { pc: '10200' })).deliveryPromise.sameDayAvailable);

// 2 · Delivery quote for a basket, before there is an order
console.log('\n— deliveryQuote');
const QUOTE = 'query($input:DeliveryQuoteInput!){ deliveryQuote(input:$input){ id code name description priceWithTax } }';
const basketKL = [line('spring-blessings-box', 2)];
const basketPenang = [line('spring-blessings-box', 1), line('reunion-tea-box--standard', 2)];
const quoteKL = (await gql(QUOTE, { input: { postalCode: '50450', lines: basketKL } })).deliveryQuote;
const quotePenang = (await gql(QUOTE, { input: { postalCode: '10200', province: 'Pulau Pinang', lines: basketPenang } })).deliveryQuote;
for (const [where, quote] of [['KL 50450, 2 × New Year Cookie Box', quoteKL], ['Penang 10200, 1 Cookie Box + 2 Reunion Tea Box', quotePenang]]) {
    console.log(`      ${where}: ${quote.map(q => `${q.name} ${rm(q.priceWithTax)}`).join(' | ') || 'nothing offered'}`);
}
expect('KL basket: same-day delivery only', quoteKL.length === 1 && quoteKL[0].code === 'same-day-delivery', rm(quoteKL[0]?.priceWithTax ?? 0));
expect('Penang basket: courier delivery only', quotePenang.length === 1 && quotePenang[0].code === 'courier-delivery', rm(quotePenang[0]?.priceWithTax ?? 0));

// 3 · Checkout: prices match the quote, and the preferred date is checked before payment
console.log('\n— checkout');
const ORDER = '... on Order { id code state totalWithTax shippingWithTax customFields { preferredDeliveryDate deliveryNotes } } ... on ErrorResult { errorCode message }';
await gql(`mutation($id:ID!){ addItemToOrder(productVariantId:$id, quantity:2){ ${ORDER} } }`, { id: skuIds.get('spring-blessings-box') });
await gql('mutation{ setCustomerForOrder(input:{ emailAddress:"delivery-smoke@example.com", firstName:"Delivery", lastName:"Smoke" }){ ... on Order { id } ... on ErrorResult { message } } }');
const setAddress = (postalCode, city, province) =>
    gql(`mutation($input:CreateAddressInput!){ setOrderShippingAddress(input:$input){ ${ORDER} } }`, {
        input: { fullName: 'Recipient', streetLine1: '1 Jalan Test', city, province, postalCode, countryCode: 'MY', phoneNumber: '+60123456789' },
    });
const eligible = async () => (await gql('{ eligibleShippingMethods { id code name priceWithTax metadata } }')).eligibleShippingMethods;

await setAddress('10200', 'George Town', 'Pulau Pinang');
const penangMethods = await eligible();
const penangQuote = (await gql(QUOTE, { input: { postalCode: '10200', lines: basketKL } })).deliveryQuote;
expect('Penang checkout price = deliveryQuote for the same bag', penangMethods.length === 1 && penangMethods[0].priceWithTax === penangQuote[0]?.priceWithTax, `${penangMethods[0]?.name} ${rm(penangMethods[0]?.priceWithTax ?? 0)}, ${JSON.stringify(penangMethods[0]?.metadata)}`);

await setAddress('50450', 'Kuala Lumpur', 'Wilayah Persekutuan Kuala Lumpur');
const klMethods = await eligible();
expect('KL checkout price = deliveryQuote for the same bag', klMethods.length === 1 && klMethods[0].priceWithTax === quoteKL[0]?.priceWithTax, `${klMethods[0]?.name} ${rm(klMethods[0]?.priceWithTax ?? 0)}, ${JSON.stringify(klMethods[0]?.metadata)}`);
await gql('mutation($id:[ID!]!){ setOrderShippingMethod(shippingMethodId:$id){ ... on Order { id } ... on ErrorResult { message } } }', { id: [klMethods[0].id] });

const setDate = (date, notes) =>
    gql(`mutation($cf:UpdateOrderCustomFieldsInput!){ setOrderCustomFields(input:{ customFields:$cf }){ ${ORDER} } }`, {
        cf: { preferredDeliveryDate: date, ...(notes ? { deliveryNotes: notes } : {}) },
    });
const toPayment = async () =>
    (await gql('mutation{ transitionOrderToState(state:"ArrangingPayment"){ ... on Order { state totalWithTax } ... on OrderStateTransitionError { transitionError } } }')).transitionOrderToState;

let sunday = kl.earliestDispatchDate;
while (weekday(sunday) !== 0) sunday = addDays(sunday, 1);
await setDate(sunday);
let r = await toPayment();
expect(`a Sunday (${sunday}) is refused`, r.transitionError && !r.state, r.transitionError);

const dayBefore = addDays(kl.earliestDispatchDate, -1);
await setDate(dayBefore);
r = await toPayment();
expect(`a date before the earliest dispatch date (${dayBefore}) is refused`, r.transitionError && !r.state, r.transitionError);

const order = (await setDate(kl.earliestDispatchDate, 'Leave it with the guard house.')).setOrderCustomFields;
r = await toPayment();
expect(
    `the earliest dispatch date (${kl.earliestDispatchDate}) goes through to payment`,
    r.state === 'ArrangingPayment',
    `order ${order.code}, state ${r.state}, total ${rm(r.totalWithTax ?? 0)} incl. delivery ${rm(order.shippingWithTax)}; notes “${order.customFields.deliveryNotes}”`,
);

console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
