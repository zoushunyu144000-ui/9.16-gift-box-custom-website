import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/components/editorial-grid.tsx", import.meta.url), "utf8");

assert.ok(
  (source.match(/row\[0\]/g) ?? []).length <= 1,
  "EditorialGrid must not render the same row item into separate mobile and desktop DOM branches",
);

console.log("Editorial grid duplicate-DOM check passed.");
