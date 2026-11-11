// Checks that nothing about alcohol reaches customers while ALCOHOL_ON_SALE is false.
// Run: npx tsx scripts/test-hide-alcohol.ts
import { withoutAlcohol } from "../src/lib/alcohol";
import { seedProducts } from "../src/data/seed";

const out = withoutAlcohol(seedProducts);
const words = /\b(wines?|champagnes?|whisk(?:e)?y|alcohol)\b/i;
let failed = 0;
for (const p of out) {
  const text = JSON.stringify({ n: p.name, s: p.summary, d: p.description, c: p.contents, sp: p.specs, v: p.variants });
  if (p.category === "wine-spirits" || p.containsAlcohol || p.variants.some((v) => v.containsAlcohol) || words.test(text)) {
    console.log("STILL SHOWS ALCOHOL:", p.slug, text.match(words)?.[0]);
    failed++;
  }
}
const tea = out.find((p) => p.slug === "reunion-tea-box");
console.log(`${seedProducts.length} products in, ${out.length} shown; tea box price ${tea?.price}, options ${tea?.variants.map((v) => v.name).join(", ")}`);
console.log(failed ? `FAILED: ${failed}` : "OK");
process.exit(failed ? 1 : 0);
