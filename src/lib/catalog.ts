import type { CategorySlug, Festival, OrderStatus, PaymentMethod, Product, ProductVariant } from "./types";

export const CATEGORIES: Record<CategorySlug, { name: string; href: string; short: string; intro: string }> = {
  festive: {
    name: "Festive Collection",
    short: "Festive",
    href: "/festive",
    intro: "Seasonal gift boxes and hampers, gathered by festival.",
  },
  "fixed-gifts": {
    name: "Fixed Gift Collection",
    short: "Fixed Gift Collection",
    href: "/fixed-gifts",
    intro: "Year-round gifts for birthdays, thanks and milestones. Selected pieces can be engraved with a name.",
  },
  // Internal id stays "wine-spirits" (database value); everything customer-facing presents
  // these as gift boxes — the client sells gift boxes, not alcohol on its own.
  "wine-spirits": {
    name: "Wine Gift Boxes",
    short: "Wine Gift Boxes",
    href: "/wine-gift-boxes",
    intro: "Gift boxes and gift sets with wine, champagne or spirits, presented ready to give. For customers aged 21 and above.",
  },
};

// ───────── Festivals ─────────

/** Festivals in display order. `includeHidden` is for admin. */
export function sortFestivals(list: Festival[], includeHidden = false) {
  return [...list].filter((f) => includeHidden || f.active).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
}

export function festivalHref(f: Pick<Festival, "slug">) {
  return `/festive/${f.slug}`;
}

export function festivalName(festivals: Festival[], id?: string | null) {
  return id ? festivals.find((f) => f.id === id)?.name : undefined;
}

export const PAYMENT_METHODS: Record<PaymentMethod, { name: string; detail: string }> = {
  fpx: { name: "FPX online banking", detail: "Pay directly from your Malaysian bank account" },
  card: { name: "Credit / debit card", detail: "Visa and Mastercard" },
  ewallet: { name: "E-wallet", detail: "Pay with a supported Malaysian e-wallet" },
};

export const ORDER_STATUS: Record<OrderStatus, { label: string; tone: "neutral" | "good" | "warn" | "bad" }> = {
  pending_payment: { label: "Awaiting payment", tone: "warn" },
  payment_failed: { label: "Payment failed", tone: "bad" },
  paid: { label: "Paid", tone: "good" },
  preparing: { label: "Preparing", tone: "neutral" },
  out_for_delivery: { label: "Out for delivery", tone: "neutral" },
  completed: { label: "Completed", tone: "good" },
  cancelled: { label: "Cancelled", tone: "bad" },
};

export const MALAYSIAN_STATES = [
  "Johor",
  "Kedah",
  "Kelantan",
  "Kuala Lumpur",
  "Labuan",
  "Melaka",
  "Negeri Sembilan",
  "Pahang",
  "Penang",
  "Perak",
  "Perlis",
  "Putrajaya",
  "Sabah",
  "Sarawak",
  "Selangor",
  "Terengganu",
];

export function formatRM(value: number, opts: { decimals?: boolean } = {}) {
  const decimals = opts.decimals ?? !Number.isInteger(value);
  return `RM ${value.toLocaleString("en-MY", { minimumFractionDigits: decimals ? 2 : 0, maximumFractionDigits: 2 })}`;
}

export function isVisible(p: Product) {
  return p.status !== "hidden";
}

/** Stock is tracked when it is a number; null/undefined = not tracked. */
export function tracksStock(p: Product) {
  return typeof p.stock === "number" && Number.isFinite(p.stock);
}

/**
 * Sold out = still shown everywhere and the product page still opens, but it can't be added to the bag.
 * Either set manually (status "sold_out", e.g. "Season ended") or because stock reached 0.
 */
export function isSoldOut(p: Product) {
  return p.status === "sold_out" || (tracksStock(p) && (p.stock as number) <= 0);
}

export function isPurchasable(p: Product) {
  return p.status === "active" && !isSoldOut(p);
}

/** Label for sold-out products. Stock-based sell-outs always read "Sold Out". */
export function soldOutLabel(p: Product) {
  if (p.status === "sold_out" && p.availabilityNote) return p.availabilityNote;
  return "Sold Out";
}

export function sortProducts(list: Product[]) {
  return [...list].sort((a, b) => {
    // Purchasable first, then by sort order.
    const av = isPurchasable(a) ? 0 : 1;
    const bv = isPurchasable(b) ? 0 : 1;
    return av - bv || a.sort - b.sort || a.name.localeCompare(b.name);
  });
}

export function priceRange(p: Product): { min: number; max: number } {
  if (!p.variants.length) return { min: p.price, max: p.price };
  const prices = p.variants.map((v) => v.price);
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

export function priceLabel(p: Product) {
  const { min, max } = priceRange(p);
  return min === max ? formatRM(min) : `From ${formatRM(min)}`;
}

export function findVariant(p: Product, variantId?: string): ProductVariant | undefined {
  if (!p.variants.length) return undefined;
  return p.variants.find((v) => v.id === variantId);
}

export function unitPrice(p: Product, variantId?: string) {
  return findVariant(p, variantId)?.price ?? p.price;
}

export function lineContainsAlcohol(p: Product, variantId?: string) {
  return p.containsAlcohol || Boolean(findVariant(p, variantId)?.containsAlcohol);
}

export function slugify(input: string) {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function whatsappLink(number: string, text: string) {
  const n = number.replace(/[^0-9]/g, "");
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
}

export const PERSONALISATION_PATTERN = /^[\p{L}\p{N} .,'&\-!?/()]*$/u;
export const GIFT_MESSAGE_MAX = 200;
