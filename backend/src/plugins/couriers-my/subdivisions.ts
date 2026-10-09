/**
 * Malaysian states and federal territories as ISO 3166-2 codes, which EasyParcel requires
 * (`subdivision_code`, e.g. MY-14 Kuala Lumpur, MY-10 Selangor, MY-07 Penang).
 */
export const MY_SUBDIVISIONS: Record<string, string> = {
    'MY-01': 'Johor',
    'MY-02': 'Kedah',
    'MY-03': 'Kelantan',
    'MY-04': 'Melaka',
    'MY-05': 'Negeri Sembilan',
    'MY-06': 'Pahang',
    'MY-07': 'Pulau Pinang',
    'MY-08': 'Perak',
    'MY-09': 'Perlis',
    'MY-10': 'Selangor',
    'MY-11': 'Terengganu',
    'MY-12': 'Sabah',
    'MY-13': 'Sarawak',
    'MY-14': 'Kuala Lumpur',
    'MY-15': 'Labuan',
    'MY-16': 'Putrajaya',
};

/** Spellings customers and address forms use, after lower-casing and removing punctuation. */
const STATE_NAMES: Record<string, string> = {
    johor: 'MY-01',
    johore: 'MY-01',
    'johor darul takzim': 'MY-01',
    'johor darul tazim': 'MY-01',
    kedah: 'MY-02',
    'kedah darul aman': 'MY-02',
    kelantan: 'MY-03',
    'kelantan darul naim': 'MY-03',
    melaka: 'MY-04',
    malacca: 'MY-04',
    'negeri sembilan': 'MY-05',
    'negri sembilan': 'MY-05',
    'n sembilan': 'MY-05',
    ns: 'MY-05',
    pahang: 'MY-06',
    'pahang darul makmur': 'MY-06',
    'pulau pinang': 'MY-07',
    'p pinang': 'MY-07',
    penang: 'MY-07',
    pinang: 'MY-07',
    perak: 'MY-08',
    'perak darul ridzuan': 'MY-08',
    perlis: 'MY-09',
    'perlis indera kayangan': 'MY-09',
    selangor: 'MY-10',
    'selangor darul ehsan': 'MY-10',
    terengganu: 'MY-11',
    trengganu: 'MY-11',
    'terengganu darul iman': 'MY-11',
    sabah: 'MY-12',
    sarawak: 'MY-13',
    'kuala lumpur': 'MY-14',
    kl: 'MY-14',
    labuan: 'MY-15',
    putrajaya: 'MY-16',
};

const FEDERAL_TERRITORY_PREFIX = /^(wilayah persekutuan|federal territory of|federal territory|w ?p)\s+/;

/** "Kuala Lumpur", "W.P. Kuala Lumpur", "Penang", "MY-07" or "7" → ISO code; undefined when unknown. */
export function subdivisionFromState(state: string | null | undefined): string | undefined {
    const raw = (state ?? '').trim();
    if (!raw) return undefined;
    const iso = raw.toUpperCase().match(/^MY-?(\d{1,2})$/);
    if (iso) return codeFromNumber(iso[1]);
    if (/^\d{1,2}$/.test(raw)) return codeFromNumber(raw);
    const name = raw
        .toLowerCase()
        .replace(/['’]/g, '')
        .replace(/[.,()]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(FEDERAL_TERRITORY_PREFIX, '');
    return STATE_NAMES[name];
}

function codeFromNumber(value: string): string | undefined {
    const code = `MY-${value.padStart(2, '0')}`;
    return MY_SUBDIVISIONS[code] ? code : undefined;
}

/**
 * Postcode ranges by state, for addresses whose state is missing or misspelt. Good enough to pick an
 * EasyParcel rate; delivery zones use the exact data.gov.my table in delivery-my.
 */
const POSTCODE_RANGES: Array<[from: number, to: number, code: string]> = [
    [1000, 2999, 'MY-09'], // Perlis
    [5000, 9999, 'MY-02'], // Kedah
    [10000, 14999, 'MY-07'], // Pulau Pinang
    [15000, 18999, 'MY-03'], // Kelantan
    [20000, 24999, 'MY-11'], // Terengganu
    [25000, 28999, 'MY-06'], // Pahang
    [30000, 36999, 'MY-08'], // Perak
    [39000, 39999, 'MY-06'], // Pahang (Cameron Highlands)
    [40000, 48999, 'MY-10'], // Selangor
    [49000, 49999, 'MY-06'], // Pahang (Bukit Fraser)
    [50000, 60999, 'MY-14'], // Kuala Lumpur
    [62000, 62999, 'MY-16'], // Putrajaya
    [63000, 64999, 'MY-10'], // Selangor (Cyberjaya, KLIA)
    [68000, 68999, 'MY-10'], // Selangor (Ampang, Batu Caves)
    [69000, 69999, 'MY-06'], // Pahang (Genting Highlands)
    [70000, 73999, 'MY-05'], // Negeri Sembilan
    [75000, 78999, 'MY-04'], // Melaka
    [79000, 86999, 'MY-01'], // Johor
    [87000, 87999, 'MY-15'], // Labuan
    [88000, 91999, 'MY-12'], // Sabah
    [93000, 98999, 'MY-13'], // Sarawak
];

export function subdivisionFromPostcode(postcode: string | null | undefined): string | undefined {
    const digits = (postcode ?? '').trim();
    if (!/^\d{5}$/.test(digits)) return undefined;
    const value = Number(digits);
    return POSTCODE_RANGES.find(([from, to]) => value >= from && value <= to)?.[2];
}

/** The state as written wins; the postcode fills in when the state is missing or unrecognised. */
export function resolveSubdivision(state: string | null | undefined, postcode: string | null | undefined): string | undefined {
    return subdivisionFromState(state) ?? subdivisionFromPostcode(postcode);
}
