# Commerce backend plan: reusable base on Vendure

Updated: 2026-10-08. Supersedes the custom-admin route in `commerce-system-plan.md`.

## Goal

One backend we build once and reuse for every client shop: Moire Co. first, then future clients.
Each client keeps a storefront designed for them (Next.js); the backend handles:

1. Products: editing, variants, photos, collections, stock (also adjusted by hand for WhatsApp / in-store sales), orders (status, shipping, refunds, notes).
2. Payments: pluggable gateways, Malaysian first (FPX / DuitNow online banking, DuitNow QR, cards, TNG / GrabPay / Boost / ShopeePay, BNPL). Each client holds their own merchant account.
3. Delivery: local providers (Lalamove in KL & Selangor, couriers outstation), labels, tracking for customers, delivery fee worked out from the address.
4. Members: customer accounts, groups / tiers, member prices and promotions, loyalty points.
5. Staff: separate accounts with role-based permissions (owner, customer service, packer…).

## Decision: Vendure 3.7

| | Vendure 3.7.4 | Medusa 2.21.2 |
|---|---|---|
| Staff roles & permissions | Free, built into core; roles can be limited to a channel | Enterprise-licensed since v2.19.0 (13 Aug 2026): `@medusajs/rbac` changed from MIT (2.18.0) to "SEE LICENSE IN LICENSE"; ENTERPRISE-LICENSE.md: without a commercial agreement "no rights are granted" |
| Licence | GPLv3 (or commercial). Plugin exception: plugins distributed separately may use any licence; changes to core stay GPL | MIT except the RBAC / SSO paths |
| Runs on | Node + Postgres; Redis optional; jobs can run from Postgres | Node + Postgres + Redis, ≥ 2 GB RAM, server + worker |
| Storefront starter | Official Next.js 16 / React 19.2 starter | `dtc-starter` on Next 15.5 |
| Gaps we build | Malaysian payments & logistics, loyalty points, returns flow, ship-only permission | Malaysian payments & logistics, staff permissions (or pay Enterprise) |

Checked on npm and the licence files on 2026-10-08. Also considered: Saleor (BSD, strong permissions,
but Python and payments / shipping as separately hosted apps), Bagisto / Shopware / Spree (PHP or
Ruby; Shopware is MySQL-only; Spree's multi-store module is AGPL), EverShop (no staff roles found).
WooCommerce is the only platform with gateway-maintained Malaysian plugins (CHIP, Billplz,
toyyibPay, HitPay, senangPay, EasyParcel, Delyva) and stays the fallback for a client who must
launch with almost no development, at the cost of leaving this stack.

**Licence practice:** never modify Vendure core; keep our code in plugins (`backend/src/plugins`, later
separate packages), which the plugin exception lets us license as we like.

## Shape and reuse

```
client storefront (Next.js, own design) ──GraphQL──▶ Vendure server + worker ──▶ Postgres, S3-compatible storage
                                                        └─ our plugins: payments-my, delivery-my, loyalty, staff-permissions, client extras
```

- One deployment and one database per client (clients own their data and merchant accounts). Channels can host several small shops on one server later if hosting cost matters.
- A shop is created from a folder in `backend/stores/` (see `backend/README.md`).
- After the first version runs end to end, move the backend into its own template repository and publish the plugins as private packages.

## Payments

No maintained Vendure (or Medusa / Saleor) plugin exists for any Malaysian gateway, so we write our own:
a framework-agnostic core (`createCheckout` → hosted payment URL, `verifyWebhook(rawBody, headers)`,
`getStatus`, optional `refund`, capabilities) wrapped as a Vendure `PaymentMethodHandler` plus a webhook
route. Amounts in sen; keep the raw request body for signature checks; confirm payment server-to-server,
never from the browser redirect.

| Order | Gateway | Why |
|---|---|---|
| 1 | **CHIP** | Flat FPX RM1 (corporate FPX B2B1 RM2), DuitNow QR 1%, cards 2% local, wallets 1.4%, BNPL; no setup or annual fee; OpenAPI spec, RSA-signed webhooks, refund API, sandbox. Needs SSM + business bank account. |
| 2 | **Billplz** | Incumbent many clients already use; FPX RM1.25; HMAC-signed callbacks; sandbox. No refund API (refunds done by hand). |
| later | HitPay (cards / wallets, sole props), Curlec (subscriptions), toyyibPay (clients without SSM), Stripe (overseas cards only; FPX through Stripe costs 3% + RM1) | |

On a RM2,388 order FPX costs RM1 at CHIP against RM35.82 (Curlec) to RM72.64 (Stripe). FPX is migrating
to DuitNow Online Banking/Wallets; model it as "online banking" and let the gateway route it.

## Delivery

No Vendure / Medusa / Saleor plugin exists for EasyParcel, Lalamove or Delyva; we write a delivery plugin
with a Vendure `ShippingCalculator` (price at checkout) and `FulfillmentHandler` (book, label, tracking).

- **KL & Selangor, same day: Lalamove API v3 directly**: quotes by coordinates, booking, `scheduleAt`, multi-stop orders (corporate deliveries to many addresses), live share link, proof of delivery, signed webhooks. Store order IDs as strings (19 digits).
- **Outstation: EasyParcel Open API (2026-09)**: rates across Pos Laju, J&T, DHL eCommerce, City-Link and others, booking with AWB labels (A6 for thermal printers), tracking webhooks, one prepaid wallet; OAuth so each client connects their own account. **GDex is not available through EasyParcel or Delyva**: a direct GDex adapter, or book by hand and only track it.
- **Fee from the address**: postcode → state from the official data.gov.my postcode table (KL + Selangor = prefixes 40–48, 50–60, 63, 64, 68; Putrajaya 62; East Malaysia ≥ 87000; use exact lookup, not ranges). Same-day fee from a shop-controlled distance-zone table, with road distance from the Google Routes API (10,000 free / month); outstation from EasyParcel rates by chargeable weight plus a markup. Fallbacks so checkout never blocks: cached quote → precomputed postcode distances → static zone table.
- **Dispatch rules**: confirmed before 15:00 Monday–Saturday ships today; Sundays and public holidays roll to the next working day. Shown at checkout and passed to Lalamove as `scheduleAt`.
- **Tracking**: one shipment record per parcel (provider, AWB, tracking URL, status, event log), updated by webhooks plus a 30–60 minute reconciliation poll; customers get email (later WhatsApp) and a tracking timeline on their order page.

## Members and staff

- Built in: customer accounts, customer groups, promotions limited to a group (member prices / tiers).
- To build: loyalty points (ledger, points on paid orders, redemption as a promotion).
- Staff: roles `owner`, `customer-service`, `packer` are created per shop. Vendure ties shipping to `UpdateOrder` (which also allows refunds), so a ship-only permission is added by our staff-permissions plugin.

## Phases

| Phase | Scope | Status |
|---|---|---|
| 0 | Vendure running on Postgres, dashboard, staff roles, Moire catalogue imported | Done 2026-10-08 |
| 1 | Moire data: personalised names (RM 8 per name), gift message, alcohol 21+, festival content, corporate enquiries | Next |
| 2 | Storefront reads from Vendure (catalogue, cart, checkout, customer accounts); retire `/admin` and the Supabase tables | |
| 3 | CHIP payment plugin with webhook verification; then Billplz | |
| 4 | Delivery plugin: fees, dispatch rules, Lalamove + EasyParcel booking, labels, tracking, notifications | |
| 5 | Loyalty points, member tiers | |
| 6 | Template repository, deployment scripts, new-client checklist | |

Moire needs phases 0–4 before Chinese New Year 2027 sales (orders from early January). If that slips,
Moire can launch on the current storefront with a real gateway and move over afterwards.

## Running costs per client (estimates)

- Backend server + worker: small VPS or Railway / Render, about US$5–15 / month (one VPS can host several small shops).
- Postgres: Supabase Free pauses inactive projects; production needs Pro (US$25 / month) or Postgres on the VPS.
- Storefront: Vercel Hobby does not allow commercial use (including being paid to build a site), so Pro (US$20 / month) or self-hosting.
- Usage-based: gateway fees, Lalamove per order, EasyParcel per parcel (prepaid wallet), Google Routes beyond the free tier.

## Open decisions

- Separate template repository for the backend (recommended once phase 2 works).
- Hosting provider (phase 6).
- Moire: confirm GDex vs couriers available through EasyParcel; delivery-fee zones and prices; Putrajaya counted as Selangor or not.

## Key sources

- Medusa licence change: https://github.com/medusajs/medusa/releases/tag/v2.19.0 · https://raw.githubusercontent.com/medusajs/medusa/develop/ENTERPRISE-LICENSE.md
- Vendure licence and plugin exception: https://raw.githubusercontent.com/vendurehq/vendure/master/LICENSE.md · https://raw.githubusercontent.com/vendurehq/vendure/master/license/plugin-exception.txt
- Vendure roles, shipping, payments: https://docs.vendure.io/current/core/core-concepts/roles · https://docs.vendure.io/current/core/core-concepts/shipping · https://docs.vendure.io/current/core/core-concepts/payment
- CHIP: https://www.chip-in.asia/pricing · https://docs.chip-in.asia/openapi/chip-collect.yaml
- Billplz: https://main.billplz.com/pricing · https://support.billplz.com/api
- Lalamove API v3: https://developers.lalamove.com/
- EasyParcel Open API: https://easyparcel.github.io/OpenAPI · https://helpcentre-my.easyparcel.com/support/solutions/articles/9000188827-our-courier-partners
- Malaysian postcodes: https://data.gov.my/data-catalogue/poskod
- Google Routes API pricing: https://developers.google.com/maps/billing-and-pricing/pricing
