import { CATEGORIES, festivalName, isPurchasable, sortProducts } from "./catalog";
import type { Festival, Product } from "./types";

function norm(s: string) {
  return s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
}

/** Simple weighted text search across the catalogue. Good for a few hundred products. */
export function searchProducts(products: Product[], query: string, festivals: Festival[] = []) {
  const terms = norm(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const scored = products
    .filter((p) => p.status !== "hidden")
    .map((p) => {
      const name = norm(p.name);
      const hay = norm(
        [
          p.summary,
          p.description,
          p.contents.join(" "),
          CATEGORIES[p.category].name,
          festivalName(festivals, p.festivalId) ?? "",
          // Wine gift boxes are still found when customers type "wine", "champagne", "whisky"…
          p.category === "wine-spirits" ? "wine spirits gift box set" : "",
          p.personalisation?.enabled ? `engraved engraving personalised personalized name ${(p.personalisation.options ?? []).join(" ")}` : "",
          p.variants.map((v) => v.name).join(" "),
        ].join(" "),
      );
      let score = 0;
      for (const t of terms) {
        if (name.includes(t)) score += 5;
        else if (hay.includes(t)) score += 1;
        else return { p, score: 0 };
      }
      if (isPurchasable(p)) score += 0.5;
      return { p, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.map((x) => x.p);
}

export { sortProducts };
