import type { Product } from "./types";

/**
 * Wine gift boxes are off the shop for now (Nov 2026): the payment provider (CHIP) does not accept
 * merchants that sell alcohol online. Products stay in the back office untouched; the storefront
 * simply does not show them, their page, menu links or the homepage block.
 *
 * Do not switch this back on while CHIP is the payment provider.
 */
export const ALCOHOL_ON_SALE = false;

// "Whisky Glasses" in a box is glassware, not a drink, so a word followed by "glass" does not count.
const ALCOHOL_WORDS = /\b(wines?|champagnes?|prosecco|whisk(?:e)?y|spirits|liquors?|alcohol(?:ic)?|beers?|sake|cognac|brandy|vodka|gin|rum|baijiu|hennessy|martell?|vsop)\b(?!\s*glass)/i;

/**
 * Gifts the shop asked to take off by hand because the bottle is in the photos but not in the text
 * (11-11: RAM ROYAL is photographed with Hennessy XO). Tagging "Contains alcohol" in the back office
 * does the same; remove a slug here once that gift is sold without the bottle.
 */
const TAKEN_OFF = new Set(["ram-royal"]);

function isAlcoholProduct(p: Product) {
  return p.category === "wine-spirits" || Boolean(p.containsAlcohol) || TAKEN_OFF.has(p.slug);
}

/** A gift whose own contents list a bottle (e.g. "1 × MONTES Red Wine") even though nobody tagged it. */
function listsAlcohol(p: Product) {
  return [p.name, p.summary, p.description, ...(p.contents ?? [])].some((t) => t && ALCOHOL_WORDS.test(t));
}

/** Sentences of a text that do not mention alcohol (a gift's description may describe its wine version). */
function withoutAlcoholSentences(text: string) {
  if (!text || !ALCOHOL_WORDS.test(text)) return text;
  // Line by line, so the paragraphs of the description stay as the shop wrote them.
  return text
    .split("\n")
    .map((line) =>
      line
        .split(/(?<=[.!?])\s+/)
        .filter((s) => !ALCOHOL_WORDS.test(s))
        .join(" "),
    )
    .filter((line, i, lines) => line.trim() !== "" || (i > 0 && lines[i - 1].trim() !== ""))
    .join("\n")
    .trim();
}

/** The catalogue as customers may see it: alcohol products dropped, alcohol versions of other gifts removed. */
export function withoutAlcohol(products: Product[]): Product[] {
  if (ALCOHOL_ON_SALE) return products;
  return products.flatMap((p) => {
    if (isAlcoholProduct(p)) return [];
    const variants = (p.variants ?? []).filter((v) => !v.containsAlcohol && !ALCOHOL_WORDS.test(`${v.name} ${v.note ?? ""}`));
    if (p.variants?.length && variants.length === 0) return [];
    const changedVariants = variants.length !== (p.variants?.length ?? 0);
    // Only a gift that also comes without alcohol keeps its page (its wine edition's lines are cut below);
    // one whose box itself holds a bottle is off the shop entirely.
    if (!changedVariants && listsAlcohol(p)) return [];
    return [
      {
        ...p,
        variants,
        // The base price follows the first option, so it moves with it when that option was the alcohol one.
        ...(changedVariants && variants[0] ? { price: variants[0].price, compareAt: variants[0].compareAt } : {}),
        summary: withoutAlcoholSentences(p.summary),
        description: withoutAlcoholSentences(p.description),
        contents: (p.contents ?? []).filter((c) => !ALCOHOL_WORDS.test(c)),
        specs: (p.specs ?? []).filter((s) => !ALCOHOL_WORDS.test(`${s.label} ${s.value}`)),
      },
    ];
  });
}
