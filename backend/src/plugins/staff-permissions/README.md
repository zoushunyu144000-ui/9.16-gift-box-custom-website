# Staff permissions (`staff-permissions`)

Permissions Vendure doesn't have, so staff roles can be narrower than its built-in ones.
Implements the staff part of [api-contracts §4](../../../docs/api-contracts.md).

## `ShipOrder`: ship without being able to refund

Vendure ties shipping (fulfilments) to `UpdateOrder`, which also allows refunds, cancellations,
payment settlement and order changes. `ShipOrder` ("Ship orders: book delivery, record tracking, mark
delivered") covers only shipping, so a packer role is `ReadOrder` + `ShipOrder` without `UpdateOrder`.

| Admin API | Needs | Does |
|---|---|---|
| `shipOrder(input: { orderId, lines?, handler })` | `ShipOrder` | Creates the fulfilment with the chosen fulfilment handler and its arguments (`OrderService.createFulfillment`) and marks it `Shipped`. `lines` (`[{ orderLineId, quantity }]`) defaults to everything not shipped yet. Returns Vendure's `AddFulfillmentToOrderResult` (`Fulfillment` or its usual error results). |
| `markFulfillmentDelivered(fulfillmentId)` | `ShipOrder` | Marks a fulfilment `Delivered`. Returns `TransitionFulfillmentToStateResult`. |
| `fulfillmentHandlers` (Vendure's own) | `ReadOrder` | The handlers to choose from and their arguments (e.g. `manual-fulfillment`: method and tracking code; later the couriers plugin's `lalamove`, `easyparcel`, `manual-courier`). |

Both mutations go through `OrderService`, so handlers, stock, order states (Shipped / Partially
shipped / Delivered), order history and events behave exactly as with the dashboard's own buttons.
They only accept orders that could ship from their current state (paid, partly shipped or partly
delivered; not while being modified or awaiting extra payment), and only lines of that order. If a
handler refuses "Shipped", the fulfilment stays `Pending` (so a courier booking isn't lost), the
error is returned, and it can still be marked delivered.

```graphql
mutation {
  shipOrder(input: {
    orderId: "12"
    handler: { code: "manual-fulfillment", arguments: [{ name: "method", value: "GDex" }, { name: "trackingCode", value: "GD123456789" }] }
  }) {
    ... on Fulfillment { id state trackingCode }
    ... on ErrorResult { errorCode message }
  }
}
```

## Dashboard

- **Settings → Roles**: `ShipOrder` appears with Vendure's permissions; tick it for packers (with
  `ReadOrder`, and without `UpdateOrder`).
- **Sales → Orders → an order**: staff with `ShipOrder` see a **Ship order** block under the order
  lines. It lists what is left to ship with a quantity each (all by default), lets them choose how it
  ships (the fulfilment handlers, starting with the order's delivery method's) and fill in its fields
  (e.g. courier and tracking number), then **Mark shipped**. Parcels on the way are listed with
  **Mark delivered**. Vendure's own "Fulfill order" and refund buttons stay hidden from them.

## Roles for the store setup script

`scripts/setup-store.ts` presets (import `shipOrderPermission` from `src/plugins/staff-permissions/permissions`):

| Role | Change |
|---|---|
| owner | add `shipOrderPermission.Permission` (Vendure's `Permission` enum doesn't include plugin permissions) |
| customer-service | add `shipOrderPermission.Permission` |
| packer | `ReadCatalog, ReadOrder, ShipOrder, ReadShippingMethod, ReadStockLocation, ReadCountry, ReadZone`, no `UpdateOrder` |

Existing shops: edit the roles under **Settings → Roles** (the super admin gets `ShipOrder` automatically).

## Tests

`npm test` runs `staff-permissions.spec.ts`: the permission's definition and registration, that both
mutations need `ShipOrder` alone (not `UpdateOrder`) and run in a transaction, and the shipping rules
(what is left to ship, which states can ship, which lines are accepted).
`node src/plugins/loyalty/e2e-smoke.mjs` checks against a running server that a `ReadOrder` +
`ShipOrder` user can ship and mark delivered while `refundOrder`, `settlePayment`, `updateProduct`,
`addFulfillmentToOrder` and `cancelOrder` are `FORBIDDEN`, and that staff without `ShipOrder` can't ship.

## Not done

- No ship-only way to cancel a fulfilment or to move a `Pending` one to `Shipped` (staff with
  `UpdateOrder` can, from the fulfilment details).
- Packers see the whole order page (prices and payments included); Vendure has no field-level hiding there.
- Other narrow permissions (e.g. refunds up to an amount, stock adjustments only) can be added here the same way.
