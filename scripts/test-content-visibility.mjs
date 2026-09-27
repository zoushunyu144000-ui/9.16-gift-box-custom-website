import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const css = readFileSync(new URL("src/app/globals.css", root), "utf8");
const reveal = readFileSync(new URL("src/components/reveal.tsx", root), "utf8");
const productImage = readFileSync(new URL("src/components/product-image.tsx", root), "utf8");

const revealRule = css.match(/\.js \[data-reveal\]\s*\{([^}]+)\}/s);
assert.ok(revealRule, "the scroll-reveal rule should remain available");
assert.doesNotMatch(revealRule[1], /opacity\s*:\s*0(?:\s|;|$)/, "server-rendered content must not start transparent");
assert.match(reveal, /new MutationObserver/, "query-only navigation must register newly mounted reveal elements");

const imageTag = productImage.match(/<img[\s\S]*?\/>/)?.[0];
assert.ok(imageTag, "ProductImage should render an image element");
assert.doesNotMatch(imageTag, /opacity-0/, "a pending image must not be hidden by opacity");
assert.match(imageTag, /onError=\{\(\) => setFailed\(true\)\}/, "failed images must still use the fallback");

console.log("Content visibility checks passed.");
