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
- **Member tiers** (optional, off by default): customers are kept in the customer group of the tier
  their lifetime spend reaches, for member prices and perks through ordinary promotions.

## Options

`LoyaltyPlugin.init({...})` in `vendure-config.ts`; invalid values stop the server at start-up.

| Option | Default | Meaning |
|---|---|---|
| `pointsPerRinggit` | `1` | Points per whole ringgit of the products total (after discounts, delivery excluded). `0` stops earning. |
| `pointValueSen` | `1` | What one point is worth when used: `1` → 100 points = RM 1. |
| `minRedeemPoints` | `500` | Fewest points usable on one order. |
| `maxRedeemPercent` | `50` | Most of the items' price points can pay for. `0` stops redeeming. |
| `earnOnState` | `'PaymentSettled'` | Order state that earns the points (e.g. `'Delivered'` to wait for delivery). |
| `tiers` | `[]` | Member tiers, e.g. `[{ name: 'Silver members', minSpendSen: 100000 }, { name: 'Gold members', minSpendSen: 500000 }]`. Empty: no tiers. |
| `tierSchedule` | `'0 19 * * *'` | When the nightly tier update runs: cron in server time (19:00 UTC = 03:00 in Malaysia). |

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

## Member tiers (optional)

With `tiers` set, each tier is a customer group (created when missing) and every registered
customer is kept in the group of the highest tier their lifetime spend reaches, and in no other tier
group. Lifetime spend is the products total after discounts (delivery not counted) of their paid
orders that aren't cancelled: the same basis as points. It is updated:

- nightly for everyone, by the scheduled task `loyalty-member-tiers` (it runs in the worker; staff
  can also start it under **System → Scheduled Tasks**);
- straight away for one customer when an order of theirs is settled or cancelled, inside that
  order's transaction, so an upgrade (or a downgrade after a cancellation) shows at once.

Joining and leaving a tier group goes through Vendure's customer groups, so it appears in the
customer's history. Perks are ordinary promotions: **Marketing → Promotions → New**, condition
"Customer is a member of the specified group" with the tier's group, then any action (a percentage
off, free delivery…). The tier groups are managed by the plugin, so changes to them by hand are
undone on the next run; use another group for hand-picked VIPs. Example for Moire:

```ts
LoyaltyPlugin.init({ /* … */ tiers: [{ name: 'Silver members', minSpendSen: 100000 }, { name: 'Gold members', minSpendSen: 500000 }] }),
```

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
cancellation idempotency), `tiers.spec.ts` (tier thresholds and group moves) and `wiring.spec.ts`
(custom fields, promotion behaviour, permissions, the tier task).
`node src/plugins/loyalty/e2e-smoke.mjs` drives a running server end to end (see the file header); it
also covers the staff-permissions plugin.

## Not done

- Tiers don't change how many points are earned (a per-tier multiplier on `pointsPerRinggit` would
  go in the earning step) and count lifetime spend only (no rolling 12-month window).
- Partial cancellations and refunds don't change points (only full cancellation reverses); staff
  adjust by hand.
- Points don't expire.
- The balance is per customer, not per channel; each channel needs its own promotion.
- Earning assumes 100 sen per ringgit (currencies with other minor units would need a factor).
