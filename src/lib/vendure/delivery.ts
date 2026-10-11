import "server-only";
import type { DeliveryPromise, Quote } from "@/lib/types";
import { getCapabilities } from "./capabilities";
import { getCatalog } from "./catalog";
import { shopApi } from "./client";

type VOption = { id: string; code: string; name: string; description: string; priceWithTax: number };
type VPromise = { zoneLabel: string; sameDayAvailable: boolean; earliestDispatchDate: string; closedDates: string[]; message: string };

/** Whether the backend prices delivery per address (its delivery-zones plugin). */
export async function deliveryByAddress() {
  return (await getCapabilities()).queries.has("deliveryQuote");
}

/**
 * Delivery options, prices and dates for a bag going to a postcode, from the backend's delivery
 * zones, so checkout shows what the order will be charged. Undefined when the backend has a single
 * flat delivery price instead.
 */
export async function quoteDelivery(input: {
  postcode?: string;
  state?: string;
  optionId?: string;
  lines: { productId: string; variantId?: string; quantity: number }[];
}): Promise<Quote["delivery"]> {
  const caps = await getCapabilities();
  if (!caps.queries.has("deliveryQuote")) return undefined;
  const postcode = input.postcode?.trim() ?? "";
  if (!/^\d{5}$/.test(postcode)) return { status: "postcode", options: [] };

  const { products } = await getCatalog();
  const lines = input.lines.flatMap((l) => {
    const p = products.find((x) => x.id === l.productId);
    const variant = p?.variants.length ? p.variants.find((v) => v.id === l.variantId) : p?.defaultVariant;
    return variant?.id ? [{ productVariantId: variant.id, quantity: l.quantity }] : [];
  });
  const [quoted, promised] = await Promise.all([
    shopApi<{ deliveryQuote: VOption[] }>(`query($input: DeliveryQuoteInput!) { deliveryQuote(input: $input) { id code name description priceWithTax } }`, {
      input: { postalCode: postcode, province: input.state || undefined, lines },
    }),
    deliveryPromiseFor(postcode),
  ]);
  const options = quoted.data.deliveryQuote.map((o) => ({ id: o.id, name: o.name, description: o.description, price: o.priceWithTax / 100 }));
  const promise = promised;
  if (!options.length) return { status: "unavailable", options, promise };
  const selected = options.find((o) => o.id === input.optionId) ?? options[0];
  return { status: "ok", options, selectedId: selected.id, promise };
}

/** When a postcode can receive its delivery (dates, cut-off wording), when the backend says so. */
export async function deliveryPromiseFor(postcode: string): Promise<DeliveryPromise | undefined> {
  if (!(await getCapabilities()).queries.has("deliveryPromise")) return undefined;
  try {
    const { data } = await shopApi<{ deliveryPromise: VPromise }>(
      `query($p: String!) { deliveryPromise(postalCode: $p) { zoneLabel sameDayAvailable earliestDispatchDate closedDates message } }`,
      { p: postcode },
    );
    const p = data.deliveryPromise;
    return { zoneLabel: p.zoneLabel, earliestDate: p.earliestDispatchDate, closedDates: p.closedDates, sameDayAvailable: p.sameDayAvailable, message: p.message };
  } catch {
    return undefined;
  }
}
