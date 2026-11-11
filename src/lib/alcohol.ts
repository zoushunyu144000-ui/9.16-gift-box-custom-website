import type { Product } from "./types";

/**
 * Wine gift boxes are off the shop for now (Nov 2026): the payment provider (CHIP) does not accept
 * merchants that sell alcohol online. Products stay in the back office untouched; the storefront
 * simply does not show them, their page, menu links or the homepage block.
 *
 * Do not switch this back on while CHIP is the payment provider.
 */
export const ALCOHOL_ON_SALE = false;

function isAlcoholProduct(p: Product) {
  return p.category === "wine-spirits" || Boolean(p.containsAlcohol);
}

/** The catalogue as customers may see it: alcohol products dropped, alcohol versions of other gifts removed. */
export function withoutAlcohol(products: Product[]): Product[] {
  if (ALCOHOL_ON_SALE) return products;
  return products.flatMap((p) => {
    if (isAlcoholProduct(p)) return [];
    if (!p.variants?.some((v) => v.containsAlcohol)) return [p];
    const variants = p.variants.filter((v) => !v.containsAlcohol);
    if (variants.length === 0) return [];
    // The base price follows the first option, so it moves with it when that option was the alcohol one.
    return [{ ...p, variants, price: variants[0].price, compareAt: variants[0].compareAt }];
  });
}
