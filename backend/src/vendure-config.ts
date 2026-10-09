import {
    dummyPaymentHandler,
    DefaultJobQueuePlugin,
    DefaultOrderByCodeAccessStrategy,
    DefaultSchedulerPlugin,
    DefaultSearchPlugin,
    VendureConfig,
} from '@vendure/core';
import { EmailPlugin, EmailPluginOptions, FileBasedTemplateLoader } from '@vendure/email-plugin';
import { AssetServerPlugin } from '@vendure/asset-server-plugin';
import { DashboardPlugin } from '@vendure/dashboard/plugin';
import { GraphiqlPlugin } from '@vendure/graphiql-plugin';
import 'dotenv/config';
import path from 'path';
import { emailHandlers, emailTemplateVars } from './email/branding';
import { AgeCheckPlugin } from './plugins/age-check/age-check.plugin';
import { CatalogDisplayPlugin } from './plugins/catalog-display/catalog-display.plugin';
import { GiftMessagePlugin } from './plugins/gift-message/gift-message.plugin';
import { PersonalisationPlugin } from './plugins/personalisation/personalisation.plugin';

const IS_DEV = process.env.APP_ENV === 'dev';
// PORT wins because hosting platforms inject it into the environment at runtime, and that
// must take precedence over any value baked into the .env file.
const serverPort = +process.env.PORT || +process.env.VENDURE_SERVER_PORT || 3000;
const storefrontUrl = (process.env.STOREFRONT_URL || 'http://localhost:3001').replace(/\/$/, '');

// Dev writes emails to files (browse them at /mailbox). Production sends through SMTP when it is
// configured, and sends nothing otherwise rather than failing orders.
const emailTransport: Pick<EmailPluginOptions, 'transport'> | { devMode: true; outputPath: string; route: string } = IS_DEV
    ? { devMode: true, outputPath: path.join(__dirname, '../static/email/test-emails'), route: 'mailbox' }
    : process.env.SMTP_HOST
      ? {
            transport: {
                type: 'smtp',
                host: process.env.SMTP_HOST,
                port: +(process.env.SMTP_PORT || 587),
                auth: { user: process.env.SMTP_USER ?? '', pass: process.env.SMTP_PASS ?? '' },
            },
        }
      : { transport: { type: 'none' } };

export const config: VendureConfig = {
    apiOptions: {
        port: serverPort,
        adminApiPath: 'admin-api',
        shopApiPath: 'shop-api',
        trustProxy: IS_DEV ? false : 1,
        // Which browser origins may make credentialed requests to the Shop and Admin APIs.
        // In dev any origin is reflected; in production set CORS_ORIGINS to the storefront's
        // origins. An unset value blocks all cross-origin browser requests.
        cors: {
            origin: IS_DEV ? true : (process.env.CORS_ORIGINS?.split(',').map(o => o.trim()).filter(Boolean) ?? []),
            credentials: true,
        },
        // Blocks login CSRF from cross-site forms. The dashboard sends the required header, and the
        // storefront talks to the API with JSON POSTs, which are unaffected.
        csrfPrevention: true,
        ...(IS_DEV ? { adminApiDebug: true, shopApiDebug: true } : {}),
    },
    authOptions: {
        tokenMethod: ['bearer', 'cookie'],
        superadminCredentials: {
            identifier: process.env.SUPERADMIN_USERNAME,
            password: process.env.SUPERADMIN_PASSWORD,
        },
        cookieOptions: {
            secret: process.env.COOKIE_SECRET,
        },
    },
    dbConnectionOptions: {
        type: 'postgres',
        // The schema is created and changed only by the migrations in src/migrations.
        synchronize: false,
        migrations: [path.join(__dirname, './migrations/*.+(js|ts)')],
        logging: false,
        host: process.env.DB_HOST,
        port: +process.env.DB_PORT,
        database: process.env.DB_NAME,
        username: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
        schema: process.env.DB_SCHEMA || 'public',
        // Managed Postgres (Supabase, Neon, RDS…): DB_SSL=true, plus DB_SSL_CA when the provider's
        // certificate authority is not in the system store.
        ssl: process.env.DB_SSL === 'true' ? { ca: process.env.DB_SSL_CA || undefined } : false,
    },
    orderOptions: {
        // How long an order's link (its code: the confirmation page, the link in the email) opens
        // without signing in, counted from when it was placed. Members always see their own orders.
        orderByCodeAccessStrategy: new DefaultOrderByCodeAccessStrategy(process.env.ORDER_LINK_VALID_FOR || '30d'),
    },
    paymentOptions: {
        // Test payments only until the Malaysian gateway plugins are added.
        paymentMethodHandlers: [dummyPaymentHandler],
    },
    // When adding or altering custom field definitions, generate a migration (npm run migration:generate).
    customFields: {},
    plugins: [
        ...(IS_DEV ? [GraphiqlPlugin.init()] : []),
        AssetServerPlugin.init({
            route: 'assets',
            assetUploadDir: path.join(__dirname, '../static/assets'),
            // Guessed correctly in dev; in production set ASSET_URL_PREFIX to the public URL of /assets/.
            assetUrlPrefix: IS_DEV ? undefined : process.env.ASSET_URL_PREFIX,
        }),
        DefaultSchedulerPlugin.init(),
        DefaultJobQueuePlugin.init({ useDatabaseForBuffer: true }),
        DefaultSearchPlugin.init({ bufferUpdates: false, indexStockStatus: true }),
        EmailPlugin.init({
            ...emailTransport,
            handlers: emailHandlers,
            templateLoader: new FileBasedTemplateLoader(path.join(__dirname, '../static/email/templates')),
            globalTemplateVars: emailTemplateVars(storefrontUrl),
        } as EmailPluginOptions),
        // Shop features, each reusable on its own.
        PersonalisationPlugin.init({ namesSku: 'personalised-name', defaultMaxLength: 20 }),
        GiftMessagePlugin.init({ maxLength: 200 }),
        AgeCheckPlugin.init({ facetCode: 'alcohol', minimumAge: 21 }),
        CatalogDisplayPlugin,
        DashboardPlugin.init({
            route: 'dashboard',
            appDir: IS_DEV ? path.join(__dirname, '../dist/dashboard') : path.join(__dirname, 'dashboard'),
        }),
    ],
};
