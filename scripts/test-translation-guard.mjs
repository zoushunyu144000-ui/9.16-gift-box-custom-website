import fs from "node:fs";

const layout = fs.readFileSync(new URL("../src/app/layout.tsx", import.meta.url), "utf8");

if (!/google:\s*["']notranslate["']/.test(layout) || !/translate=["']no["']/.test(layout)) {
  console.error("Root layout is missing the browser-translation guard.");
  process.exit(1);
}

console.log("Browser-translation guard is present.");
