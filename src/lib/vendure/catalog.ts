import "server-only";
import { seedSettings } from "@/data/seed";
import { CATEGORIES, DEFAULT_PERSONALISATION } from "@/lib/catalog";
import type { CategorySlug, Festival, Product, ProductImage, SiteSettings } from "@/lib/types";
import { shopApi } from "./client";

/** SKU of the backend's "Personalised name" item (one unit per name; its price is the fee per name). */
export const NAMES_SKU = "personalised-name";
const FESTIVE_COLLECTION = "festive";

type Asset = { source: string; width: number; height: number } | null;
type VProduct = {
  id: string;
  slug: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  featuredAsset: Asset;
  assets: NonNullable<Asset>[];
  facetValues: { name: string; facet: { code: string } }[];
  collections: { slug: string; parent: { slug: string } | null }[];
  customFields: {
    personalisationEnabled?: boolean | null;
    personalisationLabel?: string | null;
    personalisationHelper?: string | null;
    personalisationMaxLength?: number | null;
    summary?: string | null;
    featured?: boolean | null;
    sortOrder?: number | null;
    availabilityNote?: string | null;
  };
  variants: {
    id: string;
    sku: string;
    name: string;
    priceWithTax: number;
    stockLevel: string;
    options: { name: string }[];
    facetValues: { facet: { code: string } }[];
    customFields: { note?: string | null };
  }[];
};

const PRODUCTS = /* GraphQL */ `
  query StorefrontCatalog($skip: Int!) {
    products(options: { take: 100, skip: $skip }) {
      totalItems
      items {
        id slug name description createdAt updatedAt
        featuredAsset { source width height }
        assets { source width height }
        facetValues { name facet { code } }
        collections { slug parent { slug } }
        customFields {
          personalisationEnabled personalisationLabel personalisationHelper personalisationMaxLength
          summary featured sortOrder availabilityNote
        }
        variants {
          id sku name priceWithTax stockLevel
          options { name }
          facetValues { facet { code } }
          customFields { note }
        }
      }
    }
  }
`;

const COLLECTIONS = /* GraphQL */ `
  query StorefrontCollections {
    collections(options: { take: 100 }) {
      items { id slug name description position updatedAt featuredAsset { source width height } parent { slug } }
    }
  }
`;

const CHANNEL_CONTENT = /* GraphQL */ `
  query StorefrontContent {
    activeChannel {
      customFields {
        heroEyebrow heroTitle heroText featuredCollectionSlug featuredTitle featuredIntro
        whatsappNumber contactEmail businessHours showPreviewNotice
      }
    }
  }
`;

const CATEGORY_BY_NAME = new Map(Object.entries(CATEGORIES).map(([slug, c]) => [c.name, slug as CategorySlug]));

/** Vendure descriptions are HTML (the dashboard's editor); the storefront shows plain paragraphs. */
export function htmlToText(html: string) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li)>/gi, "\n\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function image(a: NonNullable<Asset>, alt: string): ProductImage {
  return { src: a.source, alt, width: a.width, height: a.height };
}

const hasFacet = (values: { facet: { code: string } }[], code: string) => values.some((v) => v.facet.code === code);

function toProduct(p: VProduct, namesFee: number): Product | null {
  const categoryName = p.facetValues.find((v) => v.facet.code === "category")?.name;
  const category = categoryName ? CATEGORY_BY_NAME.get(categoryName) : undefined;
  if (!category || !p.variants.length) return null;
  const cf = p.customFields;
  const alcohol = hasFacet(p.facetValues, "alcohol");
  const soldOut = p.variants.every((v) => v.stockLevel === "OUT_OF_STOCK");
  const withOptions = p.variants.length > 1 || p.variants[0].options.length > 0;
  const assets = [p.featuredAsset, ...p.assets].filter((a): a is NonNullable<Asset> => Boolean(a));
  const images = assets.filter((a, i) => assets.findIndex((b) => b.source === a.source) === i).map((a) => image(a, p.name));
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    category,
    festivalId: p.collections.find((c) => c.parent?.slug === FESTIVE_COLLECTION)?.slug ?? null,
    // Vendure reports stock as a level, not a count: sold out shows as stock 0; otherwise the backend
    // enforces stock at checkout.
    status: soldOut && cf.availabilityNote ? "sold_out" : "active",
    stock: soldOut ? 0 : null,
    availabilityNote: cf.availabilityNote || undefined,
    price: p.variants[0].priceWithTax / 100,
    summary: cf.summary ?? "",
    description: htmlToText(p.description),
    contents: [],
    specs: [],
    images,
    variants: withOptions
      ? p.variants.map((v) => ({
          id: v.id,
          sku: v.sku,
          name: v.options.map((o) => o.name).join(" · ") || v.name,
          price: v.priceWithTax / 100,
          note: v.customFields.note || undefined,
          containsAlcohol: alcohol || hasFacet(v.facetValues, "alcohol"),
        }))
      : [],
    defaultVariant: { id: p.variants[0].id, sku: p.variants[0].sku },
    personalisation: {
      enabled: true,
      label: cf.personalisationLabel || DEFAULT_PERSONALISATION.label,
      helper: cf.personalisationHelper || undefined,
      maxLength: cf.personalisationMaxLength || DEFAULT_PERSONALISATION.maxLength,
      fee: namesFee,
    },
    noPersonalisation: cf.personalisationEnabled === false,
    containsAlcohol: alcohol,
    featured: Boolean(cf.featured),
    sort: cf.sortOrder ?? 100,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

export interface Catalog {
  products: Product[];
  /** The "Personalised name" item, when the shop sells names. */
  names: { variantId: string; fee: number } | null;
}

async function fetchCatalog(): Promise<Catalog> {
  const items: VProduct[] = [];
  for (let skip = 0; ; skip += 100) {
    const { data } = await shopApi<{ products: { totalItems: number; items: VProduct[] } }>(PRODUCTS, { skip });
    items.push(...data.products.items);
    if (items.length >= data.products.totalItems || !data.products.items.length) break;
  }
  const namesVariant = items.flatMap((p) => p.variants).find((v) => v.sku === NAMES_SKU);
  const names = namesVariant ? { variantId: namesVariant.id, fee: namesVariant.priceWithTax / 100 } : null;
  const products = items
    .map((p) => toProduct(p, names?.fee ?? DEFAULT_PERSONALISATION.fee))
    .filter((p): p is Product => Boolean(p));
  return { products, names };
}

async function fetchFestivals(): Promise<Festival[]> {
  const { data } = await shopApi<{
    collections: {
      items: { id: string; slug: string; name: string; description: string; position: number; updatedAt: string; featuredAsset: Asset; parent: { slug: string } | null }[];
    };
  }>(COLLECTIONS);
  return data.collections.items
    .filter((c) => c.parent?.slug === FESTIVE_COLLECTION)
    .map((c) => ({
      id: c.slug,
      slug: c.slug,
      name: c.name,
      description: htmlToText(c.description) || undefined,
      coverImage: c.featuredAsset ? image(c.featuredAsset, c.name) : null,
      active: true,
      sort: c.position,
      updatedAt: c.updatedAt,
    }));
}

async function fetchSettings(catalog: Catalog): Promise<SiteSettings> {
  const base: SiteSettings = { ...seedSettings, personalisationLive: Boolean(catalog.names) };
  try {
    const { data } = await shopApi<{ activeChannel: { customFields: Record<string, string | boolean | null> } }>(CHANNEL_CONTENT);
    const c = data.activeChannel.customFields;
    const text = (v: unknown, fallback: string) => (typeof v === "string" && v.trim() ? v : fallback);
    return {
      ...base,
      activeFestivalId: typeof c.featuredCollectionSlug === "string" ? c.featuredCollectionSlug : base.activeFestivalId,
      festiveTitle: text(c.featuredTitle, base.festiveTitle),
      festiveIntro: text(c.featuredIntro, base.festiveIntro),
      heroEyebrow: text(c.heroEyebrow, base.heroEyebrow),
      heroTitle: text(c.heroTitle, base.heroTitle),
      heroText: text(c.heroText, base.heroText),
      whatsappNumber: text(c.whatsappNumber, base.whatsappNumber),
      contactEmail: text(c.contactEmail, ""),
      businessHours: text(c.businessHours, ""),
      showPreviewNotice: typeof c.showPreviewNotice === "boolean" ? c.showPreviewNotice : base.showPreviewNotice,
    };
  } catch {
    // The shop hasn't got the storefront-content plugin: keep the built-in texts.
    return base;
  }
}

// A short in-memory cache keeps pages fast; stock and prices are re-checked by the backend at checkout.
const TTL_MS = 30_000;
const memo = new Map<string, { at: number; value: Promise<unknown> }>();
function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as Promise<T>;
  const value = load().catch((err) => {
    memo.delete(key);
    throw err;
  });
  memo.set(key, { at: Date.now(), value });
  return value;
}

export const getCatalog = () => cached("catalog", fetchCatalog);
export const getFestivals = () => cached("festivals", fetchFestivals);
export const getSettings = () => cached("settings", async () => fetchSettings(await getCatalog()));
