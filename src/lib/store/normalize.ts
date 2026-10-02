import type { Product, SiteSettings } from "@/lib/types";

/**
 * Bring records saved by earlier versions up to date when they are read:
 * - v1 products stored their festival as `occasion` ("mid-autumn", …); it is now `festivalId`.
 *   The seeded festival ids are the same strings, so the relation carries over unchanged.
 * - v1 settings stored `activeOccasion`; it is now `activeFestivalId`.
 */
export function normalizeProduct(p: Product): Product {
  const legacy = p as Product & { occasion?: string | null };
  if (legacy.festivalId === undefined && legacy.occasion !== undefined) {
    const { occasion, ...rest } = legacy;
    return { ...rest, festivalId: occasion ?? null };
  }
  return p;
}

export function normalizeSettings(s: Partial<SiteSettings> & { activeOccasion?: string }): Partial<SiteSettings> {
  if (!s.activeFestivalId && s.activeOccasion) {
    const { activeOccasion, ...rest } = s;
    return { ...rest, activeFestivalId: activeOccasion };
  }
  return s;
}
