# Current Handoff — 2026-09-27

## What changed
The full website (v1) has been built in this repository (branch `website-v1`) as a working Next.js application, replacing the Stitch-only UI phase. See `WEBSITE-README.md` for pages, architecture, run instructions and the go-live checklist.

- Storefront: homepage (locked IA order), Festive / Fixed Gift Collection / Wine & Spirits listings, product pages, search, bag, checkout, test-mode payment, order confirmation / failure / retry
- Corporate Orders: overview, Semi-curated (internal request path with reference), Fully Customised “MADE FOR YOUR BRAND” (Enquiry Now → WhatsApp)
- Admin: orders (incl. engraving + gift messages), products (multi-image upload, options/upgrades, engraving, status, homepage feature), corporate enquiries, settings (festive season, hero copy, delivery, WhatsApp)
- Data: Supabase schema + adapter ready; runs in demo mode until the client’s Supabase project is connected

## Design decisions
- Stitch used as visual reference only: light ivory / cream / champagne, Bodoni Moda + Jost, hairlines, sharp corners, 4:5 product imagery. Product page fully redesigned.
- Not carried over from Stitch (no basis in requirements): cellar program, climate-controlled fleet, calligraphy cards, wax seals, PDF catalogue, client references, accounts, invented edition labels.
- Festive default = Chinese New Year 2027 (Mid-Autumn 2026 ended 25 Sep). Changeable in Admin → Settings.

## Placeholders — need client input before launch
| Item | Current placeholder | Where to change |
|---|---|---|
| Product names, contents, specs, allergens | Sample catalogue (23 products) using historical price points RM188–RM2388 | Admin → Products |
| Product photography | Unsplash placeholders, one set per product, none reused (`IMAGE-CREDITS.md`) | Admin → Products → Upload photos |
| WhatsApp number | 60123456789 (not real) | Admin → Settings |
| Delivery fee / free-delivery threshold / lead time | RM20 flat, none, 2 days | Admin → Settings |
| Engraving fee | RM0 (not shown) | Admin → Products → Personalisation |
| Semi-curated customisation options | Company name on card, card message, logo on packaging, notes | Code: `src/components/corporate/semi-curated-form.tsx` |
| Delivery & returns / terms / privacy wording | Draft templates, marked “Draft for review” on the pages | `src/app/(shop)/delivery`, `terms`, `privacy` |
| Payment gateway | Built-in test mode (FPX / card / e-wallet simulated) | `src/lib/payments` — provider TBD |
| Database | Demo mode (temporary storage on hosting) | Supabase env vars — client’s account |
| Contact email / business hours | Empty (hidden) | Admin → Settings |

## Questions to confirm with the client
1. Which payment gateway? (affects FPX / card / e-wallet integration and fees)
2. Real product list for CNY 2027, Fixed Gift Collection and Wine & Spirits — names, contents, prices, photos
3. Which liquor options map to the upgraded prices (RM988 / 1188 / 1288 / 2388)?
4. Delivery coverage, fee and minimum lead time; is self-collection offered?
5. Engraving: which products, character limit, extra charge?
6. Semi-curated: exact customisation options and minimum quantity, if any
7. Halal certification details for Hari Raya items
8. Business WhatsApp number and email

## Next milestone
Client reviews the preview → confirms direction and the items above → RM750 deposit (per SCOPE-AND-PRICING.md) → connect Supabase + gateway, load real products → QA → launch.

## Update — brand art-direction pass (v1.1)
Visual upgrade only; routes, data, cart, checkout, search, admin and product states unchanged.
- Brand device: **the moiré** — two offset sets of fine rings (the watered-silk pattern the name refers to), tone-on-tone champagne, used only in the hero, the Festive chapter, and the footer.
- One photographic grade across all imagery (`.grade` in globals.css) so mixed placeholder photos read as one body of work; product photos sit in a paper mount (`.mount`) in collections.
- Bodoni italic for one emphasis per headline; `*word*` in admin settings text renders italic.
- Homepage rhythm: hero (photo bled to the edge) → one-line pause → Festive as a seasonal chapter (large year numeral) → Fixed Gift editorial spread + engraving strip → Wine & Spirits as a wine list → Corporate on cream with the process line.
- Festive page: campaign opening, typographic occasion tabs, editorial spread for the current season, a useful pause (gift message / delivery date), other occasions grouped below.
- Cards: badges removed from photographs; notes set as a quiet text line; quick add appears on hover (desktop only).
- Copy: plainer product names and summaries; removed the hero image that showed third-party text.
