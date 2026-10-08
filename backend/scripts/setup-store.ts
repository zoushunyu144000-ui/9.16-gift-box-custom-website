/**
 * Sets up a new shop from a store folder, on an empty database:
 *   store.json        currency, language, country, tax rate, placeholder delivery rate, staff roles
 *   products.csv      products in Vendure's import format (photos may be URLs or files in assetsDir)
 *   collections.json  collections, built from the products' facets
 * Usage (from backend/): npm run setup:store -- stores/moire
 * Runs the migrations first. Refuses to run on a database that already has a shop, so it can't duplicate data.
 */
import {
    bootstrap,
    ChannelService,
    ConfigService,
    CountryService,
    CurrencyCode,
    DefaultLogger,
    dummyPaymentHandler,
    InitialData,
    isInspectableJobQueueStrategy,
    JobQueueService,
    LanguageCode,
    LogLevel,
    Permission,
    ProductService,
    RequestContextService,
    runMigrations,
    SearchService,
} from '@vendure/core';
import { importProductsFromCsv, populateCollections, populateInitialData } from '@vendure/core/cli';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { config } from '../src/vendure-config';

interface StoreDefinition {
    name: string;
    currency: keyof typeof CurrencyCode;
    language: keyof typeof LanguageCode;
    pricesIncludeTax: boolean;
    country: { name: string; code: string };
    taxRate: { name: string; percentage: number };
    /** Flat placeholder until a shipping calculator plugin is configured. In major units, e.g. 20 = RM 20. */
    deliveryRate: { name: string; price: number };
    roles: (keyof typeof ROLE_PRESETS)[];
    /** Folder that relative photo paths in products.csv / collections.json are read from. */
    assetsDir?: string;
}

const NOT_FOR_STAFF_ROLES = [Permission.SuperAdmin, Permission.Owner, Permission.Public, Permission.Authenticated];

/** Staff roles every shop starts with. Owners add people in the dashboard: Settings → Administrators. */
const ROLE_PRESETS = {
    owner: {
        code: 'owner',
        description: 'Owner: everything except the super admin account',
        permissions: Object.values(Permission).filter(p => !NOT_FOR_STAFF_ROLES.includes(p)),
    },
    'customer-service': {
        code: 'customer-service',
        description: 'Customer service: orders, draft orders and customers; catalogue read-only',
        permissions: [
            Permission.ReadCatalog,
            Permission.ReadOrder,
            Permission.CreateOrder,
            Permission.UpdateOrder,
            Permission.ReadCustomer,
            Permission.CreateCustomer,
            Permission.UpdateCustomer,
            Permission.ReadCustomerGroup,
            Permission.ReadPromotion,
            Permission.ReadPaymentMethod,
            Permission.ReadShippingMethod,
            Permission.ReadStockLocation,
            Permission.ReadCountry,
            Permission.ReadZone,
        ],
    },
    packer: {
        code: 'packer',
        description: 'Packing: sees orders and marks them shipped; catalogue read-only',
        permissions: [
            Permission.ReadCatalog,
            Permission.ReadOrder,
            // Vendure ties fulfilment to UpdateOrder; a fulfil-only permission is added by the staff permissions plugin.
            Permission.UpdateOrder,
            Permission.ReadShippingMethod,
            Permission.ReadStockLocation,
            Permission.ReadCountry,
            Permission.ReadZone,
        ],
    },
};

async function main() {
    const dirArg = process.argv[2];
    if (!dirArg) throw new Error('Usage: npm run setup:store -- stores/<store>');
    const dir = path.resolve(process.cwd(), dirArg);
    const store = JSON.parse(readFileSync(path.join(dir, 'store.json'), 'utf8')) as StoreDefinition;
    const productsCsv = path.join(dir, 'products.csv');
    const collectionsFile = path.join(dir, 'collections.json');
    const collections = existsSync(collectionsFile) ? JSON.parse(readFileSync(collectionsFile, 'utf8')) : [];
    const currency = CurrencyCode[store.currency];
    const language = LanguageCode[store.language];
    if (!currency || !language) throw new Error(`Unknown currency or language in ${dirArg}/store.json`);
    for (const role of store.roles) if (!ROLE_PRESETS[role]) throw new Error(`Unknown role preset "${role}"`);

    const initialData: InitialData = {
        defaultLanguage: language,
        defaultZone: store.country.name,
        countries: [{ name: store.country.name, code: store.country.code, zone: store.country.name }],
        taxRates: [store.taxRate],
        shippingMethods: [{ name: store.deliveryRate.name, price: Math.round(store.deliveryRate.price * 100) }],
        paymentMethods: [
            {
                name: 'Test payment',
                handler: { code: dummyPaymentHandler.code, arguments: [{ name: 'automaticSettle', value: 'true' }] },
            },
        ],
        roles: store.roles.map(r => ROLE_PRESETS[r]),
        collections,
    };

    await runMigrations(config);
    const app = await bootstrap({
        ...config,
        apiOptions: { ...config.apiOptions, port: +(process.env.SETUP_PORT || 3099) },
        importExportOptions: { importAssetsDir: path.resolve(dir, store.assetsDir ?? 'assets') },
        logger: new DefaultLogger({ level: LogLevel.Warn }),
    });
    try {
        const ctx = await app.get(RequestContextService).create({ apiType: 'admin' });
        const countries = await app.get(CountryService).findAll(ctx);
        const products = await app.get(ProductService).findAll(ctx, { take: 1 });
        if (countries.totalItems > 0 || products.totalItems > 0) {
            console.log('This database already has a shop. Nothing was changed.');
            return;
        }
        await app.get(JobQueueService).start();

        console.log(`Setting up ${store.name}…`);
        await populateInitialData(app, initialData);

        // Prices are stored in the channel's currency, so set it before the products come in.
        const channelService = app.get(ChannelService);
        const channel = await channelService.getDefaultChannel(ctx);
        await channelService.update(ctx, {
            id: channel.id,
            defaultCurrencyCode: currency,
            availableCurrencyCodes: [currency],
            defaultLanguageCode: language,
            pricesIncludeTax: store.pricesIncludeTax,
        });

        const result = await importProductsFromCsv(app, productsCsv, language);
        console.log(`Imported ${result.imported} products.`);
        for (const error of result.errors ?? []) console.warn(`  ${error}`);

        await populateCollections(app, initialData);
        await app.get(SearchService).reindex(await app.get(RequestContextService).create({ apiType: 'admin' }));
        await waitForJobs(app.get(ConfigService));
        console.log(`Done: ${collections.length} collections, roles ${store.roles.join(', ')}, prices in ${currency}.`);
    } finally {
        await app.close();
    }
}

/** Collections and the search index are built by background jobs; let them finish before closing. */
async function waitForJobs(configService: ConfigService, timeoutMs = 120_000) {
    const strategy = configService.jobQueueOptions.jobQueueStrategy;
    if (!isInspectableJobQueueStrategy(strategy)) return;
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        const open = await strategy.findMany({ filter: { state: { in: ['PENDING', 'RUNNING', 'RETRYING'] } }, take: 1 });
        if (open.totalItems === 0) return;
        await new Promise(r => setTimeout(r, 1000));
    }
    console.warn('Background jobs were still running after 2 minutes; the worker will finish them.');
}

main().then(
    () => process.exit(0),
    err => {
        console.error(err);
        process.exit(1);
    },
);
