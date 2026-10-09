import { LabelSize, round2, SubmitItem, SubmitParty, SubmitShipment } from './clients/easyparcel';
import { easyParcelPhone } from './phone';
import { resolveSubdivision } from './subdivisions';

export interface ParcelLine {
    name: string;
    quantity: number;
    /** Price of one unit including tax, in sen; declared as the item's value. */
    unitPriceSen: number;
    /** From delivery-my's ProductVariant custom fields when present (weightGrams 0 = weightless, e.g. a name card). */
    weightGrams?: number | null;
    lengthCm?: number | null;
    widthCm?: number | null;
    heightCm?: number | null;
}

export interface ParcelSize {
    weightKg: number;
    lengthCm: number;
    widthCm: number;
    heightCm: number;
}

export interface ParcelItem {
    name: string;
    quantity: number;
    unitPriceSen: number;
    weightKg: number;
    lengthCm: number;
    widthCm: number;
    heightCm: number;
}

export interface Parcel extends ParcelSize {
    valueSen: number;
    items: ParcelItem[];
}

const positive = (value: number | null | undefined): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;

/**
 * One box for the lines of a fulfillment. Weights and sizes come from the variants when every line has
 * them (stacked: longest length and width, heights added up); otherwise the shop's default box. What staff
 * enter when booking (the box they actually packed) always wins.
 */
export function buildParcel(lines: ParcelLine[], defaults: ParcelSize, override: Partial<ParcelSize> = {}): Parcel {
    const quantity = lines.reduce((sum, l) => sum + l.quantity, 0) || 1;
    const allWeighed = lines.length > 0 && lines.every(l => typeof l.weightGrams === 'number' && l.weightGrams >= 0);
    const weighedKg = lines.reduce((sum, l) => sum + (l.weightGrams ?? 0) * l.quantity, 0) / 1000;
    const allMeasured = lines.length > 0 && lines.every(l => positive(l.lengthCm) && positive(l.widthCm) && positive(l.heightCm));

    let size: ParcelSize = {
        weightKg: allWeighed ? weighedKg : Math.max(weighedKg, defaults.weightKg),
        lengthCm: allMeasured ? Math.max(...lines.map(l => l.lengthCm!)) : defaults.lengthCm,
        widthCm: allMeasured ? Math.max(...lines.map(l => l.widthCm!)) : defaults.widthCm,
        heightCm: allMeasured ? lines.reduce((sum, l) => sum + l.heightCm! * l.quantity, 0) : defaults.heightCm,
    };
    size = {
        weightKg: round2(Math.max(positive(override.weightKg) ? override.weightKg : size.weightKg, 0.1)),
        lengthCm: round2(positive(override.lengthCm) ? override.lengthCm : size.lengthCm),
        widthCm: round2(positive(override.widthCm) ? override.widthCm : size.widthCm),
        heightCm: round2(positive(override.heightCm) ? override.heightCm : size.heightCm),
    };
    const items = lines.map(l => ({
        name: l.name,
        quantity: l.quantity,
        unitPriceSen: l.unitPriceSen,
        weightKg: round2(Math.max(typeof l.weightGrams === 'number' && allWeighed ? l.weightGrams / 1000 : size.weightKg / quantity, 0.01)),
        lengthCm: positive(l.lengthCm) ? l.lengthCm : size.lengthCm,
        widthCm: positive(l.widthCm) ? l.widthCm : size.widthCm,
        heightCm: positive(l.heightCm) ? l.heightCm : size.heightCm,
    }));
    return { ...size, valueSen: lines.reduce((sum, l) => sum + l.unitPriceSen * l.quantity, 0), items };
}

export interface PostalAddress {
    fullName?: string | null;
    company?: string | null;
    streetLine1?: string | null;
    streetLine2?: string | null;
    city?: string | null;
    province?: string | null;
    postalCode?: string | null;
    countryCode?: string | null;
    phoneNumber?: string | null;
}

const COUNTRY_NAMES: Record<string, string> = { MY: 'Malaysia', SG: 'Singapore', BN: 'Brunei' };

/** One line for a courier or the geocoder: "1 Jalan Ampang, 50450 Kuala Lumpur, Kuala Lumpur, Malaysia". */
export function formatAddress(address: PostalAddress): string {
    const country = (address.countryCode ?? 'MY').toUpperCase();
    const cityLine = [address.postalCode, address.city].filter(Boolean).join(' ');
    const parts = [address.streetLine1, address.streetLine2, cityLine, address.province, COUNTRY_NAMES[country] ?? country];
    return parts
        .map(p => (p ?? '').trim())
        .filter(Boolean)
        .filter((p, i, all) => all.indexOf(p) === i)
        .join(', ');
}

export class ParcelDataError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ParcelDataError';
    }
}

/** An EasyParcel sender or receiver; complains in words staff can act on when something is missing. */
export function easyParcelParty(role: 'sender' | 'receiver', address: PostalAddress & { email?: string | null }): SubmitParty {
    const who = role === 'sender' ? 'The shop origin' : 'The shipping address';
    const phone = easyParcelPhone(address.phoneNumber);
    if (!phone) throw new ParcelDataError(`${who} needs a valid phone number for the courier.`);
    if (!address.streetLine1?.trim()) throw new ParcelDataError(`${who} has no street address.`);
    if (!address.postalCode?.trim() || !address.city?.trim()) throw new ParcelDataError(`${who} needs a postcode and city.`);
    const country = (address.countryCode ?? 'MY').toUpperCase();
    const subdivision = country === 'MY' ? resolveSubdivision(address.province, address.postalCode) : undefined;
    if (country === 'MY' && !subdivision) throw new ParcelDataError(`${who}: cannot tell the state from "${address.province ?? ''}" / ${address.postalCode}.`);
    return {
        name: (address.fullName ?? '').trim() || (address.company ?? '').trim() || 'Recipient',
        ...(address.company?.trim() ? { company: address.company.trim() } : {}),
        phone_number_country_code: phone.countryCode,
        phone_number: phone.number,
        ...(address.email ? { email: address.email } : {}),
        address_1: address.streetLine1.trim(),
        ...(address.streetLine2?.trim() ? { address_2: address.streetLine2.trim() } : {}),
        postcode: address.postalCode.trim(),
        city: address.city.trim(),
        ...(subdivision ? { subdivision_code: subdivision } : {}),
        country_code: country,
    };
}

export interface SubmitShipmentInput {
    serviceId: string;
    collectionDate: string;
    reference: string;
    parcel: Parcel;
    sender: SubmitParty;
    receiver: SubmitParty;
    notifications?: { sms?: boolean; email?: boolean; whatsapp?: boolean };
    currency?: string;
}

/** The `shipment[]` entry for POST shipment/submit_orders. */
export function buildSubmitShipment(input: SubmitShipmentInput): SubmitShipment {
    const currency = input.currency ?? 'MYR';
    const item: SubmitItem[] = input.parcel.items.map(i => ({
        content: i.name.slice(0, 100),
        weight: i.weightKg,
        length: i.lengthCm,
        width: i.widthCm,
        height: i.heightCm,
        currency_code: currency,
        value: round2(i.unitPriceSen / 100),
        quantity: i.quantity,
    }));
    return {
        reference: input.reference,
        service_id: input.serviceId,
        collection_date: input.collectionDate,
        weight: input.parcel.weightKg,
        length: input.parcel.lengthCm,
        width: input.parcel.widthCm,
        height: input.parcel.heightCm,
        item,
        sender: input.sender,
        receiver: input.receiver,
        // The shop sends its own shipped/delivered emails; EasyParcel's paid notifications stay off unless asked for.
        feature: {
            sms_tracking: !!input.notifications?.sms,
            email_tracking: !!input.notifications?.email,
            whatsapp_tracking: !!input.notifications?.whatsapp,
        },
    };
}

/**
 * Collection date in Malaysia: today, or Monday when today is Sunday (couriers don't collect on Sundays).
 * Public holidays aren't known here; staff can pick another date when booking.
 */
export function defaultCollectionDate(now: Date = new Date()): string {
    const myt = new Date(now.getTime() + 8 * 3600_000);
    if (myt.getUTCDay() === 0) myt.setUTCDate(myt.getUTCDate() + 1);
    return myt.toISOString().slice(0, 10);
}

export const LABEL_SIZES: LabelSize[] = ['A6', 'A5', 'A4'];
