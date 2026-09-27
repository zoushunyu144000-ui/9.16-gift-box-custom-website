import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/components/festive-view.tsx", import.meta.url), "utf8");
const campaign = source.match(/const campaign\s*=\s*([^;]+);/)?.[1]?.trim();

assert.equal(
  campaign,
  "lead?.images[0]",
  "Festive campaign artwork must use the lead gift's primary scene image, not a product-detail image.",
);

console.log("Festive campaign image check passed.");
