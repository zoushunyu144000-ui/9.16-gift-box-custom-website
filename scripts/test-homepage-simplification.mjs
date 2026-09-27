import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/app/(shop)/page.tsx", import.meta.url), "utf8");
const hero = await readFile(new URL("../src/components/hero.tsx", import.meta.url), "utf8");

assert.match(source, /category === "festive"[^\n]+, 4\)/, "Homepage should show four representative Festive products");
assert.doesNotMatch(source, /<WineList\b|<ProcessLine\b|function CorporatePath/, "Detailed inner-page presentations should not remain on the homepage");
assert.doesNotMatch(source, /aria-label="About Moire Co\."/, "Standalone brand-pause section should be removed from the homepage flow");
assert.match(source, />Festive Collection<\/h2>/, "Festive should use a conventional collection heading");
assert.doesNotMatch(source, /splitYear|display-italic/, "The seasonal year should not be an oversized editorial device");
assert.match(source, /tone="walnut"/, "Wine should provide the homepage's warm dark colour beat");
assert.doesNotMatch(source, /imageSide=/, "All category gateways should use one consistent composition");
assert.match(source, /<ProductCard[\s\S]{0,300}\bcompact\b/, "Festive cards should use the compact commercial presentation");

assert.doesNotMatch(hero, /<MoireField\b|<Emph\b/, "Hero should not depend on decorative editorial treatments");
assert.doesNotMatch(hero, /href="\/corporate"/, "Hero should have one clear primary action");
assert.equal((hero.match(/href="\/festive"/g) ?? []).length, 1, "Hero should expose one collection CTA");

for (const route of ["/fixed-gifts", "/wine-spirits", "/corporate"]) {
  assert.match(source, new RegExp(`href=[{]?["]${route.replace("/", "\\/")}`), `Homepage should keep a direct CTA to ${route}`);
}

const order = ["festive-heading", "fixed-heading", "wine-heading", "corporate-heading"].map((id) => source.indexOf(id));
assert.ok(order.every((position) => position >= 0), "All four homepage business sections should remain present");
assert.deepEqual(order, [...order].sort((a, b) => a - b), "Homepage business sections should remain in the approved order");

console.log("Homepage simplification guard passed.");
