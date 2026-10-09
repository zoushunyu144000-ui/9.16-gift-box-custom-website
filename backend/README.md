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

## Shop plugins (ours)

Each lives in `src/plugins/<name>` and can be used on its own in another shop.

| Plugin | What it does | How a storefront uses it |
|---|---|---|
| `personalisation` | Personalised names charged **per name**. Each product sets whether it offers a name, the option's label, where the name goes and characters per name. Names are bought as their own order line: the names item (SKU `personalised-name`, price = fee per name) with quantity = number of names. Checked on the server (capitals A–Z, numbers, basic punctuation; length; the gift must be in the bag) and again before payment. Staff see a **Personalised names** card on each order. | Add the gift, then `addItemToOrder(namesVariantId, quantity: <number of names>, customFields: { names: "1. JASON\n2. EMILY", namesFor: "<gift SKU>" })`. Refusals come back as `OrderInterceptorError.interceptorError`. Disable the names product to show the option as "Coming soon". |
| `gift-message` | A card message per gift (order line field, 200 characters). Staff see a **Gift messages** card on each order. | `addItemToOrder(…, customFields: { giftMessage })` |
| `age-check` | Orders with items whose product or variant has an `alcohol` facet value can't go to payment until the customer confirms they are 21 or older. | `setOrderCustomFields({ customFields: { ageConfirmed: true } })` |
| `delivery-my` | Malaysian delivery: the zone from the postcode (official data.gov.my table), dispatch days and the 3pm cut-off, closed dates (Global Settings), same-day prices by road distance (Google Routes, `GOOGLE_MAPS_API_KEY`) and courier prices by weight (live courier rates when a rate provider is registered, else a zone × weight table). Checks the preferred delivery date before payment. Details: `src/plugins/delivery-my/README.md`. | `deliveryPromise(postalCode)` for dates and wording, `deliveryQuote(input)` for options and prices before an order exists; `setOrderCustomFields({ customFields: { preferredDeliveryDate, deliveryNotes } })`. |
| `storefront-content` | The storefront's texts and contact details on the channel (homepage banner, featured collection, WhatsApp number, contact email, business hours, preview notice), edited under **Settings → Storefront**. Set up from `stores/<shop>/content.json`. | `activeChannel { customFields { heroTitle … } }` |
| `enquiries` | Corporate quote requests: stored with their gifts and indicative value, emailed to `SHOP_NOTIFY_EMAIL` (reply goes to the customer), listed under **Sales → Enquiries** with status and internal notes. Permissions `ReadEnquiry` / `UpdateEnquiry`. A hidden `details.website` field catches bots. | `submitEnquiry(input: { type, contact, items, details })` |

`npm run check:shop-rules` runs these rules against a server set up from `stores/moire` (12 checks).

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
  Emails carry the shop's name, logo and colours (`SHOP_NAME`, `EMAIL_LOGO_URL`, `EMAIL_BRAND_COLOR`,
  `EMAIL_ACCENT_COLOR`, `EMAIL_BACKGROUND_COLOR`; see `src/email/branding.ts`), and the contact line from
  the shop's settings. Templates are in `static/email/templates`; preview them in dev at `/mailbox`.
  Emails are sent by the worker, so it must be running.
- `ORDER_LINK_VALID_FOR` (default `30d`): how long the order link opens without signing in.
- Login CSRF protection (`apiOptions.csrfPrevention`) is on; the storefront must call the APIs with JSON POSTs.
- Run the server (`npm run start:server`) and the worker (`npm run start:worker`) as two processes.
