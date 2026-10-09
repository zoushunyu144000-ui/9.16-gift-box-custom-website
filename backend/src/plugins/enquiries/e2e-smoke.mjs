// End-to-end smoke test for the enquiries and storefront-content plugins, against a running dev setup:
//   npx ts-node --transpile-only src/index.ts          (server)
//   npx ts-node --transpile-only src/index-worker.ts   (worker: sends the emails)
//   node src/plugins/enquiries/e2e-smoke.mjs           (from backend/; reads .env)
// Needs APP_ENV=dev (emails are written to static/email/test-emails), SHOP_NOTIFY_EMAIL, the super admin
// login and a shop set up from stores/moire. VENDURE_URL overrides http://localhost:<VENDURE_SERVER_PORT>.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

try {
    process.loadEnvFile('.env');
} catch {
    // No .env: rely on the environment.
}

const BASE = (process.env.VENDURE_URL || `http://localhost:${process.env.VENDURE_SERVER_PORT || 3000}`).replace(/\/$/, '');
// Enquiries are limited per IP address. On this machine every run gets its own loopback address
// (127.x.x.x), so the enquiries sent by an earlier run don't count against this one.
const SHOP_BASE = /\/\/(localhost|127\.0\.0\.1)(:|$)/.test(BASE)
    ? BASE.replace(/\/\/(localhost|127\.0\.0\.1)/, `//127.${1 + Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${2 + Math.floor(Math.random() * 250)}`)
    : BASE;
const EMAIL_DIR = path.resolve('static/email/test-emails');
const NOTIFY = process.env.SHOP_NOTIFY_EMAIL;

const results = [];
function expect(name, ok, detail = '') {
    results.push(!!ok);
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

function client(url) {
    let token = null;
    return async (query, variables = {}) => {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify({ query, variables }),
        });
        token = res.headers.get('vendure-auth-token') ?? token;
        const body = await res.json();
        if (body.errors) return { error: body.errors[0].message, code: body.errors[0].extensions?.code };
        return body.data;
    };
}
const shop = client(`${SHOP_BASE}/shop-api`);
const admin = client(`${BASE}/admin-api`);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const SUBMIT = `mutation($input: SubmitEnquiryInput!) {
    submitEnquiry(input: $input) { __typename ... on EnquiryReceipt { code } ... on EnquiryError { errorCode message } }
}`;
const submit = input => shop(SUBMIT, { input }).then(d => d.submitEnquiry ?? d);
const ENQUIRY = `id code type status createdAt contact { name company email phone }
    items { productVariantId productName variantName sku quantity unitPriceWithTax }
    totalQuantity itemsTotalWithTax currencyCode details internalNotes`;
const list = options => admin(`query($o: EnquiryListOptions) { enquiries(options: $o) { totalItems items { ${ENQUIRY} } } }`, { o: options }).then(d => d.enquiries ?? d);
const contact = { name: 'Sarah Tan', company: 'Lim & Tan Sdn Bhd', email: 'sarah@limtan.com.my', phone: '012-345 6789' };
const nextMonth = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);

console.log(`Shop API ${SHOP_BASE}/shop-api, Admin API ${BASE}/admin-api\n`);

// ── 1 · Storefront content: setupStorefrontContent with Moire's values (src/data/seed.ts) ─────────────
const moireContent = {
    heroEyebrow: 'Chinese New Year 2027',
    heroTitle: 'More than a gift / A memory',
    heroText: 'Festive boxes, year-round gifts, wine gift boxes and corporate orders — from Moire Co. in Kuala Lumpur.',
    featuredCollectionSlug: 'chinese-new-year',
    featuredTitle: 'Chinese New Year 2027',
    featuredIntro: 'Boxes and hampers for the first visits of the year — to parents and grandparents, to friends, and to the people you work with.',
    whatsappNumber: '601128691092',
    contactEmail: '',
    businessHours: '',
    showPreviewNotice: true,
};
const contentDir = mkdtempSync(path.join(tmpdir(), 'storefront-content-'));
writeFileSync(path.join(contentDir, 'moire.json'), JSON.stringify(moireContent));
const applied = spawnSync('npx', ['ts-node', '--transpile-only', 'src/plugins/storefront-content/apply-content.ts', path.join(contentDir, 'moire.json')], {
    encoding: 'utf8',
});
rmSync(contentDir, { recursive: true, force: true });
expect('setupStorefrontContent saves Moire’s texts to the default channel', applied.status === 0, (applied.stdout || applied.stderr).trim().split('\n').pop());
const contentStarted = Date.now();

// ── 2 · Shop API: valid enquiries ──────────────────────────────────────────────────────────────────────
const catalogue = await shop(`{ products(options: { take: 10 }) { items { name variants { id sku priceWithTax } } } }`);
const variants = catalogue.products.items.flatMap(p => p.variants);
const [boxA, boxB] = variants;

const semi = await submit({
    type: 'semi-customised',
    contact,
    items: [
        { productVariantId: boxA.id, quantity: 40 },
        { productVariantId: boxB.id, quantity: 10 },
    ],
    details: {
        customisation: { companyNameOnCard: 'Lim & Tan', cardMessage: 'Wishing you a prosperous new year.', logoOnPackaging: true },
        deliveryDate: nextMonth,
        deliveryAddress: 'Level 5, Menara Lim\nJalan Ampang, 50450 Kuala Lumpur',
        multipleAddresses: false,
        website: '',
    },
});
expect('semi-customised enquiry is accepted with a reference', /^ENQ-[A-HJ-NP-Z2-9]{5}$/.test(semi.code ?? ''), semi.code ?? JSON.stringify(semi));

const bespoke = await submit({
    type: 'fully-customised',
    contact: { name: 'Lim Wei Ming', email: 'weiming@example.com', phone: '+65 9123 4567' },
    details: { style: 'Festive hamper', quantity: 120, budgetPerGift: 'RM 150–200', deliveryDate: nextMonth, notes: 'Gold foil logo, please.' },
});
expect('fully customised enquiry (no items) is accepted', bespoke.__typename === 'EnquiryReceipt', bespoke.code ?? JSON.stringify(bespoke));

// ── 3 · Shop API: refusals ─────────────────────────────────────────────────────────────────────────────
const refusals = [
    ['an invalid email', { type: 'semi-customised', contact: { ...contact, email: 'sarah@limtan' } }, 'ENQUIRY_INPUT_ERROR'],
    ['a phone number that can’t be dialled', { type: 'semi-customised', contact: { ...contact, phone: '12345' } }, 'ENQUIRY_INPUT_ERROR'],
    ['a quantity of 0', { type: 'semi-customised', contact, items: [{ productVariantId: boxA.id, quantity: 0 }] }, 'ENQUIRY_INPUT_ERROR'],
    ['a quantity of 10,000', { type: 'semi-customised', contact, items: [{ productVariantId: boxA.id, quantity: 10000 }] }, 'ENQUIRY_INPUT_ERROR'],
    ['a gift that doesn’t exist', { type: 'semi-customised', contact, items: [{ productVariantId: '999999', quantity: 5 }] }, 'ENQUIRY_ITEM_UNAVAILABLE_ERROR'],
    [
        'a request too large to quote online (over RM 21 million)',
        { type: 'semi-customised', contact, items: variants.map(v => ({ productVariantId: v.id, quantity: 9999 })) },
        'ENQUIRY_INPUT_ERROR',
    ],
    ['a delivery date in the past', { type: 'fully-customised', contact, details: { deliveryDate: '2020-01-01' } }, 'ENQUIRY_INPUT_ERROR'],
    ['an unreadable type', { type: 'Corporate gifts!', contact }, 'ENQUIRY_INPUT_ERROR'],
];
for (const [what, input, errorCode] of refusals) {
    const r = await submit(input);
    expect(`refuses ${what}`, r.errorCode === errorCode, r.message ?? JSON.stringify(r));
}
const inline = await shop(`mutation { submitEnquiry(input: { type: "semi-customised", contact: { name: "S", email: "s@x.my", phone: "0123456789" } }) {
    ... on EnquiryError { errorCode message } } }`);
expect('refuses a one-letter name written inline in the query', inline.submitEnquiry?.message === 'Please enter your name.', inline.submitEnquiry?.message);

// ── 4 · Honeypot ───────────────────────────────────────────────────────────────────────────────────────
const bot = await submit({ type: 'semi-customised', contact, details: { website: 'https://cheap-pills.example', notes: 'Buy now' } });
expect('a filled-in hidden website field gets a normal-looking answer', bot.__typename === 'EnquiryReceipt', bot.code);

// ── 5 · Admin API ──────────────────────────────────────────────────────────────────────────────────────
const login = await admin(`mutation($u: String!, $p: String!) { login(username: $u, password: $p) { ... on CurrentUser { id } ... on ErrorResult { message } } }`, {
    u: process.env.SUPERADMIN_USERNAME,
    p: process.env.SUPERADMIN_PASSWORD,
});
expect('super admin logs in', login.login?.id, login.error ?? login.login?.message);

const found = await list({ filter: { code: { eq: semi.code } } });
const enquiry = found.items?.[0];
expect('the semi-customised enquiry is listed', found.totalItems === 1, enquiry ? `${enquiry.code}, ${enquiry.status}, ${enquiry.type}` : JSON.stringify(found));
expect(
    'its gifts are saved with names, SKUs and prices at the time',
    enquiry?.items.length === 2 && enquiry.items[0].sku === boxA.sku && enquiry.items[0].unitPriceWithTax === boxA.priceWithTax && enquiry.totalQuantity === 50,
    enquiry ? `${enquiry.items.map(i => `${i.quantity} × ${i.productName} @ ${i.unitPriceWithTax / 100}`).join(', ')}; total RM ${enquiry.itemsTotalWithTax / 100}` : '',
);
expect(
    'contact is tidied (international phone) and details kept',
    enquiry?.contact.phone === '+60123456789' && enquiry.details?.customisation?.logoOnPackaging === true && !('website' in (enquiry.details ?? {})),
    enquiry ? `${enquiry.contact.name}, ${enquiry.contact.company}, ${enquiry.contact.phone}` : '',
);
expect('a new enquiry starts as "new"', enquiry?.status === 'new');

const byType = await list({ filter: { type: { eq: 'fully-customised' } }, take: 100 });
expect(
    'filter by type',
    byType.items?.some(e => e.code === bespoke.code) && byType.items.every(e => e.type === 'fully-customised'),
    `${byType.totalItems} fully customised`,
);
const search = await list({ filter: { _or: [{ code: { contains: 'zzz' } }, { contactCompany: { contains: 'Lim & Tan' } }] }, take: 100 });
expect('search by company name', search.items?.some(e => e.code === semi.code), `${search.totalItems} found`);
const honeypotSaved = await list({ filter: { code: { eq: bot.code } } });
expect('the honeypot enquiry was not saved', honeypotSaved.totalItems === 0);

const updated = await admin(`mutation($input: UpdateEnquiryInput!) { updateEnquiry(input: $input) { id status internalNotes } }`, {
    input: { id: enquiry.id, status: 'quoted', internalNotes: 'Quoted RM 9,800 incl. delivery – sent 9 Oct.' },
});
expect('updateEnquiry sets status and internal notes', updated.updateEnquiry?.status === 'quoted', updated.error ?? updated.updateEnquiry?.internalNotes);
const byStatus = await list({ filter: { status: { eq: 'quoted' } }, take: 100 });
expect('filter by status', byStatus.items?.some(e => e.code === semi.code) && byStatus.items.every(e => e.status === 'quoted'), `${byStatus.totalItems} quoted`);
const one = await admin(`query($id: ID!) { enquiry(id: $id) { code status internalNotes } }`, { id: enquiry.id });
expect('enquiry(id) returns the update', one.enquiry?.internalNotes?.startsWith('Quoted RM 9,800'));
const badStatus = await admin(`mutation($id: ID!) { updateEnquiry(input: { id: $id, status: lost }) { id } }`, { id: enquiry.id });
expect('an unknown status is refused', !!badStatus.error, badStatus.error);
const types = await admin(`{ enquiryTypes }`);
expect('enquiryTypes lists the types received', ['fully-customised', 'semi-customised'].every(t => types.enquiryTypes?.includes(t)), types.enquiryTypes?.join(', '));
const shopCannotList = await shop(`{ enquiries { totalItems } }`);
expect('the Shop API has no enquiry list', !!shopCannotList.error);

// ── 6 · Permissions: a role with ReadEnquiry only ──────────────────────────────────────────────────────
const run = Date.now().toString(36);
const channel = await admin(`{ activeChannel { id } }`);
const role = await admin(`mutation($input: CreateRoleInput!) { createRole(input: $input) { id } }`, {
    input: { code: `enquiry-reader-${run}`, description: 'E2E: reads enquiries', permissions: ['ReadEnquiry'], channelIds: [channel.activeChannel.id] },
});
const reader = await admin(`mutation($input: CreateAdministratorInput!) { createAdministrator(input: $input) { id } }`, {
    input: { firstName: 'Enquiry', lastName: 'Reader', emailAddress: `reader-${run}@example.com`, password: `Reader-${run}-pw`, roleIds: [role.createRole?.id] },
});
const readerApi = client(`${BASE}/admin-api`);
await readerApi(`mutation($u: String!, $p: String!) { login(username: $u, password: $p) { ... on CurrentUser { id } } }`, { u: `reader-${run}@example.com`, p: `Reader-${run}-pw` });
const readerList = await readerApi(`{ enquiries(options: { take: 1 }) { totalItems } }`);
expect('a role with ReadEnquiry can list enquiries', readerList.enquiries?.totalItems > 0, readerList.error);
const readerUpdate = await readerApi(`mutation($id: ID!) { updateEnquiry(input: { id: $id, status: closed }) { id } }`, { id: enquiry.id });
expect('but without UpdateEnquiry it cannot change them', readerUpdate.code === 'FORBIDDEN', readerUpdate.error);
await admin(`mutation($id: ID!) { deleteAdministrator(id: $id) { result } }`, { id: reader.createAdministrator?.id });
await admin(`mutation($id: ID!) { deleteRole(id: $id) { result } }`, { id: role.createRole?.id });

// ── 7 · Email to the shop (written by the worker in dev mode) ──────────────────────────────────────────
const emailFor = code => {
    try {
        const file = readdirSync(EMAIL_DIR).find(f => f.toLowerCase().includes(code.toLowerCase()));
        return file && JSON.parse(readFileSync(path.join(EMAIL_DIR, file), 'utf8'));
    } catch {
        return undefined;
    }
};
let email;
for (let i = 0; i < 30 && !email; i++) {
    email = emailFor(semi.code);
    if (!email) await sleep(1000);
}
expect(
    `an email about ${semi.code} appears in static/email/test-emails`,
    email && email.recipient === NOTIFY && email.replyTo === contact.email,
    email ? `to ${email.recipient}, reply-to ${email.replyTo}: “${email.subject}”` : 'none after 30 s (is the worker running?)',
);
expect('the email lists the gifts and the indicative value', email?.body.includes(boxA.sku) && email.body.includes('Indicative value'));
expect('no email for the honeypot enquiry', !emailFor(bot.code));

// ── 8 · Rate limit: the default 5 accepted enquiries per address per hour (the honeypot counts) ─────────
let limited;
for (let i = 0; i < 6 && !limited; i++) {
    const r = await submit({ type: 'fully-customised', contact, details: { notes: `Rate limit check ${i + 1}` } });
    if (r.errorCode === 'ENQUIRY_RATE_LIMIT_ERROR') limited = { after: i, message: r.message };
}
expect('the 6th enquiry from one address within the hour is refused', limited?.after === 2, limited ? `after ${limited.after} more: ${limited.message}` : 'never refused');

// ── 9 · Storefront content on the Shop API (the server's channel cache refreshes within 30 s) ──────────
let customFields;
while (Date.now() - contentStarted < 45_000) {
    const d = await shop(`{ activeChannel { customFields { heroEyebrow heroTitle heroText featuredCollectionSlug featuredTitle featuredIntro
        whatsappNumber contactEmail businessHours showPreviewNotice } } }`);
    customFields = d.activeChannel?.customFields;
    if (customFields?.heroTitle === moireContent.heroTitle && customFields.featuredIntro === moireContent.featuredIntro) break;
    await sleep(2000);
}
const expected = { ...moireContent, contactEmail: null, businessHours: null };
expect(
    'activeChannel.customFields shows the storefront content',
    Object.entries(expected).every(([k, v]) => customFields?.[k] === v),
    customFields ? `${customFields.heroTitle} · featured ${customFields.featuredCollectionSlug} · WhatsApp ${customFields.whatsappNumber}` : 'missing',
);

console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
