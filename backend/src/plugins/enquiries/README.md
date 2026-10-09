# enquiries

Quote requests from the storefront (corporate gifts: semi-customised or fully customised), managed by
staff in the dashboard (API contract §5).

```ts
EnquiriesPlugin.init({ codePrefix: 'ENQ', rateLimit: { limit: 5, windowMinutes: 60 } })
```

| Option | Default | |
|---|---|---|
| `notifyEmail` | env `SHOP_NOTIFY_EMAIL` | Where the "new enquiry" email goes; several addresses separated by commas. Neither set: no email (a warning is logged at start-up). |
| `codePrefix` | `ENQ` | References look like `ENQ-7G4K2` (no 0/O or 1/I). |
| `types` | any | Only accept these types, e.g. `['semi-customised', 'fully-customised']`. By default any short lower-case name is accepted. |
| `rateLimit` | 5 per hour | Accepted enquiries per IP address; `false` turns it off. |
| `dashboardUrl` | env `VENDURE_PUBLIC_URL` + `/dashboard` | For the "Open in the dashboard" button in the email (left out when unknown). |

## Storefront: `submitEnquiry`

```graphql
mutation Submit($input: SubmitEnquiryInput!) {
    submitEnquiry(input: $input) {
        ... on EnquiryReceipt { code }
        ... on EnquiryError { errorCode message }
    }
}
```

Semi-customised (gifts chosen from the catalogue):

```json
{
    "type": "semi-customised",
    "contact": { "name": "Sarah Tan", "company": "Acme Sdn Bhd", "email": "sarah@acme.com.my", "phone": "012-345 6789" },
    "items": [{ "productVariantId": "12", "quantity": 40 }],
    "details": {
        "customisation": { "companyNameOnCard": "Acme", "cardMessage": "Happy New Year", "logoOnPackaging": true, "notes": "" },
        "deliveryDate": "2027-01-20",
        "deliveryAddress": "Level 5, Menara Acme\nJalan Ampang, 50450 Kuala Lumpur",
        "multipleAddresses": false,
        "website": ""
    }
}
```

Fully customised: no `items`; `details` such as `style`, `quantity` (number of gifts), `budgetPerGift`,
`deliveryDate`, `deliveryAddress`, `multipleAddresses`, `notes`.

Show `message` to the customer as it is; `errorCode` says what kind of problem it is:

| errorCode | When | Example message |
|---|---|---|
| `ENQUIRY_INPUT_ERROR` | A field is missing or not valid | "Please enter a valid phone number, e.g. 012-345 6789, or with the country code, e.g. +65 9123 4567." |
| `ENQUIRY_ITEM_UNAVAILABLE_ERROR` | A gift is unknown, deleted, disabled or not in this shop | "One of the gifts you chose is no longer available. Please refresh the page and choose again." |
| `ENQUIRY_RATE_LIMIT_ERROR` | Too many enquiries from one address | "You’ve sent several requests in a short time. Please try again in about 40 minutes, or message us on WhatsApp." |

Checks: name 2–100 characters, company up to 120, a valid email; a phone number written the Malaysian
way (012-345 6789, 03-1234 5678, 60…, +60…) or with another country's code (+65…, 0065…), saved as
`+60123456789`; up to 50 gifts, each 1–9,999 (the same gift twice is added up); `details` is an object
of text, numbers, yes/no, lists and one level of groups (40 fields, 2,000 characters a text), with
`deliveryDate` a `YYYY-MM-DD` date not in the past (Malaysian time) and `quantity` a whole number.
Prices and names of the chosen gifts are saved as they are at that moment; a selection worth more than
RM 21 million (what a money column holds) is refused with a request to get in touch directly.

### Against spam

- **Hidden field:** add an input named `website` that people can't see (off-screen, `tabindex="-1"`,
  `autocomplete="off"`, `aria-hidden`) and send it as `details.website`. If it is filled in, the answer
  is a normal-looking receipt but nothing is saved or emailed.
- **Rate limit:** counted per IP address, in memory (resets when the server restarts). If the storefront
  calls the Shop API from its own server rather than from the browser, every enquiry comes from that
  server's address: pass the customer's address in `X-Forwarded-For` and set Vendure's
  `apiOptions.trustProxy` to match, or use `rateLimit: false`.

## Staff

**Sales → Enquiries** (permission `ReadEnquiry`): newest first, search by reference, name, company,
email or phone, filters for status and type. The detail page shows the gifts with an indicative value,
the other details, the contact with WhatsApp and email buttons, and lets staff (`UpdateEnquiry`) set
the status (New, In progress, Quoted, Confirmed, Closed) and internal notes.

The owner and staff roles need the two permissions added (the super admin has them). In the dashboard:
Settings → Roles → the role → "Enquiry: Read / Update".

Each new enquiry is emailed to the shop with Reply-To set to the customer, so staff can answer from
their inbox (template: `static/email/templates/enquiry-submitted/body.hbs`; in dev it is written to
`static/email/test-emails`, see `/mailbox`). The plugin adds this email to the EmailPlugin itself.
Emails are sent by the worker, so it must be running.

## Admin API

```graphql
enquiries(options: EnquiryListOptions): EnquiryList!   # filter on code, type, status, createdAt, contactName, contactCompany, contactEmail, contactPhone…
enquiry(id: ID!): Enquiry
enquiryTypes: [String!]!                               # types received so far
updateEnquiry(input: { id: ID!, status: EnquiryStatus, internalNotes: String }): Enquiry!
```

`Enquiry` has `contact { name company email phone }`, `items { productVariantId productName variantName
sku quantity unitPriceWithTax }`, `totalQuantity`, `itemsTotalWithTax`, `details` (as sent) and
`detailRows { label value }` (worded for staff, as in the email).

Other plugins can subscribe to `EnquirySubmittedEvent` (e.g. to post new enquiries to a chat).

## Files

| File | What |
|---|---|
| `enquiries.plugin.ts`, `constants.ts` | Registration, options, permissions, email hook-up |
| `api.ts`, `enquiry.service.ts`, `results.ts` | GraphQL schema and resolvers; submit, list, update |
| `validation.ts`, `code.ts`, `rate-limiter.ts` | Input checks, references, the per-address limit |
| `enquiry.entity.ts`, `enquiry-submitted.event.ts` | Database table and event |
| `email.ts`, `format.ts` | The email and the wording shared with the dashboard's details |
| `dashboard/index.tsx` | List and detail pages |

Tests: `npm test` (validation, codes, rate limiter, wording). `e2e-smoke.mjs` drives a running dev
server and worker set up from `stores/moire` (34 checks: Shop API submissions and refusals, the
honeypot, Admin API list/filter/update, a role with ReadEnquiry only, the email file, the rate limit,
and the storefront-content fields):

```bash
npx ts-node --transpile-only src/index.ts          # server
npx ts-node --transpile-only src/index-worker.ts   # worker (sends the emails)
node src/plugins/enquiries/e2e-smoke.mjs           # from backend/, reads .env (SHOP_NOTIFY_EMAIL, super admin)
```
