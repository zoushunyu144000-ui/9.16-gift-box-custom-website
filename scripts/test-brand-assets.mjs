import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";

const root = new URL("../", import.meta.url);
const logo = readFileSync(new URL("src/components/logo.tsx", root), "utf8");
const header = readFileSync(new URL("src/components/header.tsx", root), "utf8");
const footer = readFileSync(new URL("src/components/footer.tsx", root), "utf8");
const productImage = readFileSync(new URL("src/components/product-image.tsx", root), "utf8");
const monogram = logo.match(/export function Monogram[\s\S]*?(?=export function Logo)/)?.[0] ?? "";
const mobileMenu = header.slice(header.indexOf("function MobileMenu"));

assert.doesNotMatch(monogram, /working reconstruction|<svg/i, "the hand-reconstructed SVG must not remain the rendered logo");
assert.match(logo, /moire-monogram\.png/, "the approved transparent monogram must be used");
assert.match(logo, /moire-wordmark\.png/, "the approved wordmark source must be used");
assert.match(header, /<Logo compact\s*\/>/, "the site header must use the shared logo lockup");
assert.match(mobileMenu, /<Logo compact\s*\/>/, "mobile navigation must use the shared logo lockup");
assert.match(footer, /<Logo(?:\s|\/>)/, "the footer must use the shared logo lockup");
assert.match(productImage, /<Monogram/, "failed product images must use the shared approved monogram");

for (const asset of ["public/brand/moire-monogram.png", "public/brand/moire-wordmark.png"]) {
  const assetUrl = new URL(asset, root);
  assert.ok(existsSync(assetUrl), `missing approved logo asset: ${asset}`);
  assert.ok(statSync(assetUrl).size > 0, `approved logo asset is empty: ${asset}`);
  assert.equal(readFileSync(assetUrl).subarray(0, 8).toString("hex"), "89504e470d0a1a0a", `${asset} must be a PNG`);
}

console.log("Brand asset consistency checks passed.");
