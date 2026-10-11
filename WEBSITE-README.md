# Moire Co. — Website (v1, 2026-09-27)

Custom e-commerce website for Moire Co. (Kuala Lumpur): Festive Collection, Fixed Gift Collection, Wine Gift Boxes and Corporate Orders, with cart, checkout, online payment flow and a store admin.

**Status:** complete working build, ready for client preview. Runs in *demo mode* (sample catalogue, test payments) until Supabase and a payment gateway are connected — see “Going live”.

---

## Stack

- Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind CSS 4
- Supabase (Postgres + Storage) for products, orders, enquiries, settings and images — as agreed in REQUIREMENTS.md
- Self-hosted fonts: Bodoni Moda (display) + Jost (UI)
- Hosting: any Node host; Vercel recommended (zero config)

## Run locally

```bash
npm install
npm run dev        # http://localhost:3000
npm run build && npm start
```

Admin: `/admin` — preview password `moire-preview` (set `ADMIN_PASSWORD` to change).

Without Supabase variables the site runs in **demo mode**: the sample catalogue loads from `src/data/seed.ts` and changes are written to `.data/store.json` (locally) or `/tmp` (serverless — temporary, may reset).

## With the commerce backend (from 2026-10)

The shop now runs on the commerce backend, which has its own repository: `zoushunyu144000-ui/zoushunyu144000-ui-commerce-backend`
(Vendure: products, stock, orders, payments, delivery, members, discounts, staff roles; see its
README). Set `VENDURE_SHOP_API_URL`
and the storefront switches over; without it, everything below about Supabase and demo mode
still applies.

```bash
# terminal 1: the backend (Postgres needed, see its README)
git clone https://github.com/zoushunyu144000-ui/zoushunyu144000-ui-commerce-backend.git commerce-backend
cd commerce-backend && npm ci && npm run dev   # http://localhost:3000, dashboard at /dashboard
# terminal 2: the storefront
VENDURE_SHOP_API_URL=http://localhost:3000/shop-api npx next dev -p 3001
```

What changes with the backend:

- Catalogue, festivals, prices, stock and site texts come from the backend; staff edit them in its
  dashboard, and `/admin` sends them there.
- Checkout builds the order in the backend (names are their own RM 8-per-name line, gift messages,
  21+ check), which prices it, checks stock and runs the rules. The customer then pays on the
  gateway's page (CHIP / Billplz, configured in the dashboard) or, until one is set up, on the test page.
- Delivery options, prices and dates come from the backend for the customer's postcode.
- Customers can have accounts (`/account`): orders, points, details, password reset.
- Corporate enquiries are stored in the backend for staff to follow up.
- Order emails are sent by the backend (its `static/email/templates`).

Code: `src/lib/vendure/` (Shop API client, catalogue mapping, checkout, orders, accounts, delivery,
payments, enquiries) and `src/lib/store/vendure.ts`. Each backend feature is switched on only when the
connected backend offers it (`src/lib/vendure/capabilities.ts`).

## Pages

| Route | Purpose |
|---|---|
| `/` | Homepage — Hero → Festive (current season, horizontal row) → Fixed Gift Collection → Wine Gift Boxes → Corporate Orders |
| `/festive` | Festive Collection level 1: one entry per festival (from Admin → Festivals) |
| `/festive/[slug]` | Level 2: only that festival's gift boxes, sort. Old `/festive?occasion=…` links redirect here |
| `/fixed-gifts`, `/wine-gift-boxes` | Category listings with sort (`/wine-spirits` redirects) |
| `/products/[slug]` | Product page: Name → Price → options / personalised name (number of names + names in capitals) → Add to bag or disabled Sold Out → one Description (contents, specs, allergens, delivery) |
| `/cart` + bag drawer | Server-validated prices, edit quantity/message, unavailable-item handling |
| `/checkout` | Guest checkout: contact, recipient, Malaysian address, delivery date, payment method (FPX / card / e-wallet), 21+ confirmation for alcohol, terms |
| `/pay/[id]` | **Test-mode gateway** (simulates success / failure / cancel) — replaced by the real gateway |
| `/order/[id]` | Confirmation / payment failed (retry) / awaiting payment |
| `/corporate` | Corporate overview: two main entries, Semi-customised and Fully customised |
| `/corporate/semi-curated` | Semi-customised: pick existing gifts + quantities + light customisation → saved request with reference → optional WhatsApp follow-up |
| `/corporate/bespoke` | Fully customised “MADE FOR YOUR BRAND”: process + what to prepare → Enquire via WhatsApp (no web form) |
| `/search` | Search (also live search overlay in header) |
| `/delivery`, `/terms`, `/privacy` | Policy pages — Delivery & returns and Terms of sale use the client's wording (Oct 2026); **privacy is still a draft template** |
| `/admin` | Orders, products (name, description, price, **stock**, festival, images, options, personalisation, status), **festivals** (rename / hide / reorder / add), corporate enquiries, settings |

## Key design / business decisions

- **Inventory (2026-10):** each product can track `stock`. Paid website orders deduct it automatically; sales on WhatsApp / Instagram / in person are adjusted in Admin → Products (list or editor). Stock 0 → shown as **Sold Out**, never hidden; the product page stays open with a disabled Sold Out button.
- **Festivals are data (2026-10):** `festivals` table (id, name, slug, cover, description, active, sort); products link with `festivalId`.
- **Personalised name (2026-10):** every product offers it — capital letters only, **RM 8 per name**, no choice of material. The customer picks the number of names (charged once each, not per box) and lists bulk names in order (“1. JASON 2. EMILY”). A product can override label / help text / length / fee in Admin → Products (`personalisation.enabled`).
- **Logo:** asset paths live in `src/lib/brand.ts`; replace files there to swap the logo everywhere.
- **Wine wording:** the site sells gift boxes — “Wine Gift Boxes”, never “Wine” on its own (internal category id stays `wine-spirits`).

- Business logic follows REQUIREMENTS.md / PROJECT-BRIEF.md. Stitch content not backed by requirements was not carried over (cellar program, climate-controlled fleet, calligraphy cards, wax seals, PDF catalogue, client references, accounts, etc.).
- Prices are always recalculated on the server from the catalogue; the browser only sends product IDs and quantities.
- Engraving text is validated (length, allowed characters) and stored on each order line; gift messages are stored per line.
- The bag is emptied only after payment succeeds; a failed payment keeps the bag and offers retry.
- Homepage Festive section shows the occasion selected in Admin → Settings (default: Chinese New Year 2027, since Mid-Autumn 2026 has passed).
- Mid-Autumn and Dragon Boat products are shown as unavailable (“Season ended” / “Currently unavailable”) to demonstrate product states.
- Alcohol: 21+ confirmation at checkout (Malaysian legal drinking age).
- Light palette only (client: no black website). Line & Light brand device: champagne line + four-point star from the logo, used sparingly.

## Going live — checklist

With the commerce backend, follow its README (backend, gateway and courier accounts) and set
`VENDURE_SHOP_API_URL`, `NEXT_PUBLIC_SITE_URL` (and `VENDURE_DASHBOARD_URL` if the dashboard has its
own address) here. The list below is for the original Supabase setup.

1. **Supabase** (client’s own account, free tier): create project → run `supabase/schema.sql` in the SQL editor (a database created from the v1 schema runs `supabase/migrations/20261001_festivals_inventory.sql` instead) → set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` → `npm run seed:supabase` to load the starter catalogue (then edit in /admin).
2. **Payment gateway:** client chooses provider (e.g. Billplz, Stripe, iPay88, Curlec). Implement a provider in `src/lib/payments/index.ts` + a signed webhook route that calls `markOrderPaid` / `markOrderFailed` (`src/lib/orders.ts`). Set `PAYMENT_PROVIDER`.
3. Set `APP_SECRET` (long random string), `ADMIN_PASSWORD`, `NEXT_PUBLIC_SITE_URL`.
4. Replace sample products, prices, contents and photos in /admin.
5. Settings: WhatsApp number (now defaults to the client’s 60 11-2869 1092; if the Supabase settings row was already saved with the old placeholder, change it here), delivery fee, lead days, contact email; turn off the preview notice.
6. Confirm policy page wording (`src/app/(shop)/delivery|terms|privacy`).
7. Optional: order confirmation emails need an email service (e.g. Resend) — not included; third-party cost.

## Code map

```
src/app/(shop)/…        storefront pages
src/app/admin/…         admin (login + panel)
src/app/api/…           checkout, cart quote, orders, test payments, enquiries, search, uploads
src/app/pay/[id]        test payment page
src/components/…        UI (cart, checkout, product, corporate, admin)
src/lib/store/          data layer: vendure.ts (commerce backend), supabase.ts, demo.ts (preview)
src/lib/vendure/        commerce backend: Shop API client, checkout, orders, accounts, delivery, payments
src/app/(shop)/account  member accounts (commerce backend only)
scripts/export-vendure-catalogue.ts  the sample catalogue as a store folder for the commerce backend
src/lib/pricing.ts      server-side pricing & validation
src/lib/payments/       payment provider interface (test provider included)
src/data/seed.ts        SAMPLE catalogue + default settings
supabase/schema.sql     database schema
IMAGE-CREDITS.md        placeholder photo credits
```

## Tested (2026-09-27)

Production build, type-check and lint pass. Automated browser runs at 1440 px and 390 px: product options → engraving → gift message → bag → checkout validation → test payment failure → retry → success → confirmation → bag cleared; semi-curated request; bespoke enquiry → WhatsApp; admin login, order status update, product edit reflected on storefront; no horizontal overflow on mobile.

**Not tested:** the Supabase adapter against a live Supabase project (written, not yet run); a real payment gateway (not chosen yet); placeholder photography loading in the local test environment (image CDN blocked there) — check on the deployed preview.
