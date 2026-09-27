import type { CategorySlug, Occasion, OrderStatus, PaymentMethod, Product, ProductVariant } from "./types";

export const CATEGORIES: Record<CategorySlug, { name: string; href: string; short: string; intro: string }> = {
  festive: {
    name: "Festive Collection",
    short: "Festive",
    href: "/festive",
    intro: "Seasonal gift boxes and hampers for Chinese New Year, Mid-Autumn, the Dragon Boat Festival and Hari Raya.",
  },
  "fixed-gifts": {
    name: "Fixed Gift Collection",
    short: "Fixed Gift Collection",
    href: "/fixed-gifts",
    intro: "Year-round gifts for birthdays, thanks and milestones. Selected pieces can be engraved with a name.",
  },
  "wine-spirits": {
    name: "Wine & Spirits",
    short: "Wine & Spirits",
    href: "/wine-spirits",
    intro: "Wine, champagne and spirits, each presented in a gift box. For customers aged 21 and above.",
  },
};

export const OCCASIONS: Record<Occasion, { name: string; short: string }> = {
  "chinese-new-year": { name: "Chinese New Year", short: "CNY" },
  "mid-autumn": { name: "Mid-Autumn Festival", short: "Mid-Autumn" },
  "dragon-boat": { name: "Dragon Boat Festival", short: "Dragon Boat" },
  "hari-raya": { name: "Hari Raya", short: "Hari Raya" },
};

export const OCCASION_ORDER: Occasion[] = ["chinese-new-year", "hari-raya", "dragon-boat", "mid-autumn"];

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

export function isPurchasable(p: Product) {
  return p.status === "active";
}

export function sortProducts(list: Product[]) {
  return [...list].sort((a, b) => {
    // Purchasable first, then by sort order.
    const av = a.status === "active" ? 0 : 1;
    const bv = b.status === "active" ? 0 : 1;
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
