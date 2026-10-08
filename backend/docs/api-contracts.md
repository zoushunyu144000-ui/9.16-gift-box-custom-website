# Backend API contracts (v1, 2026-10-09)

The storefront is built against these. Plugins implement them exactly; anything else a plugin adds is
internal. Change a contract only by editing this file first.

Conventions
- Money is integer **sen** (MYR minor units), like everything in Vendure. `priceWithTax` fields include tax.
- Shop API errors use Vendure's `ErrorResult` pattern (`errorCode` + `message`) inside union results,
  never thrown GraphQL errors, for anything a customer can cause.
- Dates without time are `YYYY-MM-DD` strings in the shop's time zone (Asia/Kuala_Lumpur).
- Secrets (API keys) are PaymentMethod / ShippingMethod handler arguments (`ui: { component: 'password-form-input' }`)
  or environment variables, never Shop API fields.
- Every webhook verifies its signature (or a secret in the URL where the provider has no signature),
  re-fetches the object from the provider before acting, and is idempotent.

Already shipped (phase 1a)
- `OrderLine.customFields.names`, `.namesFor`, `.giftMessage`; `Order.customFields.ageConfirmed`.
- Names item SKU `personalised-name` (price = fee per name). Product custom fields `personalisationEnabled`,
  `personalisationLabel`, `personalisationHelper`, `personalisationMaxLength`.

## 1. Hosted payments: plugin `payments-my`

PaymentMethodHandlers (configured per shop in the dashboard): `chip`, `billplz`.

```graphql
input CreateHostedPaymentInput {
  paymentMethodCode: String!   # a PaymentMethod whose handler is chip or billplz
  returnUrl: String!           # customer comes back here after paying; must be on an allowed storefront origin
  cancelUrl: String            # defaults to returnUrl
  preferredMethod: String      # hint, gateway may ignore: fpx | fpx_b2b | card | ewallet | duitnow_qr
}
type HostedPaymentRedirect { url: String!  reference: String! }   # reference = gateway purchase / bill id
type HostedPaymentError implements ErrorResult { errorCode: ErrorCode!  message: String! }
union CreateHostedPaymentResult = HostedPaymentRedirect | HostedPaymentError

type HostedPaymentStatus { orderCode: String!  orderState: String!  paid: Boolean! }

extend type Mutation {
  # Active order must be in ArrangingPayment. Creates a purchase/bill for order.totalWithTax.
  createHostedPayment(input: CreateHostedPaymentInput!): CreateHostedPaymentResult!
}
extend type Query {
  # After the customer returns: asks the gateway and records the payment if the webhook hasn't yet.
  # Same access rule as Vendure's orderByCode (the session's own order, or the customer's).
  hostedPaymentStatus(orderCode: String!): HostedPaymentStatus!
}
```

Webhooks (REST, on the Vendure server): `POST /payments/chip/callback` and `POST /payments/billplz/callback`
(query `?method=<paymentMethodCode>`). A paid purchase becomes `addPaymentToOrder` with
`metadata: { reference }`; the handler's `createPayment` re-checks the gateway and returns `Settled`.
Return URLs get `?order=<orderCode>` appended. Env: `VENDURE_PUBLIC_URL` (base for webhook URLs),
allowed return origins = `STOREFRONT_URL` + `CORS_ORIGINS`.

## 2. Delivery: plugin `delivery-my` (zones, dates, prices)

Zones from the postcode (data.gov.my table): `klang-valley` (Kuala Lumpur, Selangor; Putrajaya by option),
`peninsular` (other Peninsular states), `sabah-labuan`, `sarawak`.

```graphql
type DeliveryPromise {
  zone: String!                 # klang-valley | peninsular | sabah-labuan | sarawak | unknown
  zoneLabel: String!            # e.g. "KL & Selangor"
  sameDayAvailable: Boolean!    # klang-valley and before the cut-off on a dispatch day
  earliestDispatchDate: String! # YYYY-MM-DD: today before 15:00 on Mon–Sat, else next dispatch day; skips Sundays and closed dates
  cutoffTime: String!           # "15:00"
  closedDates: [String!]!       # upcoming non-dispatch dates (holidays) for date pickers, next 90 days
  message: String!              # customer wording, e.g. "Order before 3pm for same-day delivery"
}
input DeliveryQuoteInput { postalCode: String!  province: String  lines: [DeliveryQuoteLineInput!]! }
input DeliveryQuoteLineInput { productVariantId: ID!  quantity: Int! }
type DeliveryQuoteOption { id: ID!  code: String!  name: String!  description: String!  priceWithTax: Money! }

extend type Query {
  deliveryPromise(postalCode: String!): DeliveryPromise!
  # Prices for a basket before an order exists, using the same checkers/calculators as checkout.
  deliveryQuote(input: DeliveryQuoteInput!): [DeliveryQuoteOption!]!
}
```

- Custom fields: `Order.preferredDeliveryDate` (string, nullable), `Order.deliveryNotes` (text, nullable);
  `ProductVariant.weightGrams` (int, default 1000), `.lengthCm`, `.widthCm`, `.heightCm` (int, nullable).
- Checkout check (→ ArrangingPayment): `preferredDeliveryDate`, when set, is a dispatch day on or after
  `earliestDispatchDate` for the shipping address.
- Shipping: eligibility checker `my-postcode-zone` (arg: zones); calculators `my-distance-zones`
  (same-day: road distance from the shop → price table; fallback flat price) and `my-courier-rates`
  (outstation: live rates from a registered `LiveRateProvider`, else a zone × weight table; markup, rounding).
- `LiveRateProvider` (exported from `delivery-my`, registered via `MalaysianDeliveryPlugin.init({ liveRateProviders })`):
  `getRates(ctx, { fromPostcode, toPostcode, toState, weightKg, lengthCm?, widthCm?, heightCm? }) => Promise<Array<{ courier: string; service: string; priceSen: number; serviceId: string }>>`.

## 3. Couriers: plugin `couriers-my` (Lalamove, EasyParcel, tracking)

- FulfillmentHandlers: `lalamove` (book same-day, multi-stop later), `easyparcel` (book courier, AWB label),
  `manual-courier` (courier name + tracking number + tracking URL, e.g. GDex booked by hand).
- `Fulfillment.customFields`: `provider`, `providerOrderId`, `trackingUrl`, `labelUrl`, `shipmentStatus`
  (normalised: booked | picked_up | in_transit | out_for_delivery | delivered | failed | cancelled), `lastEventAt`.
- Shop API: customers read tracking through `order.fulfillments { state trackingCode customFields { trackingUrl shipmentStatus } }`.
- Webhooks: `POST /delivery/lalamove/webhook`, `POST /delivery/easyparcel/webhook/:secret`; plus a scheduled
  reconcile every 30 minutes for shipments not in a final state. Delivered → fulfillment `Delivered`.
- `easyParcelRateProvider` implements `delivery-my`'s `LiveRateProvider`.

## 4. Members: plugin `loyalty`; staff: plugin `staff-permissions`

```graphql
type LoyaltySettings { pointsPerRinggit: Int!  pointValueSen: Int!  minRedeemPoints: Int!  maxRedeemPercent: Int! }
type LoyaltyPointsEntry { id: ID!  createdAt: DateTime!  points: Int!  reason: String!  note: String  orderCode: String }
type LoyaltyPointsEntryList { items: [LoyaltyPointsEntry!]!  totalItems: Int! }
union ApplyLoyaltyPointsResult = Order | LoyaltyPointsError
type LoyaltyPointsError implements ErrorResult { errorCode: ErrorCode!  message: String! }

extend type Query {
  loyaltySettings: LoyaltySettings!
  loyaltyHistory(options: LoyaltyHistoryOptions): LoyaltyPointsEntryList!   # active customer only
}
extend type Mutation {
  applyLoyaltyPoints(points: Int!): ApplyLoyaltyPointsResult!   # 0 removes; discount appears on the active order
}
```

- `Customer.customFields.loyaltyPoints` (int, read-only to customers): current balance.
- Earn on `PaymentSettled` (registered customers only): floor(products total after discounts, excluding
  delivery, in ringgit) × pointsPerRinggit. Cancelled orders reverse. Redeemed points are deducted when the
  order is placed.
- Staff: permission `ShipOrder`; Admin API `shipOrder(input)` and `markFulfillmentDelivered(fulfillmentId)`
  require it, so a packer role has `ReadOrder` + `ShipOrder` but not `UpdateOrder` (no refunds).

## 5. Storefront content and enquiries: plugins `storefront-content`, `enquiries`

- `Channel.customFields` (public, Shop API `activeChannel { customFields { … } }`): `heroEyebrow`, `heroTitle`,
  `heroText`, `featuredCollectionSlug` (current festival; empty = none), `featuredTitle`, `featuredIntro`,
  `whatsappNumber` (digits with country code), `contactEmail`, `businessHours`, `showPreviewNotice` (boolean).

```graphql
input EnquiryContactInput { name: String!  company: String  email: String!  phone: String! }
input EnquiryItemInput { productVariantId: ID!  quantity: Int! }
input SubmitEnquiryInput { type: String!  contact: EnquiryContactInput!  items: [EnquiryItemInput!]  details: JSON }
type EnquiryReceipt { code: String! }
type EnquiryError implements ErrorResult { errorCode: ErrorCode!  message: String! }
union SubmitEnquiryResult = EnquiryReceipt | EnquiryError
extend type Mutation { submitEnquiry(input: SubmitEnquiryInput!): SubmitEnquiryResult! }
```

Staff see enquiries in the dashboard (list, detail, status, internal notes); permissions `ReadEnquiry` / `UpdateEnquiry`.
