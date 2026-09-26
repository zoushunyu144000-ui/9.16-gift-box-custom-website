# Requirements

> Last synced: 2026-09-26  
> Status: pricing agreed; entering UI design. Latest confirmed requirements below take precedence over older notes.

## 1. Brand / Positioning
- Brand: **Moire Co.**
- Business: premium gift boxes / festive gifting / fixed gifts / wine & spirits / corporate gifting
- Website: custom-designed, mobile-first e-commerce website
- Visual target: **Luxury + Clean**
- Avoid generic Shopify/template look
- Avoid overly decorative, overly pink, overly dark, or poster-like UI

## 2. Final Homepage Information Architecture

### Header
- Moire Co. logo / wordmark
- Menu
- Search
- Cart

### Simple Hero
- Restrained premium gift imagery
- Short copy / CTA
- Supports future image rotation / subtle animation

### Festive Collection
- Priority section during festive season
- Appears directly below Hero
- Horizontal featured product row
- Approx. 3–4 products visible as a collection
- Product image + name + price
- Should feel like real e-commerce UI, not a campaign poster

### Remaining homepage sections
Displayed vertically below Festive Collection:
1. Fixed Gift Collection
2. Wine & Spirits
3. Corporate Orders

### Seasonal logic
- During festive season: Festive Collection is homepage priority
- Outside festive season: homepage can shift emphasis back to regular / corporate / fixed categories

## 3. Main Categories

### Festive Collection
Includes examples such as:
- CNY
- Mid-Autumn Festival
- Dragon Boat Festival
- Hari Raya

Purchase flow:
Product listing → Product detail → Quantity → Cart → Checkout → Online payment

Historical pricing example:
- RM188 / RM288 / RM388 / RM588
- RM988 / RM1188 / RM1288 / RM2388 as upgraded versions with different liquor options

### Fixed Gift Collection
Purchase flow:
Product listing → Product detail → Quantity → Cart → Checkout → Online payment

Additional requirement:
- Optional personalisation / engraving
- Customer can add a name for selected products
- Personalisation value must be stored with the order

### Wine & Spirits
Purchase flow:
Product listing → Product detail → Cart → Checkout → Online payment

### Corporate Orders
Contains:
- Semi-curated
- Fully Customised

#### Semi-curated
Latest direction:
- Based on existing / fixed products
- Supports lighter customisation rather than fully bespoke work
- Exact option set should be confirmed during detailed UI / functional design
- Do **not** treat the older “Enquiry Now → WhatsApp only” interpretation as final

#### Fully Customised
Dedicated enquiry flow.

Suggested page heading:
**MADE FOR YOUR BRAND**

Process:
1. Choose style, quantity, date, address
2. Proposal prepared
3. Client reviews / confirms proposal
4. Production
5. Delivery

CTA:
**Enquiry Now → WhatsApp**

## 4. E-commerce Functions
- Product listing
- Product details
- Product variants / upgrade options where needed
- Quantity selector
- Optional engraving / customisation
- Cart
- Checkout
- Online payment
- Order creation
- WhatsApp contact / enquiry entry

Payment methods discussed:
- FPX
- Card
- E-wallet

Actual gateway provider: **TBD**

## 5. Admin / CMS
Client should be able to manage the store after handover.

Required:
- Product management
- Category management
- Product image upload
- Product details
- Price
- Product status / availability
- Festive content / homepage featured products
- Orders
- Customisation / engraving data

### Product images
Client expects up to about **10 images per product**, but image count is flexible per product.

Implementation direction:
- Multi-image upload
- Automatically optimise / compress images on upload where practical
- Prefer WebP/optimised delivery
- No fixed requirement that every product has exactly 10 images

## 6. Storage / Database Direction
Initial plan:
- Supabase Free tier is sufficient for launch / early-stage usage
- No need for client to purchase paid database/storage at project start
- Upgrade only if product count, image storage, or traffic grows beyond free limits

## 7. Technical / External Costs
Not included in development fee:
- Domain
- Hosting / deployment paid upgrades
- Paid database / storage upgrades
- Payment gateway fees / transaction fees
- Other third-party services

Developer can assist with setup; client pays actual third-party costs.

## 8. Historical Requirement Record
Original 2026-09-16 structure was:
- Corporate Premium Gift
- Festive Premium Gift Box

The newer confirmed structure supersedes it:
- Festive Collection
- Fixed Gift Collection
- Wine & Spirits
- Corporate Orders

Keep the historical notes for traceability, but design/development must use the latest structure above.
