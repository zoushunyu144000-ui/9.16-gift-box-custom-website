# Loyalty points (`loyalty`)

Member points for a Vendure shop: customers with an account earn points on paid orders and use them
for a discount at checkout. Implements [api-contracts §4](../../../docs/api-contracts.md).

- **Earn**: when an order reaches `earnOnState` (default `PaymentSettled`), its customer gets
  `floor(products total after discounts, in ringgit) × pointsPerRinggit`. Delivery doesn't count and
  guests (customers without an account) earn nothing. Once per order.
- **Redeem**: the storefront calls `applyLoyaltyPoints(points)` on the active order. The points are
  checked (balance, minimum, at most `maxRedeemPercent` of the items) and stored on the order; a
  Vendure promotion turns them into a discount, so it shows in `order.discounts` and the totals like
  any other. The points leave the balance when the order is placed.
- **Cancel**: cancelling an order takes back the points it earned and returns the points used on it.
- **Ledger**: every change is a `LoyaltyPointsEntry` (`earned`, `redeemed`, `adjusted`, `reversed`).
  `Customer.customFields.loyaltyPoints` is the running balance, written in the same transaction as
  each entry and read-only through the APIs, so it always matches the history.
- **Staff**: the customer page shows the balance and recent history; staff who can edit customers
  add or take away points with a note.

## Options

`LoyaltyPlugin.init({...})` in `vendure-config.ts`; invalid values stop the server at start-up.

| Option | Default | Meaning |
|---|---|---|
| `pointsPerRinggit` | `1` | Points per whole ringgit of the products total (after discounts, delivery excluded). `0` stops earning. |
| `pointValueSen` | `1` | What one point is worth when used: `1` → 100 points = RM 1. |
| `minRedeemPoints` | `500` | Fewest points usable on one order. |
| `maxRedeemPercent` | `50` | Most of the items' price points can pay for. `0` stops redeeming. |
| `earnOnState` | `'PaymentSettled'` | Order state that earns the points (e.g. `'Delivered'` to wait for delivery). |

## Setting up a shop

The discount needs a promotion that uses the plugin's condition and action. `setupLoyalty(app, ctx)`
(in `setup.ts`) creates it in the context's channel, enabled, named "Loyalty points"; it is
idempotent and leaves an existing one (even a disabled one) alone. The store setup script calls it for
new shops. For a shop set up before this plugin, either run it once or add the promotion in the
dashboard: **Marketing → Promotions → New**, name it (the name is what customers see on the order),
condition **"The customer uses loyalty points on the order"**, action **"Take the value of the
loyalty points used off the order"**, no coupon code, enabled.

The migration `1791504532615-loyalty-staff-permissions` adds the ledger table and the two custom fields.

## Storefront (Shop API)

```graphql
query { loyaltySettings { pointsPerRinggit pointValueSen minRedeemPoints maxRedeemPercent } }   # public
query { activeCustomer { customFields { loyaltyPoints } } }                                    # balance
query { loyaltyHistory(options: { skip: 0, take: 20 }) { totalItems items { createdAt points reason note orderCode } } }

mutation { applyLoyaltyPoints(points: 1000) {     # 0 removes the points
  ... on Order { totalWithTax discounts { description amountWithTax } customFields { loyaltyPointsApplied } }
  ... on LoyaltyPointsError { errorCode message } # message is written for the customer
} }
```

- `loyaltyHistory` needs a signed-in customer (`FORBIDDEN` otherwise); newest first, `take` default 20, at most 100.
  `LoyaltyHistoryOptions` is `{ skip: Int, take: Int }` (the contract names the input but leaves its fields open).
- `applyLoyaltyPoints` works on the active order of a signed-in customer while it is in `AddingItems`
  (before payment). `Order.customFields.loyaltyPointsApplied` (read-only) shows the points on the order.
- Before payment (`transitionOrderToState('ArrangingPayment')`) the points are checked again; if the
  balance dropped or the bag no longer fits them, checkout stops with an `OrderStateTransitionError`
  saying what to change.

## Staff (Admin API and dashboard)

```graphql
query { customerLoyaltyHistory(customerId: "1", options: { take: 10 }) { totalItems items { createdAt points reason note orderCode administratorName } } }  # ReadCustomer
mutation { adjustLoyaltyPoints(customerId: "1", points: -200, note: "Points for a returned item") { customFields { loyaltyPoints } } }                         # UpdateCustomer
```

Dashboard: open a customer (**Customers → a customer**). The **Loyalty points** block below their
orders shows the balance, what it is worth, the last 10 entries (with links to orders) and, for staff
with *UpdateCustomer*, an **Adjust points** form: a whole number (negative to take away) and a note,
which the customer also sees in their history. The balance can't go below 0 through an adjustment.
The discount appears on orders as "Loyalty points"; the points used are under the order's custom fields.

To pause redemption, disable the promotion (customers then get "Points can’t be used at the
moment"); don't delete it.

## How it works

- Earning, taking points at placement and reversing on cancellation run as blocking `EventBus`
  handlers inside the order's own transaction, each in a savepoint: points are recorded or rolled back
  together with the order change, and a points error is logged without ever stopping an order.
- Each automatic entry has a unique key (`order:<id>:earned`, `:redeemed`, `:earned-reversed`,
  `:redeemed-reversed`); writes lock the customer's row, so repeated events can't add an entry twice.
- The promotion condition passes only when the requested points fit the order, so the discount is
  always exactly their value; the points taken at placement match it. Once an order is placed its
  discount stays even if staff later modify the order (never more than the items cost).
- Points taken when the payment has already succeeded are recorded even if the balance went
  negative meanwhile (logged as a warning); the next points earned make it up.

## Tests

`npm test` runs `points.spec.ts` (rounding, minimum, maximum %, value), `ledger.spec.ts` (keys and
cancellation idempotency) and `wiring.spec.ts` (custom fields, promotion behaviour, permissions).
`node src/plugins/loyalty/e2e-smoke.mjs` drives a running server end to end (see the file header); it
also covers the staff-permissions plugin.

## Not done

- **Member tiers by lifetime spend.** Design: a customer group per tier (e.g. Silver from RM 1,000,
  Gold from RM 5,000) listed in a `tiers` option; a nightly `ScheduledTask` (the `DefaultSchedulerPlugin`
  is already installed; e.g. 03:00 Asia/Kuala_Lumpur) sums each registered customer's
  `subTotalWithTax` over orders that are paid and not cancelled (one SQL aggregate, optionally over a
  rolling 12 months) and moves customers between the tier groups with `CustomerGroupService`, changing
  only those whose tier changed. Perks then use Vendure's built-in `customer_group` promotion condition
  (member prices, free delivery), and an optional per-tier multiplier could scale `pointsPerRinggit`.
  An `OrderStateTransitionEvent` handler can re-check one customer straight after a payment so
  upgrades show the same day.
- Partial cancellations and refunds don't change points (only full cancellation reverses); staff
  adjust by hand.
- Points don't expire.
- The balance is per customer, not per channel; each channel needs its own promotion.
- Earning assumes 100 sen per ringgit (currencies with other minor units would need a factor).
