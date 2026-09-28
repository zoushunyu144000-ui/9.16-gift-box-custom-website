import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";

const root = new URL("../", import.meta.url);
const seed = readFileSync(new URL("src/data/seed.ts", root), "utf8");
const start = seed.indexOf('slug: "grand-prosperity-hamper"');
const end = seed.indexOf("\n  }),", start);

assert.ok(start >= 0 && end > start, "Grand Prosperity Hamper seed record must exist");

const product = seed.slice(start, end);
const imageBlock = product.match(/images:\s*\[([\s\S]*?)\]/)?.[1] ?? "";
const localImages = [...imageBlock.matchAll(/src:\s*"(\/images\/[^\"]+)"/g)].map((match) => match[1]);

assert.equal(localImages.length, 3, "Grand Prosperity Hamper must use exactly three project-local gallery images");
assert.doesNotMatch(imageBlock, /red envelope/i, "Grand Prosperity Hamper gallery must not reference a red-envelope image");
assert.match(product, /"Red envelope set"/, "The product contents must retain the Red envelope set item");

for (const src of localImages) {
  const asset = new URL(`public${src}`, root);
  assert.ok(existsSync(asset), `missing gallery asset: ${src}`);
  assert.ok(statSync(asset).size > 0, `gallery asset is empty: ${src}`);
}

console.log("Grand Prosperity Hamper gallery checks passed.");
