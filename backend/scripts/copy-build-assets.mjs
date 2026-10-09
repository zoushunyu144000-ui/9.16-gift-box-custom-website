// Files the server reads at runtime that tsc doesn't copy into dist/, so dist/ can run on its own.
// Runs after `npm run build` and `npm run build:server`.
import { cpSync, existsSync } from 'node:fs';

const ASSETS = ['plugins/delivery-my/data'];

for (const rel of ASSETS) {
    if (existsSync(`src/${rel}`)) cpSync(`src/${rel}`, `dist/${rel}`, { recursive: true });
}
