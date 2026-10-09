import { CheckoutItem, GatewayError } from './types';

/**
 * A Malaysian phone number as the gateways want it, or undefined when it isn't one (the phone is optional
 * for both, so an unrecognised number is left out rather than refused). Accepts "012-345 6789",
 * "+60 12-345 6789", "60123456789"; `national` drops the leading 0 ("123456789").
 */
export function malaysianPhone(raw?: string | null): { e164: string; national: string } | undefined {
    if (!raw) return undefined;
    const compact = raw.replace(/[\s\-().]/g, '');
    const match = /^(?:\+60|60|0)(\d{8,10})$/.exec(compact);
    if (!match || match[1].startsWith('0')) return undefined;
    return { e164: `+60${match[1]}`, national: match[1] };
}

export function truncate(text: string, max: number): string {
    const clean = text.replace(/\s+/g, ' ').trim();
    return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

/** The items, when they are well-formed and add up to exactly `amount`; otherwise undefined. */
export function itemsAddingUpTo(items: CheckoutItem[] | undefined, amount: number): CheckoutItem[] | undefined {
    if (!items?.length) return undefined;
    const valid = items.every(
        item => item.name.trim() && Number.isInteger(item.unitPrice) && item.unitPrice >= 0 && Number.isInteger(item.quantity) && item.quantity >= 1,
    );
    if (!valid) return undefined;
    const total = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    return total === amount ? items : undefined;
}

export function assertAmount(gateway: string, amount: number) {
    if (!Number.isInteger(amount) || amount <= 0) {
        throw new GatewayError(`${gateway} needs a positive amount in sen, got ${amount}`, { retryable: false });
    }
}

export function formatMoney(amount: number, currencyCode = 'MYR'): string {
    const value = (amount / 100).toFixed(2);
    return currencyCode === 'MYR' ? `RM ${value}` : `${currencyCode} ${value}`;
}

/** Integer sen from a JSON or form value, or undefined. */
export function toSen(value: unknown): number | undefined {
    const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
    return typeof n === 'number' && Number.isInteger(n) ? n : undefined;
}
