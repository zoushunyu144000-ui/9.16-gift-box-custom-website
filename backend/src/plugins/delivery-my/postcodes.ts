import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { DeliveryZone } from './types';

/** State names exactly as data.gov.my's postcode table writes them (and as LiveRateRequest.toState carries them). */
export const MALAYSIAN_STATES = [
    'Johor',
    'Kedah',
    'Kelantan',
    'Melaka',
    'Negeri Sembilan',
    'Pahang',
    'Perak',
    'Perlis',
    'Pulau Pinang',
    'Sabah',
    'Sarawak',
    'Selangor',
    'Terengganu',
    'W.P. Kuala Lumpur',
    'W.P. Labuan',
    'W.P. Putrajaya',
] as const;

const PENINSULAR = new Set<string>([
    'Johor',
    'Kedah',
    'Kelantan',
    'Melaka',
    'Negeri Sembilan',
    'Pahang',
    'Perak',
    'Perlis',
    'Pulau Pinang',
    'Terengganu',
]);

export interface PostcodePlace {
    state: string;
    city: string;
}

let table: Map<string, PostcodePlace> | undefined;

/**
 * postcode → state and city, from data/postcodes.json (data.gov.my, CC BY 4.0), read once.
 * Exact lookup on purpose: states don't follow tidy ranges (Pahang has 39xxx, 49xxx and 69xxx; Kedah and Perak share 34xxx).
 */
export function postcodeTable(): Map<string, PostcodePlace> {
    if (table) return table;
    const candidates = [
        path.join(__dirname, 'data', 'postcodes.json'),
        // tsc copies no JSON into dist/, so a compiled server reads the table from src/.
        path.resolve(__dirname, '../../../src/plugins/delivery-my/data/postcodes.json'),
    ];
    const file = candidates.find(f => existsSync(f));
    if (!file) throw new Error(`delivery-my: the postcode table is missing (looked for ${candidates.join(' and ')}).`);
    const data = JSON.parse(readFileSync(file, 'utf8')) as { states: Record<string, Record<string, string[]>> };
    const map = new Map<string, PostcodePlace>();
    for (const [state, cities] of Object.entries(data.states)) {
        for (const [city, postcodes] of Object.entries(cities)) {
            // A few postcodes cover two towns (40160: Shah Alam and Sungai Buloh); the first listed is kept.
            for (const postcode of postcodes) if (!map.has(postcode)) map.set(postcode, { state, city });
        }
    }
    table = map;
    return map;
}

/** "50450", " 50450 " → "50450". Four digits get their leading zero back (spreadsheets drop it: 01000 Kangar → 1000). */
export function normalisePostcode(value: string | null | undefined): string | undefined {
    const digits = (value ?? '').replace(/[\s-]/g, '');
    if (/^\d{5}$/.test(digits)) return digits;
    if (/^\d{4}$/.test(digits)) return `0${digits}`;
    return undefined;
}

export function lookupPostcode(value: string | null | undefined): PostcodePlace | undefined {
    const postcode = normalisePostcode(value);
    return postcode ? postcodeTable().get(postcode) : undefined;
}

/** Spellings customers use for each state, after lower-casing and dropping punctuation and "W.P." / "Wilayah Persekutuan". */
const STATE_ALIASES: Array<[string, (typeof MALAYSIAN_STATES)[number]]> = [
    ['kuala lumpur', 'W.P. Kuala Lumpur'],
    ['kl', 'W.P. Kuala Lumpur'],
    ['putrajaya', 'W.P. Putrajaya'],
    ['labuan', 'W.P. Labuan'],
    ['selangor', 'Selangor'],
    ['johor', 'Johor'],
    ['johore', 'Johor'],
    ['kedah', 'Kedah'],
    ['kelantan', 'Kelantan'],
    ['melaka', 'Melaka'],
    ['malacca', 'Melaka'],
    ['negeri sembilan', 'Negeri Sembilan'],
    ['n sembilan', 'Negeri Sembilan'],
    ['n9', 'Negeri Sembilan'],
    ['ns', 'Negeri Sembilan'],
    ['n s', 'Negeri Sembilan'],
    ['pahang', 'Pahang'],
    ['perak', 'Perak'],
    ['perlis', 'Perlis'],
    ['pulau pinang', 'Pulau Pinang'],
    ['penang', 'Pulau Pinang'],
    ['pinang', 'Pulau Pinang'],
    ['sabah', 'Sabah'],
    ['sarawak', 'Sarawak'],
    ['terengganu', 'Terengganu'],
    ['trengganu', 'Terengganu'],
];

/** The state a customer typed or picked ("Wilayah Persekutuan Kuala Lumpur", "Penang", "Selangor Darul Ehsan"…). */
export function stateFromProvince(province: string | null | undefined): string | undefined {
    const name = (province ?? '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
        .replace(/^(wilayah persekutuan|federal territory of|federal territory|w p|wp|ft)\s+/, '');
    if (!name) return undefined;
    return STATE_ALIASES.find(([alias]) => name === alias || name.startsWith(`${alias} `))?.[1];
}

export function zoneForState(state: string | undefined, includePutrajaya: boolean): DeliveryZone {
    if (state === 'W.P. Kuala Lumpur' || state === 'Selangor') return 'klang-valley';
    if (state === 'W.P. Putrajaya') return includePutrajaya ? 'klang-valley' : 'peninsular';
    if (state === 'Sabah' || state === 'W.P. Labuan') return 'sabah-labuan';
    if (state === 'Sarawak') return 'sarawak';
    return state && PENINSULAR.has(state) ? 'peninsular' : 'unknown';
}

export interface AddressLike {
    postalCode?: string | null;
    province?: string | null;
    city?: string | null;
    countryCode?: string | null;
}

export interface ResolvedPlace {
    zone: DeliveryZone;
    /** Normalised postcode, when it looks like one. */
    postcode?: string;
    state?: string;
    city?: string;
    /** The postcode is in the official table; otherwise the zone comes from the province the customer gave. */
    postcodeKnown: boolean;
}

/** The delivery zone for an address: by postcode, else by the province the customer gave, else `unknown`. */
export function resolvePlace(address: AddressLike | null | undefined, includePutrajaya: boolean): ResolvedPlace {
    const countryCode = address?.countryCode?.trim().toUpperCase();
    if (countryCode && countryCode !== 'MY') return { zone: 'unknown', postcodeKnown: false };
    const postcode = normalisePostcode(address?.postalCode);
    const place = postcode ? postcodeTable().get(postcode) : undefined;
    if (place) {
        return { zone: zoneForState(place.state, includePutrajaya), postcode, state: place.state, city: place.city, postcodeKnown: true };
    }
    const state = stateFromProvince(address?.province);
    return {
        zone: zoneForState(state, includePutrajaya),
        postcode,
        state,
        city: address?.city?.trim() || undefined,
        postcodeKnown: false,
    };
}
