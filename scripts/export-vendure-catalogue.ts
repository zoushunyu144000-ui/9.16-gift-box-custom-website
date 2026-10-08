/**
 * Writes the storefront's catalogue (src/data/seed.ts) in the backend's import format:
 *   backend/stores/moire/products.csv     products, variants, prices, stock, photos, facets
 *   backend/stores/moire/collections.json Festive Collection (one child per festival), Fixed Gift Collection, Wine Gift Boxes
 * Usage: npx tsx scripts/export-vendure-catalogue.ts
 * Then load it with `npm run setup:store -- stores/moire` in backend/.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { CATEGORIES, DEFAULT_PERSONALISATION, sortFestivals } from "../src/lib/catalog";
import { isUnsplash } from "../src/lib/images";
import { seedFestivals, seedProducts } from "../src/data/seed";
import type { CategorySlug, ProductImage } from "../src/lib/types";

const OUT = path.join(import.meta.dirname, "../backend/stores/moire");

const COLUMNS = [
  "name", "slug", "description", "assets", "facets", "optionGroups", "optionValues", "sku", "price", "taxCategory", "stockOnHand", "trackInventory", "variantAssets", "variantFacets",
  "product:personalisationLabel", "product:personalisationHelper", "product:personalisationMaxLength",
] as const;
/** The item names are bought as (PersonalisationPlugin.namesSku in the backend): one unit per name. */
const NAMES_SKU = "personalised-name";
type Row = Partial<Record<(typeof COLUMNS)[number], string | number>>;

function csvCell(v: string | number | undefined) {
  const s = v === undefined ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Placeholder photos are fetched at a sensible size; local photos are read from the storefront's public/ folder. */
function assetPath(img: ProductImage) {
  if (isUnsplash(img.src)) return `${img.src}${img.src.includes("?") ? "&" : "?"}w=1600&q=80&fm=jpg`;
  return img.src.replace(/^\//, "");
}

const CATEGORY_FACET: Record<CategorySlug, string> = {
  festive: CATEGORIES.festive.name,
  "fixed-gifts": CATEGORIES["fixed-gifts"].name,
  "wine-spirits": CATEGORIES["wine-spirits"].name,
};
const festivalName = new Map(seedFestivals.map((f) => [f.id, f.name]));

const rows: Row[] = [];
for (const p of seedProducts) {
  const facets = [`category:${CATEGORY_FACET[p.category]}`];
  if (p.festivalId && festivalName.has(p.festivalId)) facets.push(`festival:${festivalName.get(p.festivalId)}`);
  if (p.containsAlcohol) facets.push("alcohol:Contains alcohol");
  // Sold-out products stay listed with no stock, so the storefront shows them as Sold Out.
  const tracked = typeof p.stock === "number" || p.status === "sold_out";
  const stock = p.status === "sold_out" ? 0 : (p.stock ?? 0);
  // A product's own name settings; empty label / help text means the shop's defaults.
  const pers = p.personalisation?.enabled ? p.personalisation : DEFAULT_PERSONALISATION;
  if (pers.fee !== DEFAULT_PERSONALISATION.fee) console.warn(`${p.name}: names cost ${pers.fee}, but the backend charges ${DEFAULT_PERSONALISATION.fee} per name for every product.`);
  const base: Row = {
    name: p.name,
    slug: p.slug,
    description: p.description,
    assets: p.images.map(assetPath).join("|"),
    facets: facets.join("|"),
    taxCategory: "standard",
    stockOnHand: stock,
    trackInventory: tracked ? "true" : "false",
    "product:personalisationLabel": pers.label === DEFAULT_PERSONALISATION.label ? "" : pers.label,
    "product:personalisationHelper": pers.helper ?? "",
    "product:personalisationMaxLength": pers.maxLength,
  };
  if (!p.variants.length) {
    rows.push({ ...base, sku: p.slug, price: p.price });
    continue;
  }
  const group = p.variants.some((v) => v.containsAlcohol) ? "Version" : "Option";
  p.variants.forEach((v, i) => {
    const variant: Row = {
      optionValues: v.name,
      sku: `${p.slug}--${v.id}`,
      price: v.price,
      taxCategory: "standard",
      stockOnHand: stock,
      trackInventory: tracked ? "true" : "false",
      variantFacets: v.containsAlcohol && !p.containsAlcohol ? "alcohol:Contains alcohol" : "",
    };
    rows.push(i === 0 ? { ...base, ...variant, optionGroups: group } : variant);
  });
}

rows.push({
  name: "Personalised name",
  slug: NAMES_SKU,
  description: "A name for a gift, charged per name. Added to the bag with the gift it belongs to; not listed in the shop.",
  facets: "service:Personalised name",
  sku: NAMES_SKU,
  price: DEFAULT_PERSONALISATION.fee,
  taxCategory: "standard",
  stockOnHand: 0,
  trackInventory: "false",
  "product:personalisationMaxLength": DEFAULT_PERSONALISATION.maxLength,
});

const facetFilter = (name: string) => [{ code: "facet-value-filter", args: { facetValueNames: [name], containsAny: false } }];
const collections = [
  { name: CATEGORIES.festive.name, slug: "festive", description: CATEGORIES.festive.intro, filters: facetFilter(CATEGORY_FACET.festive) },
  ...sortFestivals(seedFestivals, true).map((f) => ({
    name: f.name,
    slug: f.slug,
    description: f.description ?? "",
    parentName: CATEGORIES.festive.name,
    private: !f.active,
    filters: facetFilter(f.name),
    assetPaths: f.coverImage ? [assetPath(f.coverImage)] : [],
  })),
  { name: CATEGORIES["fixed-gifts"].name, slug: "fixed-gifts", description: CATEGORIES["fixed-gifts"].intro, filters: facetFilter(CATEGORY_FACET["fixed-gifts"]) },
  { name: CATEGORIES["wine-spirits"].name, slug: "wine-gift-boxes", description: CATEGORIES["wine-spirits"].intro, filters: facetFilter(CATEGORY_FACET["wine-spirits"]) },
];

mkdirSync(OUT, { recursive: true });
writeFileSync(path.join(OUT, "products.csv"), [COLUMNS.join(","), ...rows.map((r) => COLUMNS.map((c) => csvCell(r[c])).join(","))].join("\n") + "\n");
writeFileSync(path.join(OUT, "collections.json"), JSON.stringify(collections, null, 2) + "\n");
console.log(`Wrote ${seedProducts.length} products and the personalised name item (${rows.length} rows), and ${collections.length} collections, to ${path.relative(process.cwd(), OUT)}`);
