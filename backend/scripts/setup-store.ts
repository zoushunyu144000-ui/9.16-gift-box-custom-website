/**
 * Sets up a new shop from a store folder, on an empty database:
 *   store.json        currency, language, country, tax rate, placeholder delivery rate, staff roles
 *   products.csv      products in Vendure's import format (photos may be URLs or files in assetsDir)
 *   collections.json  collections, built from the products' facets
 *   content.json      (optional) the storefront's texts and contact details (storefront-content plugin)
 * then gives the shop the defaults of its plugins (delivery methods, …), which staff adjust in the dashboard.
 * Usage (from backend/): npm run setup:store -- stores/moire
 * Runs the migrations first. Refuses to run on a database that already has a shop, so it can't duplicate data;
 * `-- stores/moire --plugins-only` adds only the plugin defaults that are missing to an existing shop.
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
    PaymentMethodService,
    Permission,
    ProductService,
    RequestContext,
    RequestContextService,
    runMigrations,
    SearchService,
} from '@vendure/core';
import { importProductsFromCsv, populateCollections, populateInitialData } from '@vendure/core/cli';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import type { INestApplication } from '@nestjs/common';
import { setupDeliveryMethods } from '../src/plugins/delivery-my';
import { readEnquiryPermission, updateEnquiryPermission } from '../src/plugins/enquiries/constants';
import { setupLoyalty } from '../src/plugins/loyalty/setup';
import { setupPaymentMethods } from '../src/plugins/payments-my/setup';
import { shipOrderPermission } from '../src/plugins/staff-permissions/permissions';
import { setupStorefrontContent } from '../src/plugins/storefront-content/setup';
import { testPaymentsAllowed } from '../src/plugins/test-payments/test-payments-allowed';
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
/** Permissions our plugins add; Vendure's Permission enum doesn't list them, so roles name them here. */
const ENQUIRY_PERMISSIONS = [readEnquiryPermission.Permission, updateEnquiryPermission.Permission];
const SHIP_ORDER = shipOrderPermission.Permission;

/** Staff roles every shop starts with. Owners add people in the dashboard: Settings → Administrators. */
const ROLE_PRESETS = {
    owner: {
        code: 'owner',
        description: 'Owner: everything except the super admin account',
        permissions: [...Object.values(Permission).filter(p => !NOT_FOR_STAFF_ROLES.includes(p)), ...ENQUIRY_PERMISSIONS, SHIP_ORDER],
    },
    'customer-service': {
        code: 'customer-service',
        description: 'Customer service: orders, draft orders, customers and enquiries; catalogue read-only',
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
            ...ENQUIRY_PERMISSIONS,
            SHIP_ORDER,
        ],
    },
    packer: {
        code: 'packer',
        description: 'Packing: sees orders and ships them (no refunds or order changes); catalogue read-only',
        permissions: [
            Permission.ReadCatalog,
            Permission.ReadOrder,
            // Ships and marks delivered (staff-permissions plugin) without UpdateOrder, which would also allow refunds.
            SHIP_ORDER,
            Permission.ReadShippingMethod,
            Permission.ReadStockLocation,
            Permission.ReadCountry,
            Permission.ReadZone,
        ],
    },
};

async function main() {
    const dirArg = process.argv.slice(2).find(a => !a.startsWith('--'));
    const pluginsOnly = process.argv.includes('--plugins-only');
    if (!dirArg) throw new Error('Usage: npm run setup:store -- stores/<store> [--plugins-only]');
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
            if (!pluginsOnly) {
                console.log('This database already has a shop. Nothing was changed. (--plugins-only adds missing plugin defaults.)');
                return;
            }
            await setupPlugins(app, ctx, dir);
            return;
        }
        if (pluginsOnly) {
            console.log('This database has no shop yet; run without --plugins-only first.');
            return;
        }
        await app.get(JobQueueService).start();

        console.log(`Setting up ${store.name}…`);
        await populateInitialData(app, initialData);

        // The test payment works only in development (or with ALLOW_TEST_PAYMENTS=true), even if left enabled.
        const paymentMethods = app.get(PaymentMethodService);
        const testMethod = (await paymentMethods.findAll(ctx)).items.find(m => m.code === 'test-payment');
        if (testMethod) await paymentMethods.update(ctx, { id: testMethod.id, checker: { code: testPaymentsAllowed.code, arguments: [] } });

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

        await setupPlugins(app, ctx, dir);
        await populateCollections(app, initialData);
        await app.get(SearchService).reindex(await app.get(RequestContextService).create({ apiType: 'admin' }));
        await waitForJobs(app.get(ConfigService));
        console.log(`Done: ${collections.length} collections, roles ${store.roles.join(', ')}, prices in ${currency}.`);
    } finally {
        await app.close();
    }
}

/**
 * Each shop plugin's starting configuration: what it adds is safe to add twice (existing entries are
 * kept as staff left them), and its placeholder prices and settings are adjusted in the dashboard.
 */
async function setupPlugins(app: INestApplication, ctx: RequestContext, dir: string) {
    const delivery = await setupDeliveryMethods(app, ctx);
    console.log(
        `Delivery: created ${delivery.created.join(', ') || 'nothing'}; already there ${delivery.alreadyThere.join(', ') || 'nothing'}; switched off ${delivery.disabled.join(', ') || 'nothing'}.`,
    );
    for (const m of await setupPaymentMethods(app, ctx)) {
        console.log(`Payment method ${m.code}: ${m.enabled ? 'on' : `off until ${m.missing.join(', ')} are filled in`}.`);
    }
    await setupLoyalty(app, ctx);
    console.log('Loyalty points promotion in place.');
    const contentFile = path.join(dir, 'content.json');
    if (existsSync(contentFile)) {
        await setupStorefrontContent(app, ctx, JSON.parse(readFileSync(contentFile, 'utf8')));
        console.log('Storefront texts and contact details saved from content.json.');
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
