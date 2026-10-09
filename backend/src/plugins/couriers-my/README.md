# couriers-my: Lalamove, EasyParcel and hand-booked couriers

Books deliveries for Malaysian shops and keeps customers informed (API contract §3 in
[`docs/api-contracts.md`](../../../docs/api-contracts.md)):

| | |
|---|---|
| **Lalamove** (same day, KL & Selangor) | Quotes and books a driver from the shop to the shipping address (Lalamove API v3). Tracking = Lalamove's live share link. |
| **EasyParcel** (outstation couriers) | Quotes Pos Laju, J&T, DHL eCommerce, City-Link, Skynet… books the cheapest or a chosen service and returns the AWB label (A6 for thermal printers). Each shop connects its own EasyParcel account (OAuth). |
| **Manual courier** | Staff enter the courier, tracking number and link for parcels booked by hand, e.g. **GDex** (not available through EasyParcel). |
| **Tracking** | Webhooks from both providers plus a check every 30 minutes; the fulfillment moves to Shipped when the courier has the parcel and to Delivered on delivery. Customers get a "shipped" email with the tracking link and a "delivered" email. |
| **Checkout rates** | `easyParcelRateProvider` gives delivery-my live EasyParcel prices. |

## Setup

### 1. Register the plugin

Already in `src/vendure-config.ts` ("Shop features"). The `origin` there is a **placeholder** (KLCC area):
replace it with the client's real pickup address, contact and coordinates.

```ts
MalaysianCouriersPlugin.init({
    origin: {
        contactName: 'Moire Co.', company: 'Moire Co.', phone: '+60312345678',
        addressLine1: '…', city: 'Kuala Lumpur', postcode: '50450', state: 'MY-14', // or 'Kuala Lumpur'
        lat: 3.1478, lng: 101.713,                                                  // the pickup point for Lalamove
    },
    publicUrl: process.env.VENDURE_PUBLIC_URL,
    lalamove: { apiKey: process.env.LALAMOVE_API_KEY, apiSecret: process.env.LALAMOVE_API_SECRET, sandbox: process.env.LALAMOVE_SANDBOX !== 'false' },
    easyParcel: { clientId: process.env.EASYPARCEL_CLIENT_ID, clientSecret: process.env.EASYPARCEL_CLIENT_SECRET, sandbox: process.env.EASYPARCEL_SANDBOX !== 'false' },
    googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY,
    // Optional: defaultParcel (box when products have no weight/size), lalamove.defaultServiceType ('MOTORCYCLE'),
    // lalamove.scheduledPickupTime ('10:00'), easyParcel.defaultLabelSize ('A6'), easyParcel.collection
    // ('pickup' | 'dropoff' | 'any'), easyParcel.notifications, reconcileSchedule, customerEmails.
}),
```

Run the migration (`npm run migrate`, or just start the server).

### 2. Environment variables

| Variable | |
|---|---|
| `VENDURE_PUBLIC_URL` | Public base URL of the server, e.g. `https://api.shop.my`. Webhook and OAuth callback URLs are built from it (a path prefix behind a proxy is fine). |
| `LALAMOVE_API_KEY`, `LALAMOVE_API_SECRET` | Partner Portal → Developers. Sandbox keys start `pk_test_`/`sk_test_`, production `pk_prod_`/`sk_prod_`. |
| `LALAMOVE_SANDBOX` | `false` for production (rest.lalamove.com); anything else uses rest.sandbox.lalamove.com. A warning is logged when it doesn't match the key. |
| `EASYPARCEL_CLIENT_ID`, `EASYPARCEL_CLIENT_SECRET` | Our app on the EasyParcel Developer Hub. The secret also derives the key that seals stored tokens and the webhook URL secret: **changing it means reconnecting the account and updating the webhook URL**. |
| `EASYPARCEL_SANDBOX` | Informational (shown by `/delivery/easyparcel/status`). EasyParcel uses the same endpoints for both; the account connected (demo or live) decides. |
| `GOOGLE_MAPS_API_KEY` | Geocoding API (Lalamove needs the recipient's coordinates). Restrict the key to the Geocoding API. |
| `LALAMOVE_BASE_URL`, `EASYPARCEL_BASE_URL`, `GOOGLE_GEOCODING_URL` | Optional overrides for tests and proxies (the e2e smoke test points them at mocks). |

### 3. Lalamove

1. Sign up at the [Partner Portal](https://partnerportal.lalamove.com), choose Malaysia, and take the sandbox key and
   secret from **Developers**. Production keys appear after the production wallet is topped up.
2. Webhook (v3): enter `<VENDURE_PUBLIC_URL>/delivery/lalamove/webhook` under Developers → Webhook, or call
   `POST /delivery/lalamove/register-webhook` (it sends `PATCH /v3/webhook` with that URL). Lalamove disables the
   URL after 10 failed deliveries in 24 hours, so make sure it answers before saving.
3. Vehicle keys for the city: `GET /delivery/lalamove/service-types` (MOTORCYCLE and CAR in Kuala Lumpur).

### 4. EasyParcel

1. EasyParcel Developer Hub → Applications → Create: redirect URI `<VENDURE_PUBLIC_URL>/delivery/easyparcel/oauth/callback`.
   Set `EASYPARCEL_CLIENT_ID` / `EASYPARCEL_CLIENT_SECRET`. One app serves every client shop.
2. Connect the shop's account: signed in to the dashboard (UpdateSettings), open
   `<VENDURE_PUBLIC_URL>/delivery/easyparcel/connect` in the same browser, log in to EasyParcel (a **demo** account
   for sandbox, the live account for production) and allow access. The callback checks that the same administrator
   is still signed in with UpdateSettings on that channel. Multi-channel: add `?vendure-token=<channel token>`;
   channels without their own account use the default channel's. Rates, bookings, tracking and cancellations for an
   order all use its own channel's account.
3. `GET /delivery/easyparcel/status` shows the connection and the **webhook URL** (with its secret). Add it in the
   Developer Hub → App → Webhook with the topics *Shipment Status Update*, *Shipment AWB Update* and *Tracking
   Status Update*.
4. Top up the EasyParcel wallet: booking debits it. Sandbox shipments never change status, so only bookings,
   labels and cancellations can be tried there.

### 5. Shipping methods

Each ShippingMethod names the fulfillment handler staff get by default when fulfilling: `lalamove` for same-day
methods, `easyparcel` for outstation couriers, `manual-courier` otherwise. Staff can pick another one in the
"Fulfill order" dialog.

## Using it

**Fulfilling.** Lalamove: optional vehicle, pickup time (empty = now, or the order's later `preferredDeliveryDate`
at `scheduledPickupTime`) and driver note. EasyParcel: courier (`cheapest`, a name like `Pos Laju`, or a service id
`EP-CS…`), label size, the packed box's weight and size (empty = product weights from delivery-my's variant
fields, else `defaultParcel`), collection date. Manual courier: courier, tracking number, tracking link (https only).
A courier fulfillment covers one order.

**Cancelling** a fulfillment cancels the Lalamove order (possible while a driver is being assigned or within 5
minutes of a match) or the EasyParcel shipment (before the courier processes it). If the provider refuses, the
fulfillment stays and the dashboard shows the provider's reason.

**Dashboard.** Each order with courier fulfillments shows a *Shipments* card: provider, status, tracking number,
tracking page and label links, last update.

**Storefront** (Shop API):

```graphql
order { fulfillments { state method trackingCode customFields { trackingUrl shipmentStatus } } }
```

`provider`, `providerOrderId`, `labelUrl` and `lastEventAt` are admin-only. One more field, `labelSize` (the size
chosen when booking, for a label that arrives with a later AWB), is internal and in neither API.

### Statuses

| shipmentStatus | Lalamove | EasyParcel code | Fulfillment |
|---|---|---|---|
| `booked` | ASSIGNING_DRIVER, ON_GOING (driver on the way to the shop) | 7 Schedule In Arrangement, 2 To Be Collected, 11 Drop Off | Pending |
| `picked_up` | | 3 Collected | → Shipped |
| `in_transit` | | 4 In Transit, 8 On Hold | → Shipped |
| `out_for_delivery` | PICKED_UP (a Lalamove driver goes straight to the recipient) | 4 with "out for delivery" | → Shipped |
| `delivered` | COMPLETED | 5 Delivered | → Delivered |
| `failed` | REJECTED, EXPIRED, COMPLETED with failed proof of delivery | 6 Returned | recorded only |
| `cancelled` | CANCELED | 0 Cancel (or "Cancelled" text) | recorded only |

Failed and cancelled shipments are not moved automatically: staff cancel the fulfillment and book again.
Manual-courier fulfillments follow staff actions (Shipped → `in_transit`, Delivered → `delivered`).

`delivered`, `failed` and `cancelled` are final: a later reading can't change them (except a Lalamove
ORDER_REPLACED, which moves a cancelled booking to its clone). EasyParcel statuses only move forward; a Lalamove
order may step back to `booked` when a driver rejects it after a match, as Lalamove's docs describe.

### Customer emails

`static/email/templates/shipment-update/body.hbs`, sent for every fulfillment (any handler) on Shipped ("Your order
X is on its way", with the tracking link) and Delivered ("… has been delivered"), listing that parcel's items. The
plugin adds the handlers to the EmailPlugin (`customerEmails: false` to turn off); they are also exported as
`shipmentEmailHandlers`.

## How tracking stays correct

- **Lalamove webhooks** are verified as the webhook spec (v1.5) describes: the `apiKey` must match and the
  `signature` must equal HMAC-SHA256(secret, `timestamp\r\nPOST\r\n<path>\r\n\r\n<data JSON>`), checked on the exact
  bytes received (with the spec's re-serialised form as a fallback). Only the signed `data` is used. Empty bodies
  (Lalamove's URL check) get 200; bad signatures 401, and so does every event while the Lalamove keys aren't set. A
  correctly signed body more than 48 hours old (Lalamove retries for 24) or over an hour ahead of the server clock
  gets 200 but is not processed, with a warning: a late retry never counts towards Lalamove disabling the URL,
  and the reconcile catches up.
- **EasyParcel webhooks** carry no signature: the URL has a secret (404 otherwise) and the body only says *which*
  shipment changed. Its state is always re-fetched from the API.
- Webhooks are answered at once and processed by the **worker** (job queue `couriers-my-sync`, retried), which
  re-fetches the shipment from the provider and applies what the provider reports.
- **Idempotent**: each event's key is stored in `courier_shipment_event`: for Lalamove a hash of the signed
  timestamp and data (not `eventId`, which isn't signed, so a replay under a new id is still caught), for EasyParcel
  a hash of the delivery. A delivery already processed is ignored, and applying the same state twice changes nothing.
- **Out of order**: a Lalamove event older than the last one applied (`lastEventAt`, provider time) is logged and
  skipped, final statuses stay final and EasyParcel statuses never step back (see Statuses). If an event announces a
  final status the API doesn't show yet, the job retries.
- **ORDER_REPLACED** (Lalamove cancels and clones an order): the fulfillment moves to the new order id (tracking code
  and link updated); the old order's CANCELED event is then ignored.
- **Reconcile** every 30 minutes (scheduled task `couriers-my-reconcile`, in the worker) for shipments that are not
  failed, cancelled or Delivered (up to 30 days old), batching EasyParcel tracking per connected account, 50 AWBs at
  a time. EasyParcel shipments still `booked` also get their details re-read, which is where a cancellation made on
  EasyParcel's side shows. It also refreshes EasyParcel tokens expiring within the hour, so an idle shop stays
  connected. Run it from the dashboard's scheduled tasks or `POST /delivery/shipments/reconcile`; one shipment:
  `POST /delivery/shipments/<fulfillmentId>/refresh`.

## Admin routes

All need an admin session (dashboard cookie) or Admin API bearer token.

| Route | Permission | |
|---|---|---|
| `GET /delivery/easyparcel/connect` | UpdateSettings | Redirects to EasyParcel's authorise page (`?format=json` → `{ url }`). |
| `GET /delivery/easyparcel/oauth/callback` | UpdateSettings on the channel in the state | EasyParcel returns here; stores the tokens. Checked in the handler (the redirect can't carry a channel token): the admin who started, still signed in. |
| `GET /delivery/easyparcel/status` | UpdateSettings | Connection, token expiry, redirect URI, webhook URL. Never tokens. |
| `POST /delivery/easyparcel/disconnect` | UpdateSettings | Forgets the channel's tokens. |
| `GET /delivery/easyparcel/rates?toPostcode=&toState=&weightKg=` | ReadSettings | What checkout would get from `easyParcelRateProvider`. |
| `GET /delivery/lalamove/service-types` | ReadSettings | Vehicle keys per city. |
| `POST /delivery/lalamove/register-webhook` | UpdateSettings | Points Lalamove's webhook at this server. |
| `POST /delivery/shipments/:fulfillmentId/refresh` | UpdateOrder | Re-check one shipment now. |
| `POST /delivery/shipments/reconcile` | UpdateOrder | Run the reconcile now. |

## For delivery-my: live rates

```ts
import { easyParcelRateProvider } from './plugins/couriers-my/couriers-my.plugin';
MalaysianDeliveryPlugin.init({ liveRateProviders: [easyParcelRateProvider] });
```

`getRates(ctx, { fromPostcode, toPostcode, toState, weightKg, lengthCm?, widthCm?, heightCm? })` returns
`[{ courier, service, priceSen, serviceId }]`, cheapest first, only services matching `easyParcel.collection`
(pickup by default). `toState` may be a state name or an ISO code; the postcode fills in when it's missing. It never
throws: when EasyParcel isn't connected or answers slowly or with an error it returns `[]`, so delivery-my falls back
to its table. Identical queries are cached for 10 minutes. It also accepts `init(injector)` if delivery-my
initialises providers like Vendure strategies; it doesn't have to.

## Security notes

- EasyParcel access and refresh tokens are sealed with AES-256-GCM (key derived from `EASYPARCEL_CLIENT_SECRET`) in
  `easy_parcel_connection`; no route returns them and nothing logs them. The OAuth `state` is sealed too: it
  carries the channel, the admin who started, an expiry (15 minutes) and the PKCE verifier.
- Webhook routes read the raw body (256 KB limit) before Vendure's JSON parser. Secrets are compared in constant
  time.
- Tracking links typed by staff must be http(s). Provider error messages shown to staff never include credentials.

## Tests

- `npm test` runs the unit tests (`*.spec.ts`): Lalamove signing (vectors computed independently; the docs' own
  example elides the body), request bodies, webhook verification (pretty-printed bodies, forged and smuggled data,
  proxy paths, missing keys, the time window, dedupe keys), status mapping, update planning (idempotency, stale
  events, final and forward-only statuses, transitions, replaced orders), EasyParcel payloads, service choice,
  subdivision codes, phone numbers, token refresh and sealing.
- `node src/plugins/couriers-my/e2e-smoke.mjs` (from `backend/`, with nothing on port 3013) starts the server and
  worker against local mock Lalamove, EasyParcel and Google servers and walks through connect, rates, bookings,
  webhooks, reconcile, cancellations, emails and the Shop API order.

## Not done yet

- **Only checked against mocks** built from the providers' documentation; no real sandbox credentials were used.
  Before going live: run one sandbox booking per provider, confirm the Lalamove webhook signature on a real
  delivery and the EasyParcel webhook payloads, and that `api_rate_on` defaults give the couriers wanted.
- **Multi-stop corporate deliveries** (one Lalamove order to many addresses, up to 15 drop-offs): not built.
  Design: a separate admin action groups several orders' fulfillments, geocodes all addresses, quotes one Lalamove
  order with `isRouteOptimized: true`, places it with one recipient per stop (stop ids from the quotation), and stores
  the same Lalamove order id on each fulfillment with the stop id in an extra field; webhooks then update every
  fulfillment of that order, and POD per stop (`POD_STATUS_CHANGED`) decides each one's Delivered. Price would be
  split per stop for reporting.
- EasyParcel **on-demand**, **COD**, **insurance**, **drop-off point** selection and coupons; Lalamove priority fees,
  order edits, change driver and POD photos (the share link shows them).
- Public holidays in the default EasyParcel collection date (Sundays are skipped); staff can set the date.
- Shipment event history in the dashboard (it is recorded in `courier_shipment_event`).
- WhatsApp / SMS customer notifications (EasyParcel's paid ones can be switched on with `easyParcel.notifications`).
