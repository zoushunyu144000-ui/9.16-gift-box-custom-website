import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";

const root = new URL("../", import.meta.url);
const logo = readFileSync(new URL("src/components/logo.tsx", root), "utf8");
// Logo files are configured in one place (src/lib/brand.ts) so a new logo is a one-file swap.
const brand = readFileSync(new URL("src/lib/brand.ts", root), "utf8");
const header = readFileSync(new URL("src/components/header.tsx", root), "utf8");
const footer = readFileSync(new URL("src/components/footer.tsx", root), "utf8");
const productImage = readFileSync(new URL("src/components/product-image.tsx", root), "utf8");
const gateway = readFileSync(new URL("src/components/checkout/test-gateway.tsx", root), "utf8");
const monogram = logo.match(/function BrandImage[\s\S]*?(?=export function Logo)/)?.[0] ?? "";
const mobileMenu = header.slice(header.indexOf("function MobileMenu"));

assert.doesNotMatch(monogram, /working reconstruction|<svg/i, "the hand-reconstructed SVG must not remain the rendered logo");
assert.match(logo, /BRAND\.logo\.src/, "the logo must come from the brand config");
assert.match(brand, /moire-logo\.png/, "the client's finished logo must be used");
assert.match(header, /<Logo compact\s*\/>/, "the site header must use the shared logo lockup");
assert.match(mobileMenu, /<Logo compact\s*\/>/, "mobile navigation must use the shared logo lockup");
assert.match(footer, /<Logo(?:\s|\/>)/, "the footer must use the shared logo lockup");
assert.match(gateway, /<Logo compact\s*\/>/, "the hosted payment preview must use the shared logo lockup");
assert.doesNotMatch(gateway, /MOIRÉ\s+CO\./, "the hosted payment preview must not use an accented brand spelling");
assert.match(productImage, /<Monogram/, "failed product images must use the shared approved monogram");

for (const asset of ["public/brand/moire-logo.png"]) {
  const assetUrl = new URL(asset, root);
  assert.ok(existsSync(assetUrl), `missing approved logo asset: ${asset}`);
  assert.ok(statSync(assetUrl).size > 0, `approved logo asset is empty: ${asset}`);
  assert.equal(readFileSync(assetUrl).subarray(0, 8).toString("hex"), "89504e470d0a1a0a", `${asset} must be a PNG`);
}

console.log("Brand asset consistency checks passed.");
