/**
 * Checks an enquiry from the storefront before anything is looked up or saved. Free of Vendure imports so
 * the rules can be unit-tested; the messages are shown to customers as they are.
 */
import { humanise } from './format';

export type DetailValue = string | number | boolean | Array<string | number | boolean> | { [key: string]: DetailValue };
export type EnquiryDetails = Record<string, DetailValue>;

export interface EnquiryInput {
    type: string;
    contact: { name: string; company?: string | null; email: string; phone: string };
    items?: Array<{ productVariantId: string | number; quantity: number }> | null;
    details?: unknown;
}

export interface CleanEnquiry {
    type: string;
    contact: { name: string; company: string | null; email: string; phone: string };
    /** One entry per variant (repeated variants are added up). */
    items: Array<{ productVariantId: string | number; quantity: number }>;
    details: EnquiryDetails | null;
    /** The hidden `website` field was filled in: a bot, so the enquiry is dropped without saying so. */
    honeypot: boolean;
}

export type EnquiryCheck = { ok: true; enquiry: CleanEnquiry } | { ok: false; message: string };

export const LIMITS = {
    nameMin: 2,
    nameMax: 100,
    companyMax: 120,
    emailMax: 254,
    typeMax: 40,
    itemsMax: 50,
    quantityMin: 1,
    quantityMax: 9999,
    detailKeysMax: 40,
    detailTextMax: 2000,
    detailListMax: 50,
    detailsJsonMax: 20000,
    giftsMax: 100000,
};

/** Name of the hidden form field that only bots fill in. */
export const HONEYPOT_FIELD = 'website';

const CANT_READ = 'We couldn’t read your request. Please refresh the page and try again.';

// Control characters other than tab and line breaks never belong in a form field.
const stripControl = (value: string) => value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
const oneLine = (value: string) => stripControl(value).replace(/\s+/g, ' ').trim();

/**
 * Turns a Malaysian or international phone number into international format (+60123456789), or undefined
 * when it can't be one. Malaysian numbers may be written locally (012-345 6789, 03-1234 5678) or with 60 /
 * +60; other countries need their code (+65 9123 4567, or 0065…).
 */
export function normalisePhone(raw: string): string | undefined {
    const value = oneLine(raw);
    if (value.length > 30 || !/^\+?[\d\s().-]+$/.test(value)) return;
    let digits = value.replace(/\D/g, '');
    let international = value.startsWith('+');
    if (!international && digits.startsWith('00')) {
        international = true;
        digits = digits.slice(2);
    }
    let national: string;
    if (digits.startsWith('60')) {
        // Malaysia's country code (local numbers start with 0). Some people keep the 0 after it.
        national = digits.slice(2).replace(/^0/, '');
    } else if (international) {
        return digits.length >= 8 && digits.length <= 15 && !digits.startsWith('0') ? `+${digits}` : undefined;
    } else if (digits.startsWith('0')) {
        national = digits.slice(1);
    } else {
        return;
    }
    // Mobiles: 1X then 7–8 digits. Landlines: area code 3–9 (Sabah/Sarawak 8X) then 6–8 digits.
    return /^1\d{8,9}$/.test(national) || /^[3-9]\d{7,8}$/.test(national) ? `+60${national}` : undefined;
}

// The HTML form rule for email addresses, with a dot required in the domain: the address goes into the
// Reply-To of the shop's email and into mailto: links, so nothing outside it gets through.
const EMAIL_PATTERN = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

export function isEmail(value: string) {
    return value.length <= LIMITS.emailMax && EMAIL_PATTERN.test(value);
}

/** Today's date (YYYY-MM-DD) in Malaysia, where delivery dates are counted. */
export function todayInKualaLumpur(now = new Date()) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

// GraphQL builds input objects written inline in a query (and JSON scalars) without a prototype.
const isPlainObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && [Object.prototype, null].includes(Object.getPrototypeOf(value));

/** Checks one detail value; returns the cleaned value, undefined to leave it out, or an error message. */
function cleanDetailValue(key: string, value: unknown, depth: number): { value?: DetailValue; error?: string } {
    if (value == null) return {};
    if (typeof value === 'string') {
        const text = stripControl(value).trim();
        if (!text) return {};
        if (text.length > LIMITS.detailTextMax) {
            return { error: `Please keep the ${humanise(key)} under ${LIMITS.detailTextMax.toLocaleString('en')} characters.` };
        }
        return { value: text };
    }
    if (typeof value === 'number') return Number.isFinite(value) ? { value } : { error: CANT_READ };
    if (typeof value === 'boolean') return { value };
    if (Array.isArray(value)) {
        if (value.length > LIMITS.detailListMax) return { error: `Please list up to ${LIMITS.detailListMax} ${humanise(key)}.` };
        const list: Array<string | number | boolean> = [];
        for (const entry of value) {
            if (Array.isArray(entry) || isPlainObject(entry)) return { error: CANT_READ };
            const cleaned = cleanDetailValue(key, entry, depth + 1);
            if (cleaned.error) return cleaned;
            if (cleaned.value !== undefined) list.push(cleaned.value as string | number | boolean);
        }
        return list.length ? { value: list } : {};
    }
    // One level of grouping (e.g. customisation: { cardMessage, logoOnPackaging }) is plenty for a form.
    if (isPlainObject(value) && depth === 0) {
        const group = cleanDetails(value, depth + 1);
        if ('error' in group) return group;
        return Object.keys(group.details).length ? { value: group.details } : {};
    }
    return { error: CANT_READ };
}

function cleanDetails(input: Record<string, unknown>, depth: number): { details: EnquiryDetails } | { error: string } {
    const keys = Object.keys(input);
    if (keys.length > LIMITS.detailKeysMax) return { error: CANT_READ };
    const details: EnquiryDetails = {};
    for (const key of keys) {
        if (!/^[A-Za-z][A-Za-z0-9_]{0,49}$/.test(key)) return { error: CANT_READ };
        const cleaned = cleanDetailValue(key, input[key], depth);
        if (cleaned.error) return { error: cleaned.error };
        if (cleaned.value !== undefined) details[key] = cleaned.value;
    }
    return { details };
}

/** Rules for the details most forms send; anything else only gets the general checks above. */
function checkKnownDetails(details: EnquiryDetails, today: string): string | undefined {
    const { deliveryDate, quantity, multipleAddresses } = details;
    if (deliveryDate !== undefined) {
        const match = typeof deliveryDate === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(deliveryDate) : null;
        const date = match ? new Date(Date.UTC(+match[1], +match[2] - 1, +match[3])) : null;
        if (!match || !date || date.toISOString().slice(0, 10) !== deliveryDate) return 'Please choose a valid delivery date.';
        if (deliveryDate < today) return 'Please choose a delivery date that hasn’t passed.';
    }
    if (quantity !== undefined) {
        const count = typeof quantity === 'string' && /^\d+$/.test(quantity) ? Number(quantity) : quantity;
        if (typeof count !== 'number' || !Number.isInteger(count) || count < 1 || count > LIMITS.giftsMax) {
            return 'Please enter roughly how many gifts you need, as a number.';
        }
        details.quantity = count;
    }
    if (multipleAddresses !== undefined && typeof multipleAddresses !== 'boolean') return CANT_READ;
}

export interface CheckOptions {
    /** YYYY-MM-DD in the shop's time zone; delivery dates before it are refused. */
    today: string;
    /** When set, only these enquiry types are accepted. */
    types?: string[];
}

export function checkEnquiry(input: EnquiryInput, { today, types }: CheckOptions): EnquiryCheck {
    const fail = (message: string): EnquiryCheck => ({ ok: false, message });
    if (!input || !isPlainObject(input.contact)) return fail(CANT_READ);

    const type = typeof input.type === 'string' ? input.type.trim().toLowerCase() : '';
    if (!type || type.length > LIMITS.typeMax || !/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/.test(type) || (types?.length && !types.includes(type))) {
        return fail('This kind of request can’t be sent here. Please refresh the page and try again.');
    }

    const name = oneLine(String(input.contact.name ?? ''));
    if (name.length < LIMITS.nameMin) return fail('Please enter your name.');
    if (name.length > LIMITS.nameMax) return fail(`Please keep your name under ${LIMITS.nameMax} characters.`);
    const company = oneLine(String(input.contact.company ?? ''));
    if (company.length > LIMITS.companyMax) return fail(`Please keep the company name under ${LIMITS.companyMax} characters.`);
    const email = oneLine(String(input.contact.email ?? ''));
    if (!isEmail(email)) return fail('Please enter a valid email address.');
    const phone = normalisePhone(String(input.contact.phone ?? ''));
    if (!phone) return fail('Please enter a valid phone number, e.g. 012-345 6789, or with the country code, e.g. +65 9123 4567.');

    const items = new Map<string, { productVariantId: string | number; quantity: number }>();
    const itemsInput = input.items ?? [];
    if (!Array.isArray(itemsInput)) return fail(CANT_READ);
    if (itemsInput.length > LIMITS.itemsMax) return fail(`Please choose up to ${LIMITS.itemsMax} different gifts.`);
    const badQuantity = `Please enter a quantity between ${LIMITS.quantityMin} and ${LIMITS.quantityMax.toLocaleString('en')} for each gift.`;
    for (const item of itemsInput) {
        if (!isPlainObject(item) || item.productVariantId == null || String(item.productVariantId).trim() === '') return fail(CANT_READ);
        if (!Number.isInteger(item.quantity) || item.quantity < LIMITS.quantityMin || item.quantity > LIMITS.quantityMax) return fail(badQuantity);
        const key = String(item.productVariantId);
        const earlier = items.get(key);
        const quantity = (earlier?.quantity ?? 0) + item.quantity;
        if (quantity > LIMITS.quantityMax) return fail(badQuantity);
        items.set(key, { productVariantId: earlier?.productVariantId ?? item.productVariantId, quantity });
    }

    let details: EnquiryDetails | null = null;
    let honeypot = false;
    if (input.details != null) {
        if (!isPlainObject(input.details)) return fail(CANT_READ);
        const { [HONEYPOT_FIELD]: trap, ...rest } = input.details;
        honeypot = trap != null && trap !== false && String(trap).trim() !== '';
        const cleaned = cleanDetails(rest, 0);
        if ('error' in cleaned) return fail(cleaned.error);
        const problem = checkKnownDetails(cleaned.details, today);
        if (problem) return fail(problem);
        if (JSON.stringify(cleaned.details).length > LIMITS.detailsJsonMax) return fail('Your request is too long. Please shorten the notes and try again.');
        details = Object.keys(cleaned.details).length ? cleaned.details : null;
    }

    return { ok: true, enquiry: { type, contact: { name, company: company || null, email, phone }, items: [...items.values()], details, honeypot } };
}
