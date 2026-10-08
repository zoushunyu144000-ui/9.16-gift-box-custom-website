// Exercises the personalised-name, gift-message and age-check rules through the Shop API.
// Run against a server set up from stores/moire (it places items from that catalogue in a new bag):
//   npm run dev   (in another terminal), then   npm run check:shop-rules
const API = process.env.SHOP_API_URL || "http://localhost:3000/shop-api";
let token = null;
const results = [];

async function gql(query, variables = {}) {
  const res = await fetch(API, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ query, variables }),
  });
  token = res.headers.get("vendure-auth-token") ?? token;
  const body = await res.json();
  if (body.errors) return { error: body.errors[0].message };
  return body.data;
}
function expect(name, ok, detail = "") {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
}

const ORDER = `... on Order { id code totalWithTax subTotalWithTax lines { id quantity linePriceWithTax productVariant { sku } customFields { names namesFor giftMessage } } }
               ... on ErrorResult { errorCode message }`;
const add = (sku, qty, cf) => variantId(sku).then((id) => gql(`mutation($id:ID!,$q:Int!,$cf:OrderLineCustomFieldsInput){ addItemToOrder(productVariantId:$id, quantity:$q, customFields:$cf){ ${ORDER} } }`, { id, q: qty, cf }).then((d) => d.addItemToOrder ?? d));

const skuIds = new Map();
async function variantId(sku) {
  if (!skuIds.size) {
    const d = await gql(`{ products(options:{take:100}) { items { variants { id sku } } } }`);
    for (const p of d.products.items) for (const v of p.variants) skuIds.set(v.sku, v.id);
  }
  return skuIds.get(sku);
}

// 1 · Box with a gift message, then its names as their own line (3 names at RM 8)
let o = await add("spring-blessings-box", 2, { giftMessage: "Wishing you a prosperous new year." });
expect("box with gift message is added", o.code && o.lines.length === 1, `subtotal ${o.subTotalWithTax / 100}`);
o = await add("personalised-name", 3, { names: "1. JASON\n2. EMILY\n3. SARAH", namesFor: "spring-blessings-box" });
expect("3 names for the box are added", o.code && o.lines.length === 2, `subtotal RM ${o.subTotalWithTax / 100} (expect 400)`);
expect("price = 2 × 188 + 3 × 8", o.subTotalWithTax === 40000);

// 2 · Rules on names
let r = await add("personalised-name", 1, { names: "sarah", namesFor: "spring-blessings-box" });
expect("lower-case names are refused", r.errorCode === "ORDER_INTERCEPTOR_ERROR", r.message);
r = await add("personalised-name", 1, { names: "SARAH", namesFor: "leather-journal" });
expect("names for a gift not in the bag are refused", r.errorCode === "ORDER_INTERCEPTOR_ERROR", r.message);
r = await add("personalised-name", 1, { names: "ABCDEFGHIJKLMNOPQRSTU", namesFor: "spring-blessings-box" });
expect("a 21-character name is refused (20 max)", r.errorCode === "ORDER_INTERCEPTOR_ERROR", r.message);
r = await add("spring-blessings-box", 1, { names: "FREE NAME" });
expect("names written on the box line itself are refused", r.errorCode === "ORDER_INTERCEPTOR_ERROR", r.message);
const namesLine = o.lines.find((l) => l.productVariant.sku === "personalised-name");
r = await gql(`mutation($id:ID!){ adjustOrderLine(orderLineId:$id, quantity:1){ ${ORDER} } }`, { id: namesLine.id });
r = r.adjustOrderLine ?? r;
expect("3 listed names can't be cut to 1 paid name", r.errorCode === "ORDER_INTERCEPTOR_ERROR", r.message);

// 3 · Gift message length
r = await add("golden-harvest-basket", 1, { giftMessage: "x".repeat(201) });
expect("a 201-character gift message is refused", Boolean(r.error || r.errorCode), r.error || r.message);

// 4 · Checkout checks
await gql(`mutation{ setCustomerForOrder(input:{ emailAddress:"buyer@example.com", firstName:"Test", lastName:"Buyer" }){ ... on Order { id } ... on ErrorResult { message } } }`);
await gql(`mutation{ setOrderShippingAddress(input:{ fullName:"Recipient", streetLine1:"1 Jalan Test", city:"Kuala Lumpur", postalCode:"50450", province:"Kuala Lumpur", countryCode:"MY", phoneNumber:"+60123456789" }){ ... on Order { id } } }`);
const methods = await gql(`{ eligibleShippingMethods { id name priceWithTax } }`);
await gql(`mutation($id:[ID!]!){ setOrderShippingMethod(shippingMethodId:$id){ ... on Order { id } ... on ErrorResult { message } } }`, { id: [methods.eligibleShippingMethods[0].id] });

const boxLine = o.lines.find((l) => l.productVariant.sku === "spring-blessings-box");
await gql(`mutation($id:ID!){ removeOrderLine(orderLineId:$id){ ... on Order { id } } }`, { id: boxLine.id });
r = await gql(`mutation{ transitionOrderToState(state:"ArrangingPayment"){ ... on Order { state } ... on OrderStateTransitionError { transitionError } } }`);
expect("checkout stops when names lost their gift", r.transitionOrderToState?.transitionError, r.transitionOrderToState?.transitionError);
await add("spring-blessings-box", 2, { giftMessage: "Wishing you a prosperous new year." });

await add("reunion-tea-box--wine", 1);
r = await gql(`mutation{ transitionOrderToState(state:"ArrangingPayment"){ ... on Order { state } ... on OrderStateTransitionError { transitionError } } }`);
expect("checkout stops for alcohol without the age confirmation", r.transitionOrderToState?.transitionError, r.transitionOrderToState?.transitionError);
await gql(`mutation{ setOrderCustomFields(input:{ customFields:{ ageConfirmed:true } }){ ... on Order { id } ... on ErrorResult { message } } }`);
r = await gql(`mutation{ transitionOrderToState(state:"ArrangingPayment"){ ... on Order { state totalWithTax } ... on OrderStateTransitionError { transitionError } } }`);
expect("checkout continues once age is confirmed and names have their gift", r.transitionOrderToState?.state === "ArrangingPayment", `state ${r.transitionOrderToState?.state}, total RM ${(r.transitionOrderToState?.totalWithTax ?? 0) / 100}`);

console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
