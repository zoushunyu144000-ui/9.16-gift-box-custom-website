# delivery-my: delivery zones, dispatch dates and delivery prices (Malaysia)

Works out where an address is (from its postcode), when an order can go out, and what delivery costs at
checkout. Booking couriers and tracking parcels is the separate `couriers-my` plugin, which plugs its live
courier rates in here through `LiveRateProvider`.

| Part | What it does |
|---|---|
| Zones | `klang-valley` (Kuala Lumpur, Selangor; Putrajaya by option), `peninsular`, `sabah-labuan`, `sarawak`, else `unknown`, from the official postcode table |
| Dispatch dates | Confirmed before the cut-off (15:00 Malaysian time) on a dispatch day (Mon–Sat) → goes out that day; otherwise the next dispatch day. Sundays and closed dates are skipped |
| Shop API | `deliveryPromise(postalCode)`, `deliveryQuote(input)` (docs/api-contracts.md §2) |
| Checkout check | A preferred delivery date must be a dispatch day on or after the earliest dispatch date |
| Shipping | Eligibility checker `my-postcode-zone`; calculators `my-distance-zones` (same-day) and `my-courier-rates` (outstation) |
| Custom fields | `Order.preferredDeliveryDate`, `Order.deliveryNotes`; `ProductVariant.weightGrams` (default 1000), `lengthCm`, `widthCm`, `heightCm`; `GlobalSettings.deliveryClosedDates` |

## Set up

```ts
// vendure-config.ts, plugins:
MalaysianDeliveryPlugin.init({
    origin: { latitude: 3.1478, longitude: 101.713, address: 'Pickup address', postcode: '50450' },
    includePutrajaya: false,
    cutoffTime: '15:00',
    // liveRateProviders: [easyParcelRateProvider],   // from couriers-my, once it lands
}),
```

Then create the two delivery methods once (the shop setup script does this):

```ts
import { setupDeliveryMethods } from './src/plugins/delivery-my';
await setupDeliveryMethods(app, ctx, {
    // sameDayFulfillmentHandler: 'lalamove', courierFulfillmentHandler: 'easyparcel',   // once couriers-my lands
});
```

It creates **Same-day delivery (KL & Selangor)** (zones `klang-valley`, calculator `my-distance-zones`) and
**Courier delivery** (zones `peninsular`, `sabah-labuan`, `sarawak`, calculator `my-courier-rates`), both with
Vendure's manual fulfilment until couriers-my is installed, and switches off the flat placeholder rate from
`store.json`. Shipping methods have no on/off switch, so "switched off" means its eligibility checker is set to
`my-postcode-zone` with no zones ticked: it matches no address. Tick zones to bring it back, or delete it.
Running it again leaves existing methods (by code) as staff edited them.
Options: `sameDayPriceBands`, `sameDayFallbackPrice` (`null` = not offered beyond the last band),
`courierRates`, `courierMarkupPercent`, `sameDayFulfillmentHandler`, `courierFulfillmentHandler`,
`disableMethodCodes` (default: every method on Vendure's flat-rate calculator).

The database changes are in `src/migrations/*-delivery-my.ts`.

### Plugin options

| Option | Default | |
|---|---|---|
| `origin` | required | Pickup point: `latitude`, `longitude` (road distances start here), `address`, `postcode` (couriers collect here) |
| `includePutrajaya` | `false` | Count Putrajaya (62xxx) as KL & Selangor, so it gets same-day delivery |
| `cutoffTime` | `'15:00'` | 24-hour, Malaysian time, whatever the server's time zone |
| `dispatchWeekdays` | `[1, 2, 3, 4, 5, 6]` | 0 = Sunday … 6 = Saturday |
| `closedDates` | `[]` | `YYYY-MM-DD` dates without dispatch, on top of the ones staff enter in Global Settings |
| `courierDeliveryTime` | `'3–5 days'` | Used in customer wording: "Delivery normally takes 3–5 days." |
| `zoneLabels` | KL & Selangor, Peninsular Malaysia, Sabah & Labuan, Sarawak, Postcode not found | Customer-facing names per zone |
| `liveRateProviders` | `[]` | Courier rate services, e.g. couriers-my's `easyParcelRateProvider` |
| `googleMapsApiKey` | env `GOOGLE_MAPS_API_KEY` | Google Maps Platform key with the **Routes API** enabled |
| `timeoutMs` | `2500` | Longest wait for Google or a courier before the fallback is used |
| `distanceCacheDays` | `30` | How long a road distance is reused |
| `liveRateCacheHours` | `24` | How long live courier rates are reused |
| `deliveryNotesMaxLength` | `500` | Longest delivery note |

### Environment

| Variable | |
|---|---|
| `GOOGLE_MAPS_API_KEY` | Without it same-day delivery is charged at its fallback price (a warning is logged at startup). In Google Cloud: enable the Routes API, create a key restricted to it (and to the server's IP). |

## How the delivery fee is worked out

**Same-day (`my-distance-zones`).** Road distance by car from the pickup point to the postcode
(`"50450 Kuala Lumpur, Wilayah Persekutuan Kuala Lumpur, Malaysia"`), from Google's Routes API
(`computeRoutes`, `TRAFFIC_UNAWARE`, distance only). The first band that reaches the distance sets the price:
`[{"upToKm":5,"price":15},{"upToKm":10,"price":20},…]` in ringgit, a boundary belonging to the nearer band.
Beyond the last band: the **fallback price**, or not offered when the fallback is empty. When the distance can't
be worked out (no key, Google slower than 2.5 s, an error, or a postcode missing from the official table) the
fallback price is charged, or the last band's price when there's no fallback, so checkout never blocks. An older
cached distance is used before the fallback.

- Each postcode's distance is kept 30 days in the `delivery_distance` table (per pickup point, so moving the shop
  gets fresh distances). Google is only asked about postcodes in the official table, so made-up postcodes can't
  run up the bill. After an error it waits 5 minutes before asking about that postcode again; after a timeout it
  leaves Google alone for a minute, so checkouts during an outage get the fallback at once instead of each waiting.
- Cost (checked Oct 2026): requests without live traffic are the *Compute Routes Essentials* SKU, 10,000 free a
  month, then US$5 per 1,000. KL and Selangor have 549 postcodes (622 with Putrajaya), so with one request per
  postcode per 30 days a shop stays well inside the free tier.

**Courier (`my-courier-rates`).** First the chargeable weight: for each item the greater of its packed weight
(`weightGrams`, 1000 g when not set) and its volumetric weight (length × width × height ÷ 5000, only when all
three sizes are set), times the quantity, added up. Then:

1. **Live rates**, when a `LiveRateProvider` is registered and "Use live courier rates" is ticked: every provider
   is asked at once for the weight rounded up to the whole kg (from the pickup postcode to the address). Rates
   from providers that answer within 2.5 s are merged; the cheapest from an allowed courier wins ("Allowed
   couriers": part of a courier or service name such as `J&T`, or a service id; empty = any). Price = courier
   price + markup %, rounded **up** to the next RM1. Rates are cached 24 hours per postcode and kg bracket, but
   only when every provider answered (so one failing provider can't hide cheaper rates for a day). A provider
   that times out is left out for a minute.
2. **Otherwise the zone × weight table**, in ringgit: `{"peninsular":{"firstKg":10,"eachExtraKg":3}, …}` —
   first kg, then each further started kg. A zone without a row isn't offered. No markup is added: the table is
   the customer price.

Both calculators return metadata the storefront can show (zone, distance, chargeable weight, courier, and
whether the price came from a band, the fallback, live rates or the table). Prices are treated like product
prices: tax-inclusive when the channel's prices include tax, at the calculator's tax rate (0% by default).

## For staff (dashboard)

| Task | Where |
|---|---|
| Change delivery prices | **Settings → Shipping Methods** → *Same-day delivery (KL & Selangor)* → calculator: *Price by road distance (RM)* and *Fallback price (RM)*. *Courier delivery* → *Rates by zone (RM)*, *Markup on live rates*, *Allowed couriers* |
| Which addresses get which method | Same page, eligibility checker *Zones* |
| Public holidays and closures | **Settings → Global Settings** → *Closed dates (no dispatch)*: one date per line, `2026-12-25 Christmas Day` (a note after the date is fine; ranges aren't read, so one line per day). Saved only when every line is a date |
| Parcel weights and sizes | **Catalog → Products** → a variant: *Packed weight (g)* (with the box; 0 for things that add nothing, such as a personalised name), *Packed length / width / height (cm)* |
| The customer's preferred date and notes | On each order, in its custom fields |

## For the storefront

```graphql
query { deliveryPromise(postalCode: "50450") { zone zoneLabel sameDayAvailable earliestDispatchDate cutoffTime closedDates message } }
query { deliveryQuote(input: { postalCode: "10200", province: "Pulau Pinang", lines: [{ productVariantId: "1", quantity: 2 }] }) { id code name description priceWithTax } }
mutation { setOrderCustomFields(input: { customFields: { preferredDeliveryDate: "2026-10-12", deliveryNotes: "Leave with the guard" } }) { ... on Order { id } } }
```

- `closedDates` is every date in the next 90 days without dispatch, **Sundays included**, so a date picker can
  grey them all out; use `earliestDispatchDate` as its first date.
- `deliveryQuote` runs the same checkers and calculators as checkout (Vendure's `OrderTestingService` on a mock
  order), so its prices equal `eligibleShippingMethods` for the same bag and address. Unknown variants are left out.
- A refused date comes back from `transitionOrderToState("ArrangingPayment")` as `OrderStateTransitionError.transitionError`,
  e.g. "We don’t deliver on Sundays. Please choose another delivery date."

## For couriers-my: `LiveRateProvider`

```ts
import type { LiveRateProvider } from '../delivery-my';

export const easyParcelRateProvider: LiveRateProvider = {
    async getRates(ctx, { fromPostcode, toPostcode, toState, weightKg, lengthCm, widthCm, heightCm }) {
        return [{ courier: 'J&T Express', service: 'Standard', priceSen: 980, serviceId: '…' }];
    },
};
```

- `toState` is the state as the data.gov.my table writes it (`MALAYSIAN_STATES`): Johor, Kedah, Kelantan, Melaka,
  Negeri Sembilan, Pahang, Perak, Perlis, Pulau Pinang, Sabah, Sarawak, Selangor, Terengganu, W.P. Kuala Lumpur,
  W.P. Labuan, W.P. Putrajaya.
- `weightKg` is the chargeable weight already rounded up to the whole kg; sizes are only sent for a single boxed item.
- Answer within 2.5 s or throw; either way checkout falls back to the table (after a timeout the provider is left
  out for a minute). Return `[]` when no courier serves the address. `priceSen` is what the courier charges the
  shop; the markup and rounding are added here.
- A provider may also have `init(injector)` / `destroy()` like any Vendure strategy; they run at startup and shutdown.

## Placeholders to replace with the client's figures

- Same-day bands RM15 (≤5 km), RM20 (≤10), RM28 (≤20), RM35 (≤30), RM45 (≤45) and fallback RM50.
- Courier table: Peninsular RM10 first kg + RM3 per extra kg; Sabah & Labuan RM18 + RM6; Sarawak RM16 + RM5. Markup 0%.
- Moire's pickup point in `vendure-config.ts` (central KL, 3.1478, 101.7130, 50450): the client must supply the real address.
- Every variant weighs 1000 g until weights and sizes are entered (or imported as `variant:weightGrams`,
  `variant:lengthCm`, `variant:widthCm`, `variant:heightCm` columns in `products.csv`).

## Postcode data

`data/postcodes.json` is the official [Postcodes in Malaysia](https://data.gov.my/data-catalogue/poskod) table
published on data.gov.my (data source: MCMC; 2,930 postcodes, data as of June 2026), licensed
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Changes: grouped by state and city, extra spaces
trimmed, one repeated row dropped. Lookup is exact: states don't follow tidy postcode ranges (Pahang has 39xxx,
49xxx and 69xxx; Kedah and Perak share 34xxx). A postcode missing from the table goes by the province the
customer gave. The table is updated about once a year:

```bash
node src/plugins/delivery-my/data/update-postcodes.mjs --as-of=2027-06   # then npm test
```

`tsc` doesn't copy JSON into `dist/`, so a compiled server reads the table from `src/plugins/delivery-my/data/`;
deploy that folder with the build (the server stops at startup with a clear message if it's missing).

## Tests

```bash
npm test                                    # unit tests (postcodes, dispatch dates, prices, Google client, live rates)
SHOP_API_URL=http://localhost:3000/shop-api node src/plugins/delivery-my/e2e-smoke.mjs   # against a running server
```
