import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/components/festive-view.tsx", import.meta.url), "utf8");
const campaign = source.match(/const campaign\s*=\s*([^;]+);/)?.[1]?.trim();

// A cover chosen for the festival in Admin → Festivals wins; otherwise the lead gift's primary scene image.
assert.equal(
  campaign,
  "festival.coverImage ?? lead?.images[0]",
  "Festive campaign artwork must use the lead gift's primary scene image, not a product-detail image.",
);

console.log("Festive campaign image check passed.");
