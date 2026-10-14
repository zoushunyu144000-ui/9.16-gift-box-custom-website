// Checks the homepage layout helpers that read the back office's settings (src/lib/home-layout.ts).
// The module is TypeScript, so it is compiled on the fly with the TypeScript compiler the project already has.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../src/lib/home-layout.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { festiveWindowOpen, malaysiaToday, parseHomeSlides, parseHomeBlocks, isImageAddress, resolveBlock } = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);

// Malaysia is UTC+8: 17:00 UTC on the 14th is already the 15th there.
assert.equal(malaysiaToday(new Date("2026-10-14T17:00:00Z")), "2026-10-15");
assert.equal(malaysiaToday(new Date("2026-10-14T15:59:00Z")), "2026-10-14");

assert.equal(festiveWindowOpen(null, null, "2026-10-15"), true, "no limits: always open");
assert.equal(festiveWindowOpen("", "", "2026-10-15"), true);
assert.equal(festiveWindowOpen("2026-10-15", null, "2026-10-14"), false, "before the first day");
assert.equal(festiveWindowOpen("2026-10-15", null, "2026-10-15"), true, "the first day counts");
assert.equal(festiveWindowOpen(null, "2026-10-20", "2026-10-20"), true, "the last day counts");
assert.equal(festiveWindowOpen(null, "2026-10-20", "2026-10-21"), false, "after the last day");
assert.equal(festiveWindowOpen("2026-10-01", "2026-10-31", "2026-10-15"), true);
assert.equal(festiveWindowOpen("garbage", "also garbage", "2026-10-15"), true, "malformed dates mean no limit, never a broken page");

assert.deepEqual(parseHomeSlides('[{"src":"https://x.example/a.jpg","alt":"A"},{"src":"javascript:alert(1)"},{"src":"/b.jpg"}]'), [
  { src: "https://x.example/a.jpg", alt: "A" },
  { src: "/b.jpg", alt: "" },
]);
assert.deepEqual(parseHomeSlides("not json"), []);
assert.equal(parseHomeSlides(JSON.stringify(Array.from({ length: 9 }, () => ({ src: "/a.jpg" })))).length, 5, "at most five");
assert.ok(!isImageAddress("//evil.example/a.jpg"));

const blocks = parseHomeBlocks('{"order":["wine"],"blocks":{"wine":{"enabled":false,"title":"Cellar"}}}');
assert.deepEqual(blocks.order, ["wine", "corporate", "fixed"], "a block missing from the order goes at the end");
const image = { src: "/built-in.webp", alt: "built in", width: 1, height: 1 };
const wine = resolveBlock("wine", blocks.blocks.wine, image);
assert.equal(wine.enabled, false);
assert.equal(wine.title, "Cellar");
assert.equal(wine.cta, "Explore wine gift boxes", "empty fields use the built-in copy");
assert.equal(wine.image.src, "/built-in.webp");
assert.equal(resolveBlock("fixed", undefined, image).enabled, true);
assert.equal(parseHomeBlocks("[]"), null);

console.log("Homepage layout helper checks passed.");
