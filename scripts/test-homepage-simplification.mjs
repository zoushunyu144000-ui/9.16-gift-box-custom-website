import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/app/(shop)/page.tsx", import.meta.url), "utf8");
const layoutSource = await readFile(new URL("../src/lib/home-layout.ts", import.meta.url), "utf8");
const hero = await readFile(new URL("../src/components/hero.tsx", import.meta.url), "utf8");
const layout = await readFile(new URL("../src/app/layout.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/app/globals.css", import.meta.url), "utf8");

assert.match(source, /category === "festive"[^\n]+, 4\)/, "Homepage should show four representative Festive products");
assert.doesNotMatch(source, /<WineList\b|<ProcessLine\b|function CorporatePath/, "Detailed inner-page presentations should not remain on the homepage");
assert.doesNotMatch(source, /aria-label="About Moire\.?"/, "Standalone brand-pause section should be removed from the homepage flow");
assert.match(source, />Premium Seasonal Gifting<\/h2>/, "Festive section heading reads Premium Seasonal Gifting (client, Oct 2026)");
assert.doesNotMatch(source, /splitYear|display-italic/, "The seasonal year should not be an oversized editorial device");
assert.match(source, /wine: "walnut"/, "Wine should provide the homepage's warm dark colour beat");
assert.doesNotMatch(source, /imageSide=/, "All category gateways should use one consistent composition");
assert.match(source, /<ProductCard[\s\S]{0,300}\bcompact\b/, "Festive cards should use the compact commercial presentation");

assert.doesNotMatch(hero, /<MoireField\b|<Emph\b/, "Hero should not depend on decorative editorial treatments");
assert.doesNotMatch(hero, /href="\/corporate"/, "Hero should have one clear primary action");
assert.equal((hero.match(/<Link\b/g) ?? []).length, 1, "Hero should expose one Shop Now CTA");
assert.match(hero, /SHOP NOW/, "Hero CTA reads Shop Now (client, Oct 2026)");
assert.doesNotMatch(hero, /border border-line/, "Hero should read as one integrated brand scene, not a bordered UI card");
assert.doesNotMatch(hero, /animate-fade-up/, "Critical hero copy should be visible immediately without delayed entrance animation");
assert.match(source, /builtInSlides = \[siteImages\.homeHero,/, "Hero should open on the unbranded warm gift-box scene selected for the homepage (until the shop uploads its own)");
assert.match(source, /heroSlides: ProductImageData\[\] = settings\.homeSlides\?\.length/, "Hero should use the slideshow the shop uploaded in the back office, when there is one");
assert.match(source, /fixed: siteImages\.homeFixed/, "Fixed Gifts gateway should use its unbranded homepage photograph");
assert.match(source, /corporate: siteImages\.homeCorporate/, "Corporate gateway should use its unbranded homepage photograph");
assert.match(source, /wine: siteImages\.homeWine/, "Wine gateway should use its dedicated unbranded homepage photograph");
assert.match(source, /settings\.festiveEnabled !== false && festiveWindowOpen\(settings\.festiveStart, settings\.festiveEnd\)/, "The festive section should follow the back office on/off switch and its start and end days");
assert.match(source, /\.filter\(\(p\) => p\.showcase\)/, "The festive row should show the products the shop chose for it");
assert.match(source, /showcaseOrder/, "The festive row should keep the order the shop set");
assert.match(hero, /home-cta/, "Hero should use the quieter homepage-specific CTA treatment");
assert.doesNotMatch(hero, /home-cta--quiet/, "Hero should remain the homepage's single primary CTA");
assert.match(source, /home-cta home-cta--quiet/, "Category gateways should use the quieter CTA modifier");
assert.match(layout, /@fontsource-variable\/lora/, "Homepage display typography should use the screen-readable Lora variable font");
assert.doesNotMatch(layout, /@fontsource-variable\/bodoni-moda/, "Bodoni Moda should no longer load as the site display font");
assert.match(styles, /--font-display: "Lora Variable"/, "The global display token should use Lora Variable");
assert.match(styles, /--color-walnut: #6b513d;/, "Wine should use the approved warmer walnut tone");
assert.match(styles, /\.home-cta--quiet\s*\{/, "The homepage should define a restrained category CTA modifier");

for (const route of ["/fixed-gifts", "/wine-gift-boxes", "/corporate"]) {
  assert.ok(layoutSource.includes(`href: "${route}"`), `Homepage should keep a direct CTA to ${route}`);
}

// The festive section comes first, then the three blocks in the approved default order (the shop can reorder them).
assert.ok(source.indexOf('id="festive-heading"') >= 0 && source.indexOf('id="festive-heading"') < source.indexOf("blocks.map"), "The festive section should come before the three blocks");
assert.match(layoutSource, /BLOCK_KEYS: BlockKey\[\] = \["corporate", "wine", "fixed"\]/, "Homepage blocks should default to the approved order: corporate, wine, fixed");
assert.match(source, /id=\{`\$\{block\.key\}-heading`\}/, "Each block should keep its heading id for accessibility");
for (const copy of [
  'eyebrow: "For business"', 'title: "Corporate Gifting"', 'text: "Semi-curated / Fully customised — Personalised gifts tailored to your brand and efficient bulk orders."',
  'eyebrow: "Cheers to you"', 'title: "Wine Gift Series"', 'text: "A refined selection of ready-to-gift wine sets, thoughtfully paired for every occasion."',
  'eyebrow: "Ready to gift"', 'title: "Signature Fixed Gifts"', 'text: "Beautifully curated and ready to gift."',
]) {
  assert.ok(layoutSource.includes(copy), `Homepage gateway copy should match the client's mockup: ${copy}`);
}

console.log("Homepage simplification guard passed.");
