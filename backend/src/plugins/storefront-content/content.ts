/**
 * The shop texts and contact details the storefront shows, stored on the Channel (so each shop channel has
 * its own) and read by the storefront with `activeChannel { customFields { … } }`.
 * Kept free of Vendure imports so the rules can be unit-tested and reused by the setup function.
 */
export interface StorefrontContent {
    heroEyebrow: string | null;
    heroTitle: string | null;
    heroText: string | null;
    /** Slug of the collection featured on the homepage (e.g. the festival in season); empty = none. */
    featuredCollectionSlug: string | null;
    featuredTitle: string | null;
    featuredIntro: string | null;
    /** Digits with the country code, no "+", e.g. 60123456789. */
    whatsappNumber: string | null;
    contactEmail: string | null;
    businessHours: string | null;
    showPreviewNotice: boolean;
}

export type StorefrontTextField = Exclude<keyof StorefrontContent, 'showPreviewNotice'>;

/** Longest text each field takes, in characters: the room the storefront's layout gives it. */
export const MAX_LENGTH: Record<StorefrontTextField, number> = {
    heroEyebrow: 60,
    heroTitle: 80,
    heroText: 300,
    featuredCollectionSlug: 100,
    featuredTitle: 80,
    featuredIntro: 300,
    whatsappNumber: 15,
    contactEmail: 120,
    businessHours: 80,
};

/** The fields of API contract §5, in the order the dashboard shows them. */
export const STOREFRONT_FIELDS: ReadonlyArray<keyof StorefrontContent> = [
    'heroEyebrow',
    'heroTitle',
    'heroText',
    'featuredCollectionSlug',
    'featuredTitle',
    'featuredIntro',
    'whatsappNumber',
    'contactEmail',
    'businessHours',
    'showPreviewNotice',
];

const isEmpty = (value: string | null | undefined): value is null | undefined | '' => value == null || value.trim() === '';

export function checkLength(field: StorefrontTextField, value: string | null | undefined): string | undefined {
    if (!isEmpty(value) && value.trim().length > MAX_LENGTH[field]) {
        return `Please keep this to ${MAX_LENGTH[field]} characters (it has ${value.trim().length}).`;
    }
}

/** WhatsApp links (wa.me) need the full international number as digits only. */
export function checkWhatsappNumber(value: string | null | undefined): string | undefined {
    if (isEmpty(value)) return;
    const number = value.trim();
    if (!/^\d+$/.test(number)) return 'Use digits only, starting with the country code, e.g. 60123456789 (no +, spaces or dashes).';
    if (number.startsWith('0')) return 'Start with the country code instead of 0, e.g. 60123456789 for 012-345 6789.';
    if (number.length < 8 || number.length > 15) return 'This doesn’t look like a full phone number with its country code, e.g. 60123456789.';
}

// The HTML form rule for email addresses, with a dot required in the domain.
const EMAIL_PATTERN = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

export function checkEmail(value: string | null | undefined): string | undefined {
    if (isEmpty(value)) return;
    if (!EMAIL_PATTERN.test(value.trim())) return 'Please enter a valid email address, e.g. hello@example.com.';
}

export function checkSlug(value: string | null | undefined): string | undefined {
    if (isEmpty(value)) return;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.trim())) {
        return 'Use the collection’s slug: lower-case letters, numbers and dashes, e.g. chinese-new-year.';
    }
}

/** The first problem with one field's value, if any (shared by the dashboard checks and the setup function). */
export function checkField(field: keyof StorefrontContent, value: unknown): string | undefined {
    if (field === 'showPreviewNotice') return typeof value === 'boolean' ? undefined : 'Choose on or off.';
    if (value != null && typeof value !== 'string') return 'Please enter text.';
    const text = value as string | null | undefined;
    const formatProblem =
        field === 'whatsappNumber' ? checkWhatsappNumber(text) : field === 'contactEmail' ? checkEmail(text) : field === 'featuredCollectionSlug' ? checkSlug(text) : undefined;
    return formatProblem ?? checkLength(field, text);
}

/**
 * Tidies content given in code (store setup, scripts): trims text, turns empty text into null and strips the
 * "+", spaces and dashes people often write in phone numbers. Unknown keys are reported, not dropped, so a
 * misspelt field can't silently go missing.
 */
export function normaliseStorefrontContent(input: Record<string, unknown>): { content: Partial<StorefrontContent>; problems: string[] } {
    const content: Record<string, unknown> = {};
    const problems: string[] = [];
    for (const [key, raw] of Object.entries(input)) {
        if (!(STOREFRONT_FIELDS as readonly string[]).includes(key)) {
            problems.push(`${key}: not a storefront field (expected one of ${STOREFRONT_FIELDS.join(', ')}).`);
            continue;
        }
        const field = key as keyof StorefrontContent;
        let value = typeof raw === 'string' ? raw.trim() : raw;
        if (value === '') value = null;
        if (field === 'whatsappNumber' && typeof value === 'string') value = value.replace(/[\s()+.-]/g, '');
        const problem = checkField(field, value);
        if (problem) problems.push(`${field}: ${problem}`);
        else content[field] = value;
    }
    return { content: content as Partial<StorefrontContent>, problems };
}
