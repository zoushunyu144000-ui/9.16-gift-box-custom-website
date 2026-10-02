import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/app/(shop)/page.tsx", import.meta.url), "utf8");
const hero = await readFile(new URL("../src/components/hero.tsx", import.meta.url), "utf8");
const layout = await readFile(new URL("../src/app/layout.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/app/globals.css", import.meta.url), "utf8");

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
assert.doesNotMatch(hero, /border border-line/, "Hero should read as one integrated brand scene, not a bordered UI card");
assert.doesNotMatch(hero, /animate-fade-up/, "Critical hero copy should be visible immediately without delayed entrance animation");
assert.match(source, /slides=\{\[siteImages\.homeHero\]\}/, "Hero should use the unbranded warm gift-box scene selected for the homepage");
assert.match(source, /fixedImage = siteImages\.homeFixed/, "Fixed Gifts gateway should use its unbranded homepage photograph");
assert.match(source, /image=\{siteImages\.homeCorporate\}/, "Corporate gateway should use its unbranded homepage photograph");
assert.match(source, /wineImage = siteImages\.homeWine/, "Wine gateway should use its dedicated unbranded homepage photograph");
assert.match(hero, /home-cta/, "Hero should use the quieter homepage-specific CTA treatment");
assert.doesNotMatch(hero, /home-cta--quiet/, "Hero should remain the homepage's single primary CTA");
assert.match(source, /home-cta home-cta--quiet/, "Category gateways should use the quieter CTA modifier");
assert.match(layout, /@fontsource-variable\/lora/, "Homepage display typography should use the screen-readable Lora variable font");
assert.doesNotMatch(layout, /@fontsource-variable\/bodoni-moda/, "Bodoni Moda should no longer load as the site display font");
assert.match(styles, /--font-display: "Lora Variable"/, "The global display token should use Lora Variable");
assert.match(styles, /--color-walnut: #6b513d;/, "Wine should use the approved warmer walnut tone");
assert.match(styles, /\.home-cta--quiet\s*\{/, "The homepage should define a restrained category CTA modifier");

for (const route of ["/fixed-gifts", "/wine-gift-boxes", "/corporate"]) {
  assert.match(source, new RegExp(`href=[{]?["]${route.replace("/", "\\/")}`), `Homepage should keep a direct CTA to ${route}`);
}

const order = ["festive-heading", "fixed-heading", "wine-heading", "corporate-heading"].map((id) => source.indexOf(id));
assert.ok(order.every((position) => position >= 0), "All four homepage business sections should remain present");
assert.deepEqual(order, [...order].sort((a, b) => a - b), "Homepage business sections should remain in the approved order");

console.log("Homepage simplification guard passed.");
