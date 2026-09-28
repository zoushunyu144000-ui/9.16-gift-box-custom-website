import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const card = readFileSync(new URL("src/components/product-card.tsx", root), "utf8");

assert.match(
  card,
  /const \[first, second\] = product\.images/,
  "product cards must use the second gallery image for hover presentation",
);
assert.match(
  card,
  /group-hover:opacity-100/,
  "the secondary image must fade in when the product card is hovered",
);
assert.match(
  card,
  /scale-\[1\.04\][^"\n]*group-hover:scale-100/,
  "the secondary image must ease into place while it fades in",
);

console.log("Product card hover interaction checks passed.");
