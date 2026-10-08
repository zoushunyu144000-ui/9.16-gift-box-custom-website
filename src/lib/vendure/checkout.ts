import "server-only";
import type { Address, PaymentMethod } from "@/lib/types";
import { getCapabilities } from "./capabilities";
import { getCatalog } from "./catalog";
import { errorMessage, isErrorResult, shopApi } from "./client";
import { getSessionToken, setSessionToken } from "./session";

export interface CheckoutInput {
  customer: { name: string; email: string; phone: string };
  recipient: { name: string; phone: string };
  address: Address;
  deliveryDate: string;
  deliveryNotes?: string;
  paymentMethod: PaymentMethod;
  ageConfirmed: boolean;
  lines: { key: string; productId: string; variantId?: string; quantity: number; personalisation?: string; personalisationCount?: number; giftMessage?: string }[];
}

export type CheckoutResult =
  | { ok: true; orderCode: string; redirectUrl: string }
  | { ok: false; status: number; error: string; fieldErrors?: Record<string, string>; lineProblems?: Record<string, string> };

const ORDER_RESULT = `... on Order { code state } ... on ErrorResult { errorCode message }`;
/** addItemToOrder can also refuse through an interceptor (e.g. names) or for stock. */
const ADD_ITEM_RESULT = `${ORDER_RESULT} ... on OrderInterceptorError { interceptorError } ... on InsufficientStockError { quantityAvailable }`;

/** "Tan Mei Ling" → first "Tan Mei", last "Ling"; one word goes in the first name. */
function splitName(full: string) {
  const parts = full.trim().split(/\s+/);
  return parts.length > 1 ? { firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1] } : { firstName: parts[0], lastName: "" };
}

const fail = (status: number, error: string, extra: Omit<Extract<CheckoutResult, { ok: false }>, "ok" | "status" | "error"> = {}): CheckoutResult => ({ ok: false, status, error, ...extra });

/**
 * Builds the customer's order in the commerce backend from their bag, then sends them to pay.
 * Prices, stock, names and the age check are all enforced by the backend; this only translates.
 */
export async function placeVendureOrder(input: CheckoutInput, origin: string): Promise<CheckoutResult> {
  const [catalog, caps] = await Promise.all([getCatalog(), getCapabilities()]);
  let token = await getSessionToken();
  const call = async <T>(query: string, variables: Record<string, unknown> = {}) => {
    const res = await shopApi<T>(query, variables, { token });
    token = res.token;
    return res.data;
  };

  // A signed-in member keeps their session; a guest starts a fresh one so an old bag can't leak in.
  const me = token ? await call<{ activeCustomer: { id: string } | null; activeOrder: { state: string } | null }>(`{ activeCustomer { id } activeOrder { state } }`).catch(() => null) : null;
  const member = Boolean(me?.activeCustomer);
  if (!member) token = null;
  if (member && me?.activeOrder) {
    if (me.activeOrder.state === "ArrangingPayment") await call(`mutation { transitionOrderToState(state: "AddingItems") { ... on Order { code } } }`);
    await call(`mutation { removeAllOrderLines { ... on Order { code } } }`);
  }

  const lineProblems: Record<string, string> = {};
  for (const line of input.lines) {
    const product = catalog.products.find((p) => p.id === line.productId);
    const variant = product?.variants.length ? product.variants.find((v) => v.id === line.variantId) : product?.defaultVariant;
    if (!product || !variant?.id || !variant.sku) {
      lineProblems[line.key] = "This item is no longer available.";
      continue;
    }
    const added = await call<{ addItemToOrder: unknown }>(
      `mutation($id: ID!, $qty: Int!, $cf: OrderLineCustomFieldsInput) { addItemToOrder(productVariantId: $id, quantity: $qty, customFields: $cf) { ${ADD_ITEM_RESULT} } }`,
      { id: variant.id, qty: line.quantity, cf: line.giftMessage ? { giftMessage: line.giftMessage } : null },
    );
    if (isErrorResult(added.addItemToOrder)) {
      lineProblems[line.key] = errorMessage(added.addItemToOrder);
      continue;
    }
    const names = line.personalisation?.trim().toUpperCase();
    if (names) {
      if (!catalog.names) {
        lineProblems[line.key] = "Personalised names are coming soon and can’t be ordered yet.";
        continue;
      }
      const withNames = await call<{ addItemToOrder: unknown }>(
        `mutation($id: ID!, $qty: Int!, $cf: OrderLineCustomFieldsInput) { addItemToOrder(productVariantId: $id, quantity: $qty, customFields: $cf) { ${ADD_ITEM_RESULT} } }`,
        { id: catalog.names.variantId, qty: line.personalisationCount ?? 1, cf: { names, namesFor: variant.sku } },
      );
      if (isErrorResult(withNames.addItemToOrder)) lineProblems[line.key] = errorMessage(withNames.addItemToOrder);
    }
  }
  if (Object.keys(lineProblems).length) {
    return fail(409, "Some items in your bag need attention before you can pay.", { lineProblems });
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
      return fail(422, registered ? "This email address has an account. Please sign in to check out." : errorMessage(e), { fieldErrors: { email: registered ? "Please sign in with this email" : errorMessage(e) } });
    }
  }

  const a = input.address;
  const addressed = await call<{ setOrderShippingAddress: unknown }>(
    `mutation($input: CreateAddressInput!) { setOrderShippingAddress(input: $input) { ${ORDER_RESULT} } }`,
    {
      input: {
        fullName: input.recipient.name,
        phoneNumber: input.recipient.phone,
        streetLine1: a.line1,
        streetLine2: a.line2 || undefined,
        city: a.city,
        postalCode: a.postcode,
        province: a.state,
        countryCode: "MY",
      },
    },
  );
  if (isErrorResult(addressed.setOrderShippingAddress)) return fail(422, errorMessage(addressed.setOrderShippingAddress));

  // The backend decides which deliveries reach this address and what they cost; take the first it offers.
  const methods = await call<{ eligibleShippingMethods: { id: string }[] }>(`{ eligibleShippingMethods { id } }`);
  if (!methods.eligibleShippingMethods.length) {
    return fail(422, "We can’t deliver to this address yet. Please check the postcode, or contact us on WhatsApp.", { fieldErrors: { postcode: "No delivery to this postcode" } });
  }
  const shipped = await call<{ setOrderShippingMethod: unknown }>(
    `mutation($ids: [ID!]!) { setOrderShippingMethod(shippingMethodId: $ids) { ${ORDER_RESULT} } }`,
    { ids: [methods.eligibleShippingMethods[0].id] },
  );
  if (isErrorResult(shipped.setOrderShippingMethod)) return fail(422, errorMessage(shipped.setOrderShippingMethod));

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
    return fail(422, reason, /21 or older/.test(reason) ? { fieldErrors: { ageConfirmed: "Required for alcohol" } } : /delivery date/i.test(reason) ? { fieldErrors: { deliveryDate: reason } } : {});
  }
  const orderCode = transition?.code;
  if (!orderCode) return fail(500, "We couldn’t create your order. Please try again in a moment.");

  // Pay through a hosted gateway when the shop has one; otherwise the test page stands in for it.
  let redirectUrl = `/pay/${orderCode}`;
  if (caps.mutations.has("createHostedPayment")) {
    const { eligiblePaymentMethods } = await call<{ eligiblePaymentMethods: { code: string; isEligible: boolean }[] }>(`{ eligiblePaymentMethods { code isEligible } }`);
    const hosted = eligiblePaymentMethods.find((m) => m.isEligible && m.code !== "test-payment");
    if (hosted) {
      const res = await call<{ createHostedPayment: { url?: string; errorCode?: string; message?: string } }>(
        `mutation($input: CreateHostedPaymentInput!) { createHostedPayment(input: $input) { ... on HostedPaymentRedirect { url } ... on ErrorResult { errorCode message } } }`,
        {
          input: {
            paymentMethodCode: hosted.code,
            returnUrl: `${origin}/order/${orderCode}`,
            cancelUrl: `${origin}/order/${orderCode}`,
            preferredMethod: input.paymentMethod === "ewallet" ? "ewallet" : input.paymentMethod,
          },
        },
      );
      if (!res.createHostedPayment.url) return fail(502, res.createHostedPayment.message || "The payment page couldn’t be opened. Please try again.");
      redirectUrl = res.createHostedPayment.url;
    }
  }

  await setSessionToken(token);
  return { ok: true, orderCode, redirectUrl };
}
