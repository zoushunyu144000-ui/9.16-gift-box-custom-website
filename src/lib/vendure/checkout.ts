import "server-only";
import type { Address, PaymentMethod, Quote } from "@/lib/types";
import {
  fillOrder,
  inSessionOrder,
  isMember,
  openSession,
  orderMatches,
  readTotals,
  setDelivery,
  syncCoupon,
  syncPoints,
  type BagLine,
  type SessionCall,
  type ShippingOption,
} from "./basket";
import { getCapabilities } from "./capabilities";
import { errorMessage, isErrorResult } from "./client";
import { deliveryPromiseFor, quoteDelivery } from "./delivery";
import { paymentPageUrl } from "./payments";

export interface CheckoutInput {
  customer: { name: string; email: string; phone: string };
  recipient: { name: string; phone: string };
  address: Address;
  deliveryDate: string;
  deliveryNotes?: string;
  deliveryOptionId?: string;
  couponCode?: string;
  /** A member's points to use on this order. */
  loyaltyPoints?: number;
  paymentMethod: PaymentMethod;
  ageConfirmed: boolean;
  lines: BagLine[];
}

export type CheckoutResult =
  | { ok: true; orderCode: string; redirectUrl: string }
  | { ok: false; status: number; error: string; fieldErrors?: Record<string, string>; lineProblems?: Record<string, string>; signIn?: boolean };

const ORDER_RESULT = `... on Order { code state } ... on ErrorResult { errorCode message }`;

/** "Tan Mei Ling" → first "Tan Mei", last "Ling"; one word goes in the first name. */
function splitName(full: string) {
  const parts = full.trim().split(/\s+/);
  return parts.length > 1 ? { firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1] } : { firstName: parts[0], lastName: "" };
}

const fail = (status: number, error: string, extra: Omit<Extract<CheckoutResult, { ok: false }>, "ok" | "status" | "error"> = {}): CheckoutResult => ({ ok: false, status, error, ...extra });

/**
 * Builds the customer's order in the commerce backend from their bag, then sends them to pay.
 * Prices, discounts, stock, names and the age check are all enforced by the backend; this only translates.
 */
export async function placeVendureOrder(input: CheckoutInput, origin: string): Promise<CheckoutResult> {
  const session = await openSession();
  return inSessionOrder(session.key(), () => placeOrder(session.call, session.save, input, origin));
}

async function placeOrder(call: SessionCall, save: () => Promise<void>, input: CheckoutInput, origin: string): Promise<CheckoutResult> {
  const caps = await getCapabilities();
  const member = await isMember(call);

  const lineProblems = await fillOrder(call, input.lines);
  if (Object.keys(lineProblems).length) {
    return fail(409, "Some items in your bag need attention before you can pay.", { lineProblems });
  }
  const coupon = await syncCoupon(call, input.couponCode);
  if (coupon.error) return fail(422, coupon.error, { fieldErrors: { coupon: coupon.error } });
  if (member) {
    const refused = await syncPoints(call, input.loyaltyPoints ?? 0);
    if (refused) return fail(422, refused, { fieldErrors: { points: refused } });
  }

  if (!member) {
    const { firstName, lastName } = splitName(input.customer.name);
    const set = await call<{ setCustomerForOrder: unknown }>(
      `mutation($input: CreateCustomerInput!) { setCustomerForOrder(input: $input) { ${ORDER_RESULT} } }`,
      { input: { emailAddress: input.customer.email, firstName, lastName, phoneNumber: input.customer.phone } },
    );
    if (isErrorResult(set.setCustomerForOrder)) {
      const e = set.setCustomerForOrder;
      const registered = e.errorCode === "GUEST_CHECKOUT_ERROR" || e.errorCode === "EMAIL_ADDRESS_CONFLICT_ERROR";
      return fail(422, registered ? "This email address has an account. Please sign in to check out." : errorMessage(e), {
        fieldErrors: { email: registered ? "Please sign in with this email" : errorMessage(e) },
        signIn: registered,
      });
    }
  }

  // The backend decides which deliveries reach this address and what they cost: the customer's
  // choice when it is still offered, else the first.
  const a = input.address;
  const delivery = await setDelivery(
    call,
    { fullName: input.recipient.name, phoneNumber: input.recipient.phone, line1: a.line1, line2: a.line2, city: a.city, postcode: a.postcode, state: a.state },
    input.deliveryOptionId,
  );
  if (delivery.error) return fail(422, delivery.error);
  if (!delivery.chosen) {
    return fail(422, "We can’t deliver to this address yet. Please check the postcode, or contact us on WhatsApp.", { fieldErrors: { postcode: "No delivery to this postcode" } });
  }

  const fields: Record<string, unknown> = { ageConfirmed: input.ageConfirmed };
  if (caps.orderFields.has("preferredDeliveryDate")) fields.preferredDeliveryDate = input.deliveryDate || null;
  if (caps.orderFields.has("deliveryNotes")) fields.deliveryNotes = input.deliveryNotes || null;
  const updated = await call<{ setOrderCustomFields: unknown }>(
    `mutation($input: UpdateOrderInput!) { setOrderCustomFields(input: $input) { ${ORDER_RESULT} } }`,
    { input: { customFields: fields } },
  );
  if (isErrorResult(updated.setOrderCustomFields)) return fail(422, errorMessage(updated.setOrderCustomFields));

  const moved = await call<{ transitionOrderToState: unknown }>(
    `mutation { transitionOrderToState(state: "ArrangingPayment") { ... on Order { code } ... on OrderStateTransitionError { errorCode message transitionError } } }`,
  );
  const transition = moved.transitionOrderToState as { code?: string } | null;
  if (isErrorResult(moved.transitionOrderToState)) {
    const reason = errorMessage(moved.transitionOrderToState);
    const fieldErrors: Record<string, string> = {};
    if (/21 or older/.test(reason)) fieldErrors.ageConfirmed = "Required for alcohol";
    else if (/deliver/i.test(reason) && /date|day/i.test(reason)) fieldErrors.deliveryDate = reason;
    else if (/points/i.test(reason)) fieldErrors.points = reason;
    return fail(422, reason, { fieldErrors });
  }
  const orderCode = transition?.code;
  if (!orderCode) return fail(500, "We couldn’t create your order. Please try again in a moment.");

  // Keep the session first, so the customer can still reach the order if opening the payment page fails.
  await save();
  // Pay through a hosted gateway when the shop has one; otherwise the test page stands in for it.
  const page = await paymentPageUrl(call, orderCode, origin, input.paymentMethod);
  await save();
  if ("error" in page) return fail(502, page.error);
  return { ok: true, orderCode, redirectUrl: page.url };
}

export interface CheckoutPreviewInput {
  lines: BagLine[];
  couponCode?: string;
  loyaltyPoints?: number;
  address?: Partial<DeliveryAddressInput>;
  deliveryOptionId?: string;
}
type DeliveryAddressInput = { line1: string; line2?: string; city: string; postcode: string; state: string };

export type CheckoutPreview = Pick<Quote, "subtotal" | "deliveryFee" | "total" | "delivery" | "discounts" | "coupon" | "points"> & {
  lineProblems: Record<string, string>;
};

/**
 * Checkout's running totals from the customer's real backend order: the bag with its discount code,
 * a member's points and, once the address is complete, its delivery. What the customer sees here is
 * what the payment page will ask for.
 */
export async function previewCheckout(input: CheckoutPreviewInput): Promise<CheckoutPreview> {
  const session = await openSession();
  const result = await inSessionOrder(session.key(), async () => {
    const member = await isMember(session.call);
    const a = input.address;
    const complete = Boolean(a?.line1?.trim() && a.city?.trim() && /^\d{5}$/.test(a.postcode ?? "") && a.state);
    const address = complete ? (a as DeliveryAddressInput) : undefined;

    // An order that already matches (e.g. the customer came back from the payment page) is left as it is.
    const unchanged = await orderMatches(session.call, { lines: input.lines, couponCode: input.couponCode, points: input.loyaltyPoints, member, address, optionId: input.deliveryOptionId });
    let lineProblems: Record<string, string> = {};
    let coupon: { code?: string; error?: string } = {};
    let pointsError: string | undefined;
    if (!unchanged) {
      lineProblems = await fillOrder(session.call, input.lines);
      coupon = await syncCoupon(session.call, input.couponCode);
      pointsError = member ? await syncPoints(session.call, input.loyaltyPoints ?? 0) : undefined;
    }

    let delivery: Quote["delivery"];
    let estimatedFee = 0;
    if (address) {
      const set = unchanged ? await currentDelivery(session.call) : await setDelivery(session.call, address, input.deliveryOptionId);
      const promise = await deliveryPromiseFor(address.postcode);
      delivery = set.options.length
        ? { status: "ok", options: set.options.map((o) => ({ id: o.id, name: o.name, description: o.description, price: o.priceWithTax / 100 })), selectedId: set.chosen, promise }
        : { status: "unavailable", options: [], promise };
    } else {
      // Not a full address yet: delivery options and prices for the postcode, added to the total.
      delivery = await quoteDelivery({ postcode: a?.postcode, state: a?.state, optionId: input.deliveryOptionId, lines: input.lines }).catch(() => ({ status: "postcode" as const, options: [] }));
      estimatedFee = delivery?.options.find((o) => o.id === delivery?.selectedId)?.price ?? 0;
    }

    const totals = await readTotals(session.call);
    if (unchanged) coupon = { code: totals?.couponCodes[0] };
    const points = member ? await pointsOffer(session.call, totals, input.loyaltyPoints ?? 0, pointsError) : undefined;
    const subtotal = (totals?.lines.reduce((sum, l) => sum + l.linePriceWithTax, 0) ?? 0) / 100;
    const deliveryFee = complete ? (totals?.shippingLines.reduce((sum, l) => sum + l.priceWithTax, 0) ?? 0) / 100 : estimatedFee;
    return {
      lineProblems,
      subtotal,
      deliveryFee,
      total: (totals?.totalWithTax ?? 0) / 100 + (complete ? 0 : estimatedFee),
      delivery,
      discounts: (totals?.discounts ?? []).map((d) => ({ description: d.description, amount: d.amountWithTax / 100 })),
      coupon: { code: coupon.code, error: coupon.error },
      points,
    };
  });
  await session.save();
  return result;
}

/** The delivery options for the order's address and the one it has, without changing anything. */
async function currentDelivery(call: SessionCall): Promise<{ options: ShippingOption[]; chosen?: string }> {
  const { eligibleShippingMethods: options, activeOrder } = await call<{ eligibleShippingMethods: ShippingOption[]; activeOrder: { shippingLines: { shippingMethod: { id: string } }[] } | null }>(
    `{ eligibleShippingMethods { id name description priceWithTax } activeOrder { shippingLines { shippingMethod { id } } } }`,
  );
  return { options, chosen: activeOrder?.shippingLines[0]?.shippingMethod.id };
}

/** What a member can use in points on this order: their balance, within the programme's minimum and cap. */
async function pointsOffer(call: SessionCall, totals: Awaited<ReturnType<typeof readTotals>>, applied: number, error?: string): Promise<Quote["points"]> {
  const caps = await getCapabilities();
  if (!caps.queries.has("loyaltySettings")) return undefined;
  const { loyaltySettings: s, activeCustomer } = await call<{
    loyaltySettings: { pointValueSen: number; minRedeemPoints: number; maxRedeemPercent: number };
    activeCustomer: { customFields: { loyaltyPoints: number | null } } | null;
  }>(`{ loyaltySettings { pointValueSen minRedeemPoints maxRedeemPercent } activeCustomer { customFields { loyaltyPoints } } }`);
  const balance = activeCustomer?.customFields.loyaltyPoints ?? 0;
  const itemsSen = totals?.lines.reduce((sum, l) => sum + l.linePriceWithTax, 0) ?? 0;
  const cap = Math.floor((itemsSen * s.maxRedeemPercent) / 100 / Math.max(1, s.pointValueSen));
  const usable = Math.min(balance, cap);
  return { balance, usable: usable >= s.minRedeemPoints ? usable : 0, minimum: s.minRedeemPoints, pointValue: s.pointValueSen / 100, applied: error ? 0 : applied, error };
}
