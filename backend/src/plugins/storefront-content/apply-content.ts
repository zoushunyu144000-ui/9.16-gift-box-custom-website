/**
 * Writes storefront texts to a shop that already exists (the store setup only runs on an empty database).
 * Usage (from backend/, after the migrations have run):
 *   npx ts-node --transpile-only src/plugins/storefront-content/apply-content.ts content.json
 * content.json holds any of the fields, e.g. { "heroTitle": "More than a gift / A memory", "whatsappNumber": "601128691092" }.
 * Runs without the HTTP server, so it works while the shop is running; the running server shows the
 * change within 30 seconds (its channel cache).
 */
import { bootstrapWorker, DefaultLogger, LogLevel, RequestContextService } from '@vendure/core';
import { readFileSync } from 'fs';
import path from 'path';
import { config } from '../../vendure-config';
import { setupStorefrontContent } from './setup';

async function main() {
    const file = process.argv[2];
    if (!file) throw new Error('Usage: npx ts-node --transpile-only src/plugins/storefront-content/apply-content.ts <content.json>');
    const content = JSON.parse(readFileSync(path.resolve(process.cwd(), file), 'utf8'));
    const { app } = await bootstrapWorker({ ...config, logger: new DefaultLogger({ level: LogLevel.Warn }) });
    try {
        const ctx = await app.get(RequestContextService).create({ apiType: 'admin' });
        const channel = await setupStorefrontContent(app, ctx, content);
        console.log(`Storefront content saved to channel "${channel.code}": ${Object.keys(content).join(', ')}.`);
    } finally {
        await app.close();
    }
}

main().then(
    () => process.exit(0),
    err => {
        console.error(err instanceof Error ? err.message : err);
        process.exit(1);
    },
);
