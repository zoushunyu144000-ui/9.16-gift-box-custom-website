import { DELIVERY_ZONES, DeliveryZone, LiveRate } from './types';

/** Ringgit → sen, the unit Vendure stores money in. */
export function toSen(ringgit: number): number {
    return Math.round(ringgit * 100);
}

// ── Same-day: price by road distance ─────────────────────────────────────────

export interface PriceBand {
    /** This price applies up to and including this road distance. */
    upToKm: number;
    /** Ringgit. */
    price: number;
}

/** Placeholder prices until the client confirms theirs. */
export const PLACEHOLDER_PRICE_BANDS: PriceBand[] = [
    { upToKm: 5, price: 15 },
    { upToKm: 10, price: 20 },
    { upToKm: 20, price: 28 },
    { upToKm: 30, price: 35 },
    { upToKm: 45, price: 45 },
];

/** The distance price table as staff write it: `[{"upToKm":5,"price":15}, …]`, nearest first. */
export function parsePriceBands(json: string | null | undefined): PriceBand[] {
    const example = 'e.g. [{"upToKm":5,"price":15},{"upToKm":10,"price":20}]';
    let raw: unknown;
    try {
        raw = JSON.parse(json ?? '');
    } catch {
        throw new Error(`The price-by-distance table isn't valid JSON; write it like ${example}.`);
    }
    if (!Array.isArray(raw) || raw.length === 0) throw new Error(`The price-by-distance table needs at least one band, ${example}.`);
    const bands = raw.map((band: { upToKm?: unknown; price?: unknown } | null, i) => {
        const upToKm = Number(band?.upToKm);
        const price = Number(band?.price);
        if (!(upToKm > 0) || !Number.isFinite(upToKm) || !(price >= 0) || !Number.isFinite(price)) {
            throw new Error(`Band ${i + 1} of the price-by-distance table needs "upToKm" above 0 and a "price" of 0 or more.`);
        }
        return { upToKm, price };
    });
    return bands.sort((a, b) => a.upToKm - b.upToKm);
}

/** The first band that reaches the distance; none beyond the last band. */
export function bandFor(distanceKm: number, bands: PriceBand[]): PriceBand | undefined {
    return bands.find(band => distanceKm <= band.upToKm);
}

/** "45", "45.50", "RM 45" → ringgit; empty → undefined. */
export function parseRinggit(value: string | null | undefined): number | undefined {
    const cleaned = (value ?? '').trim().replace(/^RM\s*/i, '').replace(/,/g, '');
    if (!cleaned) return undefined;
    const ringgit = Number(cleaned);
    if (!Number.isFinite(ringgit) || ringgit < 0) throw new Error(`"${value}" isn't a price in ringgit; write e.g. 45 or 45.50.`);
    return ringgit;
}

// ── Couriers: chargeable weight ──────────────────────────────────────────────

export const DEFAULT_WEIGHT_GRAMS = 1000;
/** Most Malaysian couriers: volumetric kg = L × W × H (cm) ÷ 5000. */
export const DEFAULT_VOLUMETRIC_DIVISOR = 5000;

export interface ParcelItem {
    quantity: number;
    /** Packed weight; missing means the 1000 g default, 0 means it adds nothing (e.g. a personalised name). */
    weightGrams?: number | null;
    lengthCm?: number | null;
    widthCm?: number | null;
    heightCm?: number | null;
}

/** Σ max(actual kg, L×W×H ÷ divisor) × quantity, to the gram. Items without all three sizes count by weight only. */
export function chargeableWeightKg(items: ParcelItem[], volumetricDivisor = DEFAULT_VOLUMETRIC_DIVISOR): number {
    const divisor = volumetricDivisor > 0 ? volumetricDivisor : DEFAULT_VOLUMETRIC_DIVISOR;
    let grams = 0;
    for (const item of items) {
        const actualKg = Math.max(0, item.weightGrams ?? DEFAULT_WEIGHT_GRAMS) / 1000;
        const { lengthCm: l, widthCm: w, heightCm: h } = item;
        const volumetricKg = l && w && h && l > 0 && w > 0 && h > 0 ? (l * w * h) / divisor : 0;
        grams += Math.round(Math.max(actualKg, volumetricKg) * 1000) * Math.max(0, item.quantity);
    }
    return grams / 1000;
}

/** Couriers charge per started kg: 0.2 → 1, 1.0 → 1, 1.01 → 2. Never below 1 kg. */
export function weightBracketKg(weightKg: number): number {
    return Math.max(1, Math.ceil(weightKg - 1e-9));
}

// ── Couriers: zone × weight table (used without live rates) ──────────────────

export interface ZoneRate {
    /** Ringgit for the first kg. */
    firstKg: number;
    /** Ringgit for each further kg (started). */
    eachExtraKg: number;
}

export type CourierTable = Partial<Record<DeliveryZone, ZoneRate>>;

/** Placeholder rates until the client confirms theirs. */
export const PLACEHOLDER_COURIER_TABLE: CourierTable = {
    peninsular: { firstKg: 10, eachExtraKg: 3 },
    'sabah-labuan': { firstKg: 18, eachExtraKg: 6 },
    sarawak: { firstKg: 16, eachExtraKg: 5 },
};

/** The courier table as staff write it: `{"peninsular":{"firstKg":10,"eachExtraKg":3}, …}`. */
export function parseCourierTable(json: string | null | undefined): CourierTable {
    const example = 'e.g. {"peninsular":{"firstKg":10,"eachExtraKg":3},"sarawak":{"firstKg":16,"eachExtraKg":5}}';
    let raw: unknown;
    try {
        raw = JSON.parse(json ?? '');
    } catch {
        throw new Error(`The courier rates table isn't valid JSON; write it like ${example}.`);
    }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`The courier rates table should be one object per zone, ${example}.`);
    const table: CourierTable = {};
    for (const [zone, value] of Object.entries(raw as Record<string, { firstKg?: unknown; eachExtraKg?: unknown } | null>)) {
        if (!(DELIVERY_ZONES as readonly string[]).includes(zone)) {
            throw new Error(`The courier rates table has an unknown zone "${zone}"; zones are ${DELIVERY_ZONES.join(', ')}.`);
        }
        const firstKg = Number(value?.firstKg);
        const eachExtraKg = Number(value?.eachExtraKg);
        if (!(firstKg >= 0) || !Number.isFinite(firstKg) || !(eachExtraKg >= 0) || !Number.isFinite(eachExtraKg)) {
            throw new Error(`The courier rate for "${zone}" needs "firstKg" and "eachExtraKg" in ringgit, 0 or more.`);
        }
        table[zone as DeliveryZone] = { firstKg, eachExtraKg };
    }
    return table;
}

/** First kg + each further started kg. */
export function tablePriceSen(rate: ZoneRate, weightKg: number): number {
    return toSen(rate.firstKg) + toSen(rate.eachExtraKg) * (weightBracketKg(weightKg) - 1);
}

// ── Couriers: live rates ─────────────────────────────────────────────────────

/**
 * The cheapest rate from an allowed courier. `allowedCouriers` entries match a courier or service name
 * containing them ("J&T" matches "J&T Express"), or a service id exactly; none listed allows all.
 */
export function cheapestAllowedRate(rates: LiveRate[], allowedCouriers: readonly string[] = []): LiveRate | undefined {
    const allowed = allowedCouriers.map(c => c.trim().toLowerCase()).filter(Boolean);
    const isAllowed = (rate: LiveRate) =>
        allowed.length === 0 ||
        allowed.some(a => `${rate.courier} ${rate.service}`.toLowerCase().includes(a) || rate.serviceId.toLowerCase() === a);
    let best: LiveRate | undefined;
    for (const rate of rates) {
        if (!(rate.priceSen > 0) || !Number.isFinite(rate.priceSen) || !isAllowed(rate)) continue;
        if (!best || rate.priceSen < best.priceSen) best = rate;
    }
    return best;
}

/** Courier price + markup %, rounded up to the next whole ringgit (in sen). */
export function customerPriceSen(courierPriceSen: number, markupPercent = 0): number {
    // Round to the sen first so floating point (1000 × 1.1 = 1100.0000000000002) can't push it up a ringgit.
    const withMarkup = Math.round((courierPriceSen * (100 + Math.max(0, markupPercent))) / 100);
    return Math.ceil(withMarkup / 100) * 100;
}
