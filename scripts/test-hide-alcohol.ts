// Checks that nothing about alcohol reaches customers while ALCOHOL_ON_SALE is false.
// Run: npx tsx scripts/test-hide-alcohol.ts
import { ALCOHOL_ON_SALE, withoutAlcohol } from "../src/lib/alcohol";
import { seedProducts } from "../src/data/seed";
import type { Product } from "../src/lib/types";

if (ALCOHOL_ON_SALE) {
  // Alcohol is on sale: everything shows, nothing to check.
  const all = withoutAlcohol(seedProducts).length === seedProducts.length;
  console.log(all ? "ALCOHOL_ON_SALE is on: every product shows. OK" : "ALCOHOL_ON_SALE is on but products were hidden. FAILED");
  process.exit(all ? 0 : 1);
}

const words = /\b(wines?|champagnes?|whisk(?:e)?y|alcohol)\b(?!\s*glass)/i;
let failed = 0;
function check(products: Product[]) {
  const out = withoutAlcohol(products);
  for (const p of out) {
    const text = JSON.stringify({ n: p.name, s: p.summary, d: p.description, c: p.contents, sp: p.specs, v: p.variants });
    if (p.category === "wine-spirits" || p.containsAlcohol || p.variants.some((v) => v.containsAlcohol) || words.test(text)) {
      console.log("STILL SHOWS ALCOHOL:", p.slug, text.match(words)?.[0]);
      failed++;
    }
  }
  return out;
}

const out = check(seedProducts);
const tea = out.find((p) => p.slug === "reunion-tea-box");
console.log(`${seedProducts.length} sample products in, ${out.length} shown; tea box price ${tea?.price}, options ${tea?.variants.map((v) => v.name).join(", ")}`);

// Shaped like the shop's real CNY boxes (Nov 2026): untagged, with the bottle listed only in the description.
const base = seedProducts.find((p) => !p.variants.length && !p.containsAlcohol)!;
const box = (slug: string, lower: string): Product => ({
  ...base,
  slug,
  description: `CONSIST: 1 × Premium Gift Box\nUpper Layer: 1 × Premium Grade 5A Bird's Nest\nLower Layer: ${lower}\n6 × MOIRE 2027 Red Packets`,
});
const real = check([
  box("rui", "1 × MONTES Red Wine (700ml) 2 × Premium Mount Fuji Whisky Glasses"),
  box("zen", "1 × Johnnie Walker Golden Label Whiskey (700ml) 2 x Premium Mount Fuji Whisky Glasses"),
  box("zhun", "1 × MARTEL VSOP Red Wine (700ml)"),
  box("ram-royal", "2 x Premium Mount Fuji Whisky Glasses"), // taken off by hand: Hennessy in the photos
  box("glasses-only", "2 x Premium Mount Fuji Whisky Glasses"),
]);
const shown = real.map((p) => p.slug).join(",");
if (shown !== "glasses-only") {
  console.log("REAL-SHAPED BOXES: expected only glasses-only shown, got", shown);
  failed++;
}
if (!real[0]?.description.includes("Whisky Glasses")) {
  console.log("ram-royal lost its glasses line:", real[0]?.description);
  failed++;
}
console.log(`real-shaped boxes shown: ${shown}`);
console.log(failed ? `FAILED: ${failed}` : "OK");
process.exit(failed ? 1 : 0);
