export {};

// Members of process.env used by the backend, so they can be read in a type-safe way.
declare global {
    namespace NodeJS {
        interface ProcessEnv {
            APP_ENV: string;
            VENDURE_SERVER_PORT: string;
            PORT: string;
            COOKIE_SECRET: string;
            SUPERADMIN_USERNAME: string;
            SUPERADMIN_PASSWORD: string;
            CORS_ORIGINS?: string;
            DB_HOST: string;
            DB_PORT: string;
            DB_NAME: string;
            DB_USERNAME: string;
            DB_PASSWORD: string;
            DB_SCHEMA?: string;
            DB_SSL?: string;
            ASSET_URL_PREFIX?: string;
            STOREFRONT_URL?: string;
            EMAIL_FROM?: string;
        }
    }
}
