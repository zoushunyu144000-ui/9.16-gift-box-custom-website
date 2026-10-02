import "server-only";
import {
  findVariant,
  GIFT_MESSAGE_MAX,
  isSoldOut,
  tracksStock,
  lineContainsAlcohol,
  PERSONALISATION_PATTERN,
  unitPrice,
} from "./catalog";
import type { Store } from "./store/types";
import type { CartLine, OrderItem, Quote, QuotedLine, SiteSettings } from "./types";

export const MAX_QTY = 99;

type LineInput = Pick<CartLine, "key" | "productId" | "variantId" | "quantity" | "personalisation" | "personalisationOption" | "giftMessage">;

/** Re-price every line from the catalogue. Never trust prices sent by the browser. */
export async function quoteLines(store: Store, lines: LineInput[], settings?: SiteSettings): Promise<Quote> {
  const s = settings ?? (await store.getSettings());
  const products = await store.listProducts();
  const byId = new Map(products.map((p) => [p.id, p]));
  // Total requested per product across all lines (the same box can be in the bag twice with different names).
  const requested = new Map<string, number>();
  for (const l of lines) requested.set(l.productId, (requested.get(l.productId) ?? 0) + (Math.floor(Number(l.quantity)) || 0));

  const quoted: QuotedLine[] = lines.map((line) => {
    const p = byId.get(line.productId);
    if (!p || p.status === "hidden") return { key: line.key, ok: false, problem: "This item is no longer available." };
    if (isSoldOut(p)) return { key: line.key, ok: false, problem: `${p.name} is sold out.` };
    if (p.status !== "active") return { key: line.key, ok: false, problem: `${p.name} is currently unavailable.` };

    const qty = Math.floor(Number(line.quantity));
    if (!Number.isFinite(qty) || qty < 1 || qty > MAX_QTY) return { key: line.key, ok: false, problem: "Please choose a quantity between 1 and 99." };
    if (tracksStock(p) && (requested.get(p.id) ?? qty) > (p.stock as number))
      return { key: line.key, ok: false, problem: `Only ${p.stock} of ${p.name} left — please reduce the quantity.` };

    let variantName: string | undefined;
    if (p.variants.length) {
      const v = findVariant(p, line.variantId);
      if (!v) return { key: line.key, ok: false, problem: `Please choose an option for ${p.name}.` };
      variantName = v.name;
    }

    const text = line.personalisation?.trim() || undefined;
    let personalisationFee = 0;
    let option: string | undefined;
    if (text) {
      const pers = p.personalisation;
      if (!pers?.enabled) return { key: line.key, ok: false, problem: `${p.name} cannot be personalised.` };
      if (text.length > pers.maxLength)
        return { key: line.key, ok: false, problem: `${pers.label} must be ${pers.maxLength} characters or fewer.` };
      if (!PERSONALISATION_PATTERN.test(text))
        return { key: line.key, ok: false, problem: `${pers.label} contains characters we can't engrave.` };
      const choices = pers.options?.filter(Boolean) ?? [];
      if (choices.length) {
        option = choices.find((o) => o === line.personalisationOption);
        if (!option) return { key: line.key, ok: false, problem: `Please choose a material for the ${pers.label.toLowerCase()}.` };
      }
      personalisationFee = pers.fee || 0;
    }

    const message = line.giftMessage?.trim() || undefined;
    if (message && message.length > GIFT_MESSAGE_MAX)
      return { key: line.key, ok: false, problem: `Gift messages are limited to ${GIFT_MESSAGE_MAX} characters.` };

    const price = unitPrice(p, line.variantId);
    const item: OrderItem = {
      productId: p.id,
      slug: p.slug,
      name: p.name,
      variantId: p.variants.length ? line.variantId : undefined,
      variantName,
      image: p.images[0]?.src,
      unitPrice: price,
      personalisationFee,
      quantity: qty,
      lineTotal: (price + personalisationFee) * qty,
      personalisation: text,
      personalisationLabel: text ? p.personalisation?.label : undefined,
      personalisationOption: option,
      giftMessage: message,
      containsAlcohol: lineContainsAlcohol(p, line.variantId),
    };
    return { key: line.key, ok: true, item };
  });

  const okItems = quoted.filter((q) => q.ok && q.item).map((q) => q.item!);
  const subtotal = okItems.reduce((sum, i) => sum + i.lineTotal, 0);
  const deliveryFee = computeDeliveryFee(subtotal, s);
  return {
    lines: quoted,
    subtotal,
    deliveryFee,
    total: subtotal + deliveryFee,
    containsAlcohol: okItems.some((i) => i.containsAlcohol),
    hasProblems: quoted.some((q) => !q.ok),
  };
}

export function computeDeliveryFee(subtotal: number, s: SiteSettings) {
  if (subtotal <= 0) return 0;
  if (s.freeDeliveryThreshold != null && subtotal >= s.freeDeliveryThreshold) return 0;
  return Math.max(0, s.deliveryFee || 0);
}
