# payments-my: CHIP and Billplz hosted payments

Customers pay on the gateway's own page (FPX online banking, DuitNow QR, cards, e-wallets) and come back to the
storefront. Each shop uses its own merchant account; the keys live in the payment method's settings in the dashboard.

| Gateway | Handler code | Methods | Refunds |
|---|---|---|---|
| [CHIP](https://www.chip-in.asia) | `chip` | FPX (B2C and B2B1), DuitNow QR, Visa / Mastercard, TNG / GrabPay / ShopeePay, Atome, … | Through CHIP's API |
| [Billplz](https://www.billplz.com) | `billplz` | FPX online banking (plus whatever the Billplz collection offers) | By hand: Billplz has no refund API |

## How it works

1. The storefront brings the order to `ArrangingPayment` and calls `createHostedPayment`. The plugin creates a CHIP
   purchase or Billplz bill for the amount owed (`order.totalWithTax`), with the order code as its reference,
   and returns the payment page URL.
2. The customer pays. The gateway calls `POST /payments/<gateway>/callback?method=<code>` on this server. The
   signature is checked on the raw request body (CHIP: RSA with CHIP's public key; Billplz: X Signature HMAC).
3. The payment is recorded with `addPaymentToOrder`; the handler's `createPayment` asks the gateway about the
   payment again and only settles it when it is paid, for this order, into this shop's account (CHIP brand,
   Billplz collection), in ringgit, for exactly the amount owed. Anything else is recorded as Declined with the
   reason, and a note is added to the order for staff.
4. The customer lands on `returnUrl?order=<code>`; the storefront calls `hostedPaymentStatus`. If no callback has
   arrived yet, the plugin asks the gateway itself and records the payment the same way.

Payments are recorded once: the order row is locked while a payment is recorded, so replayed or simultaneous
callbacks and status checks find it already done. A second payment for an already paid order (a customer who
paid twice), a payment after the order was cancelled, or a payment for the wrong amount is never recorded; the
order gets a note telling staff to refund it.

## Setting up a shop (dashboard)

1. **Merchant account.** The client registers their own account (CHIP needs SSM registration and a business bank
   account; Billplz too). Developers only receive the keys below.
2. **Keys.**
   - CHIP portal → *Developers → Brands*: the **Brand ID**; *Developers → API keys*: the **secret key**.
     A test key takes test payments, a live key real ones; the API address is the same.
   - Billplz → *Settings → Keys & Integration*: the **API secret key** and the **X Signature key** (X Signature
     must be enabled; it is by default for accounts since 2018). Billplz → *Billing*: the **collection ID**
     bills go into. Sandbox keys come from a separate account at billplz-sandbox.com.
3. **Payment methods.** Dashboard → *Settings → Payment methods* → *Create* (or edit the `chip` / `billplz`
   methods that `setupPaymentMethods` created): choose the *CHIP* or *Billplz* handler, enter the keys, and for
   Billplz tick *Sandbox account* when using sandbox keys. The method's **code** is what the storefront sends
   as `paymentMethodCode`. Leave *API address (advanced)* empty (it is for mock servers in tests).
   Optionally limit CHIP to some methods with *Only offer these methods*, e.g. `fpx, duitnow_qr, visa, mastercard`.
4. **Server address.** Set `VENDURE_PUBLIC_URL` to this server's public https address (no port, e.g.
   `https://api.moireco.com`), and make sure `STOREFRONT_URL` / `CORS_ORIGINS` list the storefront's origins.

### Callback URLs

Nothing has to be entered in the gateways' dashboards: each purchase and bill is created with its own callback URL.

| Gateway | Callback URL given to the gateway |
|---|---|
| CHIP | `<VENDURE_PUBLIC_URL>/payments/chip/callback?method=<payment method code>` (as each purchase's `success_callback`) |
| Billplz | `<VENDURE_PUBLIC_URL>/payments/billplz/callback?method=<payment method code>` (as each bill's `callback_url`) |

- CHIP only calls URLs without a port number (`https://api.example.com`, not `https://api.example.com:3000`).
  When `VENDURE_PUBLIC_URL` has a port, purchases are created without a callback and payments are only confirmed
  when the customer comes back (the server log says so).
- Don't add a webhook for this URL in the CHIP portal: portal webhooks are signed with a different key and would be
  refused. The per-purchase callback is all that is needed.
- Gateways retry failed callbacks (CHIP up to 8 more times over 36 hours; Billplz up to 5 attempts over about a
  day), so a short outage loses nothing.

## Storefront (Shop API, docs/api-contracts.md §1)

```graphql
mutation {
  createHostedPayment(input: {
    paymentMethodCode: "chip"
    returnUrl: "https://www.moireco.com/checkout/return"  # must be on STOREFRONT_URL / CORS_ORIGINS
    cancelUrl: "https://www.moireco.com/checkout"         # optional, defaults to returnUrl
    preferredMethod: "fpx"                                # optional hint: fpx | fpx_b2b | card | ewallet | duitnow_qr
  }) {
    ... on HostedPaymentRedirect { url reference }        # send the browser to url
    ... on HostedPaymentError { errorCode message }       # message is written for customers
  }
}

query { hostedPaymentStatus(orderCode: "ABC123") { orderCode orderState paid } }
```

- Call `createHostedPayment` with the order in `ArrangingPayment` (after `transitionOrderToState`), from the same
  session (cookie or bearer token) as the rest of checkout. Each call opens a new purchase or bill; the latest is
  the one to send the customer to.
- Both URLs come back with `?order=<code>` added (replacing any `order` parameter already there). CHIP sends the
  customer to `returnUrl` after paying or after a failed attempt and offers `cancelUrl` as "Return to seller";
  Billplz always uses `returnUrl`.
- On the return page call `hostedPaymentStatus(orderCode)` with the same session. `paid: false` usually means the
  confirmation is still on its way: poll every few seconds for a minute (the gateway itself is asked at most every
  10 seconds per payment), then offer to try again. Access is as for Vendure's `orderByCode`: the session's own
  order, a logged-in customer's orders, and (default strategy) a guest order for 2 hours after it is placed;
  anything else, including an unknown code, is a Forbidden error.
- `preferredMethod` pre-selects that method on CHIP's page (the customer can still switch). Billplz ignores it.
- Don't call Vendure's own `addPaymentToOrder` with these methods: it is refused (`PAYMENT_FAILED_ERROR`).

| `errorCode` | When |
|---|---|
| `NO_ACTIVE_ORDER_ERROR` | The session has no order (empty bag or expired session). |
| `ORDER_PAYMENT_STATE_ERROR` | The order isn't in `ArrangingPayment`, has nothing left to pay, or has no email address. |
| `INELIGIBLE_PAYMENT_METHOD_ERROR` | Unknown, disabled or ineligible method, or its keys aren't filled in. |
| `HOSTED_PAYMENT_ERROR` | Return or cancel URL not on an allowed storefront origin, too many attempts (10 an hour per order), or the gateway couldn't create the payment. |

## Refunds

- **CHIP:** *Refund* on the order in the dashboard refunds through CHIP's API (full or partial). If CHIP is still
  processing, or doesn't answer, the refund stays *Pending* with a note: check the purchase in the CHIP portal,
  then settle the refund in the dashboard.
- **Billplz:** Billplz has no refund API. The refund is created *Pending* with a note: send the money back from the
  Billplz dashboard or by bank transfer, then *Settle* the refund with the transfer reference.
- The plugin adds a Pending → Pending step to Vendure's refund process; without it Vendure 3.7 saves a pending
  refund but reports an error. Calling `refundOrder` through the Admin API with `amount`, also pass
  `shipping: 0, adjustment: 0` as the dashboard does (Vendure 3.7 still writes those columns).

## Testing with the sandboxes

1. Give the server a public https address that the gateways can reach, e.g. a tunnel
   (`cloudflared tunnel --url http://localhost:3000`), and set `VENDURE_PUBLIC_URL` to it. Without one, payments
   are still confirmed when you come back to the return page, but callbacks can't be tested.
2. **CHIP:** use the test secret key. Pay by card with `4444 3333 2222 1111` (no 3-D Secure) or
   `5555 5555 5555 4444` (3-D Secure), any name, CVC `123`, any future expiry; a different CVC or a past expiry
   makes the payment fail. Test purchases are marked as test (`is_test`).
3. **Billplz:** create a sandbox account at billplz-sandbox.com, a collection, and tick *Sandbox account* in the
   payment method. The sandbox bill page offers test banks for FPX.
4. Check the order in the dashboard: a *Settled* payment whose transaction ID is the purchase / bill id, and
   no notes about unrecorded payments. Then try a partial refund.

Automated tests (from `backend/`):

```bash
npm test                                         # unit tests: signatures (Billplz docs vectors, RSA), requests, statuses, URLs
npx ts-node --transpile-only src/index.ts        # in another terminal, on a database set up from stores/moire
node src/plugins/payments-my/e2e-smoke.mjs       # 33 checks against mock CHIP and Billplz servers
```

The e2e script creates payment methods `e2e-chip` and `e2e-billplz` pointing at its mock servers and switches them
off when it finishes.

## Go-live checklist

- [ ] The client has a live CHIP and/or Billplz merchant account in the business's name (KYC/KYB is theirs).
- [ ] Live keys are entered in the dashboard payment methods; Billplz *Sandbox account* unticked; methods enabled;
      the test payment method (`Test payment`) disabled.
- [ ] `VENDURE_PUBLIC_URL` is the server's public https address without a port; the server log shows no
      "VENDURE_PUBLIC_URL isn't set" or "Not giving CHIP a callback URL" warnings.
- [ ] `STOREFRONT_URL` and `CORS_ORIGINS` are the live storefront's origins.
- [ ] One real low-value payment per gateway: it arrives *Settled* on the order, and the refund works (CHIP) or the
      manual refund note appears (Billplz).
- [ ] Staff know to look for order notes starting "CHIP payment …" / "Billplz payment …": those are payments that
      need a refund or a manual decision.

## Wiring

```ts
// vendure-config.ts, "Shop features"
MalaysianPaymentsPlugin.init({}),
```

Options (all optional): `publicUrl` (default `VENDURE_PUBLIC_URL`), `allowedReturnOrigins` (default
`STOREFRONT_URL` + `CORS_ORIGINS`), `gatewayTimeoutMs` (15000), `statusCheckIntervalMs` (10000).

Creating the payment methods for a new shop, e.g. in `scripts/setup-store.ts` after `populateInitialData`:

```ts
import { setupPaymentMethods } from '../src/plugins/payments-my/setup';

for (const method of await setupPaymentMethods(app, ctx)) {
    console.log(`Payment method ${method.code}: ${method.enabled ? 'on' : `off until ${method.missing.join(', ')} are filled in`}`);
}
```

It creates `chip` and `billplz` in ctx's channel, switched off until their keys are filled in, and leaves existing
methods alone. Keys can also come from the environment: `CHIP_BRAND_ID`, `CHIP_SECRET_KEY`, `CHIP_PAYMENT_METHODS`,
`BILLPLZ_API_KEY`, `BILLPLZ_COLLECTION_ID`, `BILLPLZ_X_SIGNATURE_KEY`, `BILLPLZ_SANDBOX=true`. Pass `{ chip: false }`
or `{ billplz: false }` to leave one out, or `{ chip: { code, name, … } }` to change its details.

Database: table `hosted_payment_attempt` (migration `payments-my`) records each purchase / bill opened, so that
callbacks (Billplz's don't say which order they are for) and status checks find their order.

## Not done

- Payments are confirmed by callbacks and by customers returning; there is no scheduled job yet that asks the
  gateways about payments neither confirmed (e.g. a paid customer who closed the browser while callbacks couldn't
  reach the server).
- No dashboard view of the payment pages opened per order; staff see recorded payments and the notes on the order.
- CHIP portal webhooks (signed per webhook) aren't accepted; only the per-purchase callback. CHIP doesn't call back
  on failed attempts; the storefront learns about them from `hostedPaymentStatus`.
- Billplz: no refunds through the API (none exists), and `preferredMethod` is ignored (Billplz can only skip its
  page for a specific bank).
- Ringgit only. Orders being modified after payment (`ArrangingAdditionalPayment`) can't be paid through here.
- Built and tested against the documented APIs with mock servers; not yet run against the real CHIP and Billplz
  sandboxes (needs the client's test keys).
