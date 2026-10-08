/**
 * Rules for personalised names, kept identical to the storefront's (src/lib/catalog.ts in the Moire repo):
 * capital letters, numbers, spaces and line breaks, plus the punctuation a numbered list of names needs
 * ("1. JASON 2. EMILY").
 */
export const NAMES_PATTERN = /^[A-Z0-9 .,'&\-\n]*$/;

/** Characters allowed for `count` names: one name's limit, or room for a numbered list ("12. " and a separator per name). */
export function namesLimit(perName: number, count: number) {
    return count > 1 ? count * (perName + 5) : perName;
}

export interface PersonalisationOptions {
    /** SKU of the variant that carries the charge: one unit per name, its price is the fee per name. */
    namesSku: string;
    /** Characters per name for new products (each product can change it). */
    defaultMaxLength: number;
}
