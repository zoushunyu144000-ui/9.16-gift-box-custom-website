import "server-only";
import { getCapabilities } from "./capabilities";
import { getCatalog } from "./catalog";
import { errorMessage, isErrorResult, shopApi } from "./client";
import { getSessionToken, setSessionToken } from "./session";

/**
 * The customer's order in the commerce backend, built from their bag. Checkout uses it twice: while
 * the customer fills in the form (so totals, discounts and delivery come from the backend) and when
 * they continue to payment. Each step is safe to repeat.
 */

/** A Shop API call made in the customer's session. */
export type SessionCall = <T>(query: string, variables?: Record<string, unknown>) => Promise<T>;

export interface BagLine {
  key: string;
  productId: string;
  variantId?: string;
  quantity: number;
  personalisation?: string;
  personalisationCount?: number;
  giftMessage?: string;
}

/** The customer's backend session (a guest's or a member's); `save` keeps it in their cookie. */
export async function openSession() {
  let token = await getSessionToken();
  const call: SessionCall = async (query, variables = {}) => {
    const res = await shopApi<never>(query, variables, { token });
    token = res.token;
    return res.data;
  };
  return { call, save: () => setSessionToken(token), key: () => token ?? "" };
}

// One session's steps run one after another, so two quick updates can't interleave their lines.
const queues = new Map<string, Promise<unknown>>();
export function inSessionOrder<T>(key: string, run: () => Promise<T>): Promise<T> {
  if (!key) return run();
  const next = (queues.get(key) ?? Promise.resolve()).then(run, run);
  const settled = next.catch(() => undefined);
  queues.set(key, settled);
  void settled.then(() => queues.get(key) === settled && queues.delete(key));
  return next;
}

export async function isMember(call: SessionCall) {
  const { activeCustomer } = await call<{ activeCustomer: { id: string } | null }>(`{ activeCustomer { id } }`);
  return Boolean(activeCustomer);
}

const ORDER_RESULT = `... on Order { code state } ... on ErrorResult { errorCode message }`;
/** addItemToOrder can also refuse through an interceptor (e.g. names) or for stock. */
const ADD_ITEM_RESULT = `${ORDER_RESULT} ... on OrderInterceptorError { interceptorError } ... on InsufficientStockError { quantityAvailable }`;

/**
 * Makes the session's order hold exactly the bag: back to adding items if it was waiting for payment,
 * the old lines out, each gift in (with its gift message), then its names as their own line.
 * Returns what couldn't be added, by bag line.
 */
export async function fillOrder(call: SessionCall, lines: BagLine[]): Promise<Record<string, string>> {
  const catalog = await getCatalog();
  const { activeOrder } = await call<{ activeOrder: { state: string } | null }>(`{ activeOrder { state } }`);
  if (activeOrder?.state === "ArrangingPayment") await call(`mutation { transitionOrderToState(state: "AddingItems") { ... on Order { code } } }`);
  if (activeOrder) await call(`mutation { removeAllOrderLines { ... on Order { code } } }`);

  const problems: Record<string, string> = {};
  for (const line of lines) {
    const product = catalog.products.find((p) => p.id === line.productId);
    const variant = product?.variants.length ? product.variants.find((v) => v.id === line.variantId) : product?.defaultVariant;
    if (!product || !variant?.id || !variant.sku) {
      problems[line.key] = "This item is no longer available.";
      continue;
    }
    const added = await call<{ addItemToOrder: unknown }>(
      `mutation($id: ID!, $qty: Int!, $cf: OrderLineCustomFieldsInput) { addItemToOrder(productVariantId: $id, quantity: $qty, customFields: $cf) { ${ADD_ITEM_RESULT} } }`,
      { id: variant.id, qty: line.quantity, cf: line.giftMessage ? { giftMessage: line.giftMessage } : null },
    );
    if (isErrorResult(added.addItemToOrder)) {
      problems[line.key] = errorMessage(added.addItemToOrder);
      continue;
    }
    const names = line.personalisation?.trim().toUpperCase();
    if (!names) continue;
    if (!catalog.names) {
      problems[line.key] = "Personalised names are coming soon and can’t be ordered yet.";
      continue;
    }
    const withNames = await call<{ addItemToOrder: unknown }>(
      `mutation($id: ID!, $qty: Int!, $cf: OrderLineCustomFieldsInput) { addItemToOrder(productVariantId: $id, quantity: $qty, customFields: $cf) { ${ADD_ITEM_RESULT} } }`,
      { id: catalog.names.variantId, qty: line.personalisationCount ?? 1, cf: { names, namesFor: variant.sku } },
    );
    if (isErrorResult(withNames.addItemToOrder)) problems[line.key] = errorMessage(withNames.addItemToOrder);
  }
  return problems;
}

const COUPON_MESSAGES: Record<string, string> = {
  COUPON_CODE_EXPIRED_ERROR: "This code has expired.",
  COUPON_CODE_LIMIT_ERROR: "This code has already been used as many times as it can be.",
};

/**
 * Leaves exactly the customer's discount code on the order (or none). Codes are tried as typed, then
 * in capitals, since staff usually create them in capitals.
 */
export async function syncCoupon(call: SessionCall, wanted?: string): Promise<{ code?: string; error?: string }> {
  const typed = wanted?.trim() ?? "";
  const { activeOrder } = await call<{ activeOrder: { couponCodes: string[] } | null }>(`{ activeOrder { couponCodes } }`);
  const current = activeOrder?.couponCodes ?? [];
  const keep = current.find((c) => typed && c.toUpperCase() === typed.toUpperCase());
  for (const c of current) {
    if (c !== keep) await call(`mutation($c: String!) { removeCouponCode(couponCode: $c) { code } }`, { c });
  }
  if (!typed) return {};
  if (keep) return { code: keep };
  let error = "This code isn’t valid.";
  for (const candidate of [...new Set([typed, typed.toUpperCase()])]) {
    const res = await call<{ applyCouponCode: unknown }>(`mutation($c: String!) { applyCouponCode(couponCode: $c) { ${ORDER_RESULT} } }`, { c: candidate });
    if (!isErrorResult(res.applyCouponCode)) return { code: candidate };
    error = COUPON_MESSAGES[res.applyCouponCode.errorCode] ?? error;
    if (res.applyCouponCode.errorCode !== "COUPON_CODE_INVALID_ERROR") break;
  }
  return { error };
}

/** A member's points used on the order (0 takes them off). Returns the backend's reason when refused. */
export async function syncPoints(call: SessionCall, points: number): Promise<string | undefined> {
  if (!(await getCapabilities()).mutations.has("applyLoyaltyPoints")) return undefined;
  const res = await call<{ applyLoyaltyPoints: unknown }>(`mutation($p: Int!) { applyLoyaltyPoints(points: $p) { ${ORDER_RESULT} } }`, { p: points });
  return isErrorResult(res.applyLoyaltyPoints) ? errorMessage(res.applyLoyaltyPoints) : undefined;
}

export interface DeliveryAddress {
  fullName?: string;
  phoneNumber?: string;
  line1: string;
  line2?: string;
  city: string;
  postcode: string;
  state: string;
}

export type ShippingOption = { id: string; name: string; description: string; priceWithTax: number };

/**
 * Sets where the order goes and its delivery: the option the customer chose when the backend offers
 * it for this address, else the first. Returns the options offered (none: nothing delivers there).
 */
export async function setDelivery(call: SessionCall, address: DeliveryAddress, optionId?: string): Promise<{ options: ShippingOption[]; chosen?: string; error?: string }> {
  const addressed = await call<{ setOrderShippingAddress: unknown }>(`mutation($input: CreateAddressInput!) { setOrderShippingAddress(input: $input) { ${ORDER_RESULT} } }`, {
    input: {
      fullName: address.fullName,
      phoneNumber: address.phoneNumber,
      streetLine1: address.line1,
      streetLine2: address.line2 || undefined,
      city: address.city,
      postalCode: address.postcode,
      province: address.state,
      countryCode: "MY",
    },
  });
  if (isErrorResult(addressed.setOrderShippingAddress)) return { options: [], error: errorMessage(addressed.setOrderShippingAddress) };
  const { eligibleShippingMethods: options } = await call<{ eligibleShippingMethods: ShippingOption[] }>(`{ eligibleShippingMethods { id name description priceWithTax } }`);
  if (!options.length) return { options };
  const chosen = options.find((o) => o.id === optionId) ?? options[0];
  const shipped = await call<{ setOrderShippingMethod: unknown }>(`mutation($ids: [ID!]!) { setOrderShippingMethod(shippingMethodId: $ids) { ${ORDER_RESULT} } }`, { ids: [chosen.id] });
  if (isErrorResult(shipped.setOrderShippingMethod)) return { options, error: errorMessage(shipped.setOrderShippingMethod) };
  return { options, chosen: chosen.id };
}

type CurrentOrder = {
  state: string;
  couponCodes: string[];
  lines: { quantity: number; productVariant: { id: string }; customFields: { giftMessage?: string | null; names?: string | null; namesFor?: string | null } }[];
  shippingAddress: { streetLine1: string | null; streetLine2: string | null; city: string | null; postalCode: string | null; province: string | null } | null;
  shippingLines: { shippingMethod: { id: string } }[];
  customFields?: { loyaltyPointsApplied?: number | null };
};

/**
 * Whether the session's order already is this bag, code, points and delivery. Checkout's running
 * totals then leave it as it is: an order waiting for payment stays waiting (its payment page stays
 * valid), and nothing is rebuilt for nothing.
 */
export async function orderMatches(
  call: SessionCall,
  wanted: { lines: BagLine[]; couponCode?: string; points?: number; member: boolean; address?: DeliveryAddress; optionId?: string },
): Promise<boolean> {
  const caps = await getCapabilities();
  const pointsField = caps.orderFields.has("loyaltyPointsApplied") ? "customFields { loyaltyPointsApplied }" : "";
  const { activeOrder: o } = await call<{ activeOrder: CurrentOrder | null }>(`{ activeOrder {
    state couponCodes
    lines { quantity productVariant { id } customFields { giftMessage names namesFor } }
    shippingAddress { streetLine1 streetLine2 city postalCode province }
    shippingLines { shippingMethod { id } }
    ${pointsField}
  } }`);
  if (!o) return false;

  const catalog = await getCatalog();
  const key = (variantId: string, giftMessage?: string | null, names?: string | null, namesFor?: string | null) => JSON.stringify([variantId, giftMessage || "", names || "", namesFor || ""]);
  const expected = new Map<string, number>();
  const add = (k: string, qty: number) => expected.set(k, (expected.get(k) ?? 0) + qty);
  for (const line of wanted.lines) {
    const product = catalog.products.find((p) => p.id === line.productId);
    const variant = product?.variants.length ? product.variants.find((v) => v.id === line.variantId) : product?.defaultVariant;
    if (!variant?.id || !variant.sku) return false;
    add(key(variant.id, line.giftMessage), line.quantity);
    const names = line.personalisation?.trim().toUpperCase();
    if (names && catalog.names) add(key(catalog.names.variantId, null, names, variant.sku), line.personalisationCount ?? 1);
  }
  const actual = new Map<string, number>();
  for (const l of o.lines) {
    const k = key(l.productVariant.id, l.customFields.giftMessage, l.customFields.names, l.customFields.namesFor);
    actual.set(k, (actual.get(k) ?? 0) + l.quantity);
  }
  if (actual.size !== expected.size || [...expected].some(([k, qty]) => actual.get(k) !== qty)) return false;

  const code = wanted.couponCode?.trim().toUpperCase() ?? "";
  const codes = o.couponCodes.map((c) => c.toUpperCase());
  if (code ? codes.length !== 1 || codes[0] !== code : codes.length > 0) return false;
  if (wanted.member && pointsField && (o.customFields?.loyaltyPointsApplied ?? 0) !== (wanted.points ?? 0)) return false;

  if (wanted.address) {
    const a = wanted.address;
    const s = o.shippingAddress;
    const same = (x: string | null | undefined, y: string | undefined) => (x ?? "").trim() === (y ?? "").trim();
    if (!s || !same(s.streetLine1, a.line1) || !same(s.streetLine2, a.line2) || !same(s.city, a.city) || !same(s.postalCode, a.postcode) || !same(s.province, a.state)) return false;
    const method = o.shippingLines[0]?.shippingMethod.id;
    if (!method || (wanted.optionId && method !== wanted.optionId)) return false;
  }
  return true;
}

export type OrderTotals = {
  code: string;
  couponCodes: string[];
  totalWithTax: number;
  lines: { linePriceWithTax: number }[];
  discounts: { description: string; amountWithTax: number }[];
  shippingLines: { priceWithTax: number }[];
};

export async function readTotals(call: SessionCall): Promise<OrderTotals | null> {
  const { activeOrder } = await call<{ activeOrder: OrderTotals | null }>(
    `{ activeOrder { code couponCodes totalWithTax lines { linePriceWithTax } discounts { description amountWithTax } shippingLines { priceWithTax } } }`,
  );
  return activeOrder;
}
