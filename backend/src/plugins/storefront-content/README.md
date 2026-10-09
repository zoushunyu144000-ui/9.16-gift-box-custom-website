# storefront-content

Shop texts and contact details that staff edit in the dashboard and the storefront reads from the Shop
API (API contract §5). They are custom fields on the **Channel**, so a server that hosts several shops
(one channel each) keeps each shop's texts apart.

```ts
StorefrontContentPlugin.init()
```

## Fields

| Field | Type | Limit | Shown as |
|---|---|---|---|
| `heroEyebrow` | text | 60 | Homepage banner: small heading above the headline |
| `heroTitle` | text | 80 | Homepage banner: headline (`/` = new line) |
| `heroText` | long text | 300 | Homepage banner: introduction |
| `featuredCollectionSlug` | text | slug | Collection in the spotlight on the homepage (e.g. the festival in season); empty = none |
| `featuredTitle` | text | 80 | Heading above those gifts |
| `featuredIntro` | long text | 300 | Sentence or two under that heading |
| `whatsappNumber` | text | digits | WhatsApp buttons: digits with the country code, e.g. `60123456789` |
| `contactEmail` | text | email | Shown to customers (optional) |
| `businessHours` | text | 80 | Footer and order confirmation, e.g. "Mon–Sat, 10am–6pm" (optional) |
| `showPreviewNotice` | on/off | | "Preview build / test payments" notice; **on** for a new shop, turn off at launch |

Empty texts are `null`. The limits are the room the storefront's layout gives each text (the same as
the storefront's old settings page). Saving a value that breaks a rule is refused with a message that
names the field, e.g. "WhatsApp number: Start with the country code instead of 0, e.g. 60123456789
for 012-345 6789."

## Storefront

```graphql
{
    activeChannel {
        customFields {
            heroEyebrow heroTitle heroText
            featuredCollectionSlug featuredTitle featuredIntro
            whatsappNumber contactEmail businessHours showPreviewNotice
        }
    }
}
```

The server keeps channels in a cache for 30 seconds: a change shows immediately on the server that
saved it, and within 30 seconds on any other server process.

## Staff

**Settings → Storefront** in the dashboard edits these fields for the channel selected at the top left
(the only one in a one-shop setup), in four sections: Homepage banner, Featured collection (picked from
a list of the shop's collections), Contact, Notices. It needs the `UpdateChannel` permission (the
owner role has it). The same fields are also under Settings → Channels → the channel.

## A new shop's first values

`setupStorefrontContent(app, ctx, content)` (setup.ts) writes them to the default channel; the store
setup calls it after the shop is created. Only the fields given change; text is trimmed, empty text
clears a field, "+", spaces and dashes are taken out of the WhatsApp number, and any value the
dashboard would refuse (or a misspelt field name) throws with every problem listed.

```ts
import { setupStorefrontContent } from '../src/plugins/storefront-content/setup';

await setupStorefrontContent(app, ctx, {
    heroEyebrow: 'Chinese New Year 2027',
    heroTitle: 'More than a gift / A memory',
    heroText: 'Festive boxes, year-round gifts, wine gift boxes and corporate orders — from Moire Co. in Kuala Lumpur.',
    featuredCollectionSlug: 'chinese-new-year',
    featuredTitle: 'Chinese New Year 2027',
    featuredIntro: 'Boxes and hampers for the first visits of the year — to parents and grandparents, to friends, and to the people you work with.',
    whatsappNumber: '601128691092',
    showPreviewNotice: true,
});
```

For a shop that already exists (the store setup only runs on an empty database), put the values in a
JSON file and run, from `backend/` after the migrations:

```bash
npx ts-node --transpile-only src/plugins/storefront-content/apply-content.ts content.json
```

## Files

| File | What |
|---|---|
| `storefront-content.plugin.ts` | The Channel custom fields: labels, help texts, sections, checks |
| `content.ts` | The rules (limits, WhatsApp number, email, slug), shared by the fields and the setup |
| `setup.ts`, `apply-content.ts` | First values for a new shop; the same for an existing one |
| `dashboard/index.tsx` | Settings → Storefront page and the collection picker |

Tests: `npm test` (`content.spec.ts`, `storefront-content.plugin.spec.ts`); the enquiries plugin's
`e2e-smoke.mjs` also runs `apply-content.ts` with Moire's values and reads them back from the Shop API.
