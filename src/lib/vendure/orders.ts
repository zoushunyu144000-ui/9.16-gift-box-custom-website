import "server-only";
import { PAYMENT_METHODS } from "@/lib/catalog";
import type { Order, OrderItem, OrderStatus, PaymentMethod } from "@/lib/types";
import { getCapabilities, type Capabilities } from "./capabilities";
import { NAMES_SKU } from "./catalog";
import { errorMessage, isErrorResult, shopApi, VendureError } from "./client";
import { getSessionToken, setSessionToken } from "./session";

type VLine = {
  id: string;
  quantity: number;
  unitPriceWithTax: number;
  linePriceWithTax: number;
  featuredAsset: { source: string } | null;
  productVariant: { id: string; sku: string; name: string; product: { id: string; slug: string; name: string; featuredAsset: { source: string } | null } };
  customFields: { names?: string | null; namesFor?: string | null; giftMessage?: string | null };
};
type VOrder = {
  code: string;
  state: string;
  createdAt: string;
  updatedAt: string;
  orderPlacedAt: string | null;
  subTotalWithTax: number;
  shippingWithTax: number;
  totalWithTax: number;
  customer: { firstName: string; lastName: string; emailAddress: string; phoneNumber: string | null } | null;
  shippingAddress: { fullName: string | null; phoneNumber: string | null; streetLine1: string | null; streetLine2: string | null; city: string | null; postalCode: string | null; province: string | null } | null;
  lines: VLine[];
  payments: { method: string; state: string; transactionId: string | null; createdAt: string; errorMessage: string | null; metadata: Record<string, unknown> | null }[] | null;
  discounts: { description: string; amountWithTax: number }[];
  shippingLines: { priceWithTax: number }[];
  customFields: { ageConfirmed?: boolean; preferredDeliveryDate?: string | null; deliveryNotes?: string | null };
};

/** Order fields for the storefront, including the custom fields this backend has. */
function orderFields(caps: Capabilities) {
  const extra = ["preferredDeliveryDate", "deliveryNotes"].filter((f) => caps.orderFields.has(f)).join(" ");
  return /* GraphQL */ `
    code state createdAt updatedAt orderPlacedAt subTotalWithTax shippingWithTax totalWithTax
    customer { firstName lastName emailAddress phoneNumber }
    shippingAddress { fullName phoneNumber streetLine1 streetLine2 city postalCode province }
    lines {
      id quantity unitPriceWithTax linePriceWithTax featuredAsset { source }
      productVariant { id sku name product { id slug name featuredAsset { source } } }
      customFields { names namesFor giftMessage }
    }
    payments { method state transactionId createdAt errorMessage metadata }
    discounts { description amountWithTax }
    shippingLines { priceWithTax }
    customFields { ageConfirmed ${extra} }
  `;
}

const PAID_STATES = new Set(["PaymentAuthorized", "PaymentSettled", "Modifying", "ArrangingAdditionalPayment"]);

/** The storefront's status for a backend order. */
export function orderStatus(o: { state: string; payments: { state: string }[] | null }): OrderStatus {
  if (o.state === "Cancelled") return "cancelled";
  if (o.state === "Delivered" || o.state === "PartiallyDelivered") return "completed";
  if (o.state === "Shipped" || o.state === "PartiallyShipped") return "out_for_delivery";
  if (PAID_STATES.has(o.state)) return "paid";
  const last = o.payments?.[o.payments.length - 1];
  return last && (last.state === "Declined" || last.state === "Error" || last.state === "Cancelled") ? "payment_failed" : "pending_payment";
}

/** The backend keeps names as their own line; the storefront shows them with the gift they belong to. */
function items(lines: VLine[]): OrderItem[] {
  const names = lines.filter((l) => l.productVariant.sku === NAMES_SKU);
  const gifts = lines.filter((l) => l.productVariant.sku !== NAMES_SKU);
  return gifts.map((l) => {
    const n = names.find((x) => x.customFields.namesFor === l.productVariant.sku);
    if (n) names.splice(names.indexOf(n), 1);
    const product = l.productVariant.product;
    return {
      productId: product.id,
      slug: product.slug,
      name: product.name,
      variantId: l.productVariant.id,
      variantName: l.productVariant.name !== product.name ? l.productVariant.name.replace(product.name, "").trim() || undefined : undefined,
      image: (l.featuredAsset ?? product.featuredAsset)?.source,
      unitPrice: l.unitPriceWithTax / 100,
      personalisationFee: n ? n.unitPriceWithTax / 100 : 0,
      quantity: l.quantity,
      lineTotal: (l.linePriceWithTax + (n?.linePriceWithTax ?? 0)) / 100,
      personalisation: n?.customFields.names ?? undefined,
      personalisationLabel: n ? "Personalised name" : undefined,
      personalisationCount: n?.quantity,
      giftMessage: l.customFields.giftMessage ?? undefined,
      containsAlcohol: false,
    };
  });
}

export function toStorefrontOrder(o: VOrder): Order {
  const a = o.shippingAddress;
  const customerName = [o.customer?.firstName, o.customer?.lastName].filter(Boolean).join(" ");
  const paid = o.payments?.find((p) => p.state === "Settled" || p.state === "Authorized");
  const last = o.payments?.[o.payments.length - 1];
  const chosen = (paid ?? last)?.metadata?.preferredMethod;
  return {
    id: o.code,
    status: orderStatus(o),
    createdAt: o.orderPlacedAt ?? o.createdAt,
    updatedAt: o.updatedAt,
    customer: { name: customerName, email: o.customer?.emailAddress ?? "", phone: o.customer?.phoneNumber ?? "" },
    recipient: { name: a?.fullName ?? customerName, phone: a?.phoneNumber ?? "" },
    address: { line1: a?.streetLine1 ?? "", line2: a?.streetLine2 || undefined, postcode: a?.postalCode ?? "", city: a?.city ?? "", state: a?.province ?? "" },
    deliveryDate: o.customFields.preferredDeliveryDate || undefined,
    deliveryNotes: o.customFields.deliveryNotes || undefined,
    items: items(o.lines),
    // Items and delivery at their full prices, then the discounts (codes, promotions, points) taken off.
    subtotal: o.lines.reduce((sum, l) => sum + l.linePriceWithTax, 0) / 100,
    deliveryFee: o.shippingLines.reduce((sum, l) => sum + l.priceWithTax, 0) / 100,
    discounts: o.discounts.map((d) => ({ description: d.description, amount: d.amountWithTax / 100 })),
    total: o.totalWithTax / 100,
    payment: {
      method: typeof chosen === "string" && chosen in PAYMENT_METHODS ? (chosen as PaymentMethod) : "online",
      provider: (paid ?? last)?.method ?? "",
      reference: paid?.transactionId ?? undefined,
      paidAt: paid?.createdAt,
      failureReason: !paid && last && last.state !== "Settled" ? last.errorMessage || "The payment didn’t go through" : undefined,
    },
    ageConfirmed: Boolean(o.customFields.ageConfirmed),
  };
}

/**
 * The customer's order by its code. Until it is paid the order is their session's active order;
 * once placed, Vendure shows it to its member, or to anyone holding the code for a limited time
 * (the backend's order link window), which is what makes the link in the confirmation email work.
 */
export async function getOrderForCustomer(code: string): Promise<Order | null> {
  const token = await getSessionToken();
  const caps = await getCapabilities();
  // Back from a hosted payment page: let the backend confirm with the gateway first, in case its webhook hasn't arrived.
  if (token && caps.queries.has("hostedPaymentStatus")) {
    await shopApi(`query($code: String!) { hostedPaymentStatus(orderCode: $code) { paid } }`, { code }, { token }).catch(() => undefined);
  }
  if (token) {
    const { data } = await shopApi<{ activeOrder: VOrder | null }>(`{ activeOrder { ${orderFields(caps)} } }`, {}, { token });
    if (data.activeOrder?.code === code) return toStorefrontOrder(data.activeOrder);
  }
  try {
    const { data } = await shopApi<{ orderByCode: VOrder | null }>(`query($code: String!) { orderByCode(code: $code) { ${orderFields(caps)} } }`, { code }, { token });
    return data.orderByCode ? toStorefrontOrder(data.orderByCode) : null;
  } catch (err) {
    // Vendure answers FORBIDDEN both for orders this session may not see and for unknown codes.
    if (err instanceof VendureError && err.code === "FORBIDDEN") return null;
    throw err;
  }
}

/**
 * Test mode (no gateway connected): the stand-in payment page pays with the backend's test payment
 * method. "failure" records a declined payment, "cancel" leaves the order waiting for payment.
 */
export async function payTestOrder(code: string, outcome: "success" | "failure" | "cancel") {
  const token = await getSessionToken();
  if (!token) return null;
  if (outcome !== "cancel") {
    const { data, token: next } = await shopApi<{ addPaymentToOrder: unknown }>(
      `mutation($input: PaymentInput!) { addPaymentToOrder(input: $input) { ... on Order { code } ... on ErrorResult { errorCode message } } }`,
      { input: { method: "test-payment", metadata: outcome === "failure" ? { shouldDecline: true } : {} } },
      { token },
    );
    await setSessionToken(next);
    if (isErrorResult(data.addPaymentToOrder) && data.addPaymentToOrder.errorCode !== "PAYMENT_DECLINED_ERROR") {
      throw new Error(errorMessage(data.addPaymentToOrder));
    }
  }
  return getOrderForCustomer(code);
}
