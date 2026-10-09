# Commerce System Plan — Admin + Payment

Updated: 2026-10-02

> Superseded on 2026-10-08 by [commerce-backend-plan.md](commerce-backend-plan.md): the admin, payments and delivery move to a reusable Vendure backend (now its own repository, `zoushunyu144000-ui/zoushunyu144000-ui-commerce-backend`).

## Goal

Build the Moire Co. commerce system as one integrated system rather than treating admin and payment as unrelated features.

## Development sequence

### Phase 1 — Data foundation + core admin
- Product data model
- Categories / collections
- Price
- SKU / product ID
- Inventory quantity
- Sold Out / active status
- Festive collection status
- Homepage featured products / section visibility
- Product images and descriptions

### Phase 2 — Admin UI
- Create / edit / archive products
- Update price and inventory
- Toggle Sold Out
- Upload / replace images
- Switch active festive collection
- Control homepage featured products and ordering
- Basic site settings

### Phase 3 — Checkout + payment gateway
- Cart validation
- Server-side price validation
- Create order before payment
- Payment provider integration
- Payment success / failed / cancelled states
- Test-mode checkout

### Phase 4 — Webhook + order admin
- Payment webhook verification
- Order payment status sync
- Payment reference storage
- Order detail view
- Inventory deduction after confirmed payment
- Prevent double-processing / duplicate payment effects

### Phase 5 — End-to-end QA
Test full flow:
Admin changes product → storefront updates → customer adds to cart → checkout → payment → webhook → paid order → inventory update → admin sees order.

Also test:
- Sold-out products
- Insufficient stock
- Payment failure / cancellation
- Duplicate webhook
- Mobile / desktop
- Festive collection switching
- Homepage display changes

## Important implementation rule

Admin data structure must be established before payment integration starts. Payment work may begin once product IDs, prices, inventory and order schema are stable; the entire admin UI does not need to be 100% polished first.

## Client dependency before payment integration

Before choosing the payment gateway, confirm:
- Required payment methods (FPX / cards / e-wallets / DuitNow, etc.)
- Whether customers are mainly Malaysia-only or also overseas
- Merchant/business registration status
- Business bank account availability
- Who will own and verify the payment-provider account

Client should register the payment-provider account in the business owner's/company's own name. Developer receives only the technical integration credentials needed for setup; identity/KYC/KYB verification stays with the client.
