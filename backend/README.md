# Commerce backend (Vendure)

The order, product, payment and delivery backend for the Moire Co. storefront, built so the same
base can run future client shops. The storefront (Next.js, repo root) keeps its own design and talks
to this backend over GraphQL: the **Shop API** for customers, the **Admin API** and **dashboard** for staff.

- Vendure 3.7 (TypeScript / NestJS), Postgres, React dashboard. No Redis needed.
- Plan, decisions and research: [`../docs/commerce-backend-plan.md`](../docs/commerce-backend-plan.md).

## Run it locally

Needs Node 20.19+ and Postgres 14+.

```bash
cd backend
cp .env.example .env          # fill in COOKIE_SECRET, SUPERADMIN_PASSWORD and the DB_* values
npm install
npm run setup:store -- stores/moire   # creates the schema, then the Moire shop (once, on an empty database)
npm run dev                   # server + worker + dashboard
```

| URL | What |
|---|---|
| http://localhost:3000/dashboard | Staff dashboard (log in with SUPERADMIN_USERNAME / SUPERADMIN_PASSWORD) |
| http://localhost:3000/shop-api | Storefront API |
| http://localhost:3000/admin-api | Admin API |
| http://localhost:3000/graphiql | API explorer (dev only) |
| http://localhost:3000/mailbox | Emails the shop would have sent (dev only) |

## A shop is a folder in `stores/`

`npm run setup:store -- stores/<shop>` builds a shop on an empty database from:

| File | Contents |
|---|---|
| `store.json` | Name, currency, language, country, tax rate, a placeholder delivery rate, which staff roles to create, where local photos live |
| `products.csv` | Products and variants in [Vendure's import format](https://docs.vendure.io/current/core/developer-guide/importing-data): name, slug, description, photos (URLs or files), facets, options, SKU, price, stock |
| `collections.json` | Collections (e.g. one per festival), filled from the products' facets |

For a new client, copy `stores/moire`, change the files (a spreadsheet exported as CSV works for
products) and run the command on the client's own database. Moire's files are generated from the
storefront's sample catalogue: `npx tsx scripts/export-vendure-catalogue.ts` from the repo root.

## Staff roles

Created by the setup script; the owner adds people under **Settings → Administrators** and can
create more roles under **Settings → Roles**.

| Role | Can |
|---|---|
| owner | Everything except the super admin account |
| customer-service | Orders and draft orders, customers; catalogue read-only |
| packer | Sees orders and marks them shipped; catalogue read-only |

Vendure ties shipping an order to the same `UpdateOrder` permission as refunds and cancellations, so
until the staff-permissions plugin adds a ship-only permission a packer can technically refund too.

## Database changes

The schema comes only from `src/migrations` (`synchronize` is off). After changing custom fields or
adding entities in a plugin:

```bash
npm run migration:generate -- <name>   # writes src/migrations/<timestamp>-<name>.ts — commit it
npm run migrate                        # or just start the server: pending migrations run first
```

## Production notes

- `APP_ENV` anything but `dev`; set `CORS_ORIGINS` to the storefront's origins and `ASSET_URL_PREFIX`.
- Managed Postgres such as Supabase: `DB_SSL=true` (plus `DB_SSL_CA` if needed), session pooler port 5432.
- Email goes out through SMTP when `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` are set, and is skipped otherwise.
- Login CSRF protection (`apiOptions.csrfPrevention`) is on; the storefront must call the APIs with JSON POSTs.
- Run the server (`npm run start:server`) and the worker (`npm run start:worker`) as two processes.
