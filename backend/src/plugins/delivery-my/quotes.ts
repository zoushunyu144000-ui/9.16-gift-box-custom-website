import { DistanceOutcome } from './distance';
import { ResolvedPlace } from './postcodes';
import {
    bandFor,
    chargeableWeightKg,
    cheapestAllowedRate,
    CourierTable,
    customerPriceSen,
    DEFAULT_VOLUMETRIC_DIVISOR,
    ParcelItem,
    parseCourierTable,
    parsePriceBands,
    parseRinggit,
    PriceBand,
    tablePriceSen,
    toSen,
    weightBracketKg,
} from './pricing';
import { errorMessage } from './timeout';
import { LiveRate, LiveRateRequest } from './types';

/** What a calculator returns: the price in sen, and details the storefront and staff can see. */
export interface Quote {
    priceSen: number;
    metadata: Record<string, string | number | boolean | null>;
}

type Log = (message: string) => void;

/** "postcode city, state, Malaysia", spelling out "W.P." so Google reads it as a Federal Territory. */
export function destinationAddress(place: ResolvedPlace): string {
    const state = place.state?.replace(/^W\.P\.\s*/, 'Wilayah Persekutuan ');
    return [[place.postcode, place.city].filter(Boolean).join(' '), state, 'Malaysia'].filter(Boolean).join(', ');
}

export interface SameDayArgs {
    /** JSON price bands in ringgit. */
    priceBands: string;
    /** Ringgit; empty = not offered beyond the last band. */
    fallbackPrice?: string;
}

/**
 * Same-day price from the road distance. Beyond the last band: the fallback price, or not offered when there's
 * none. Distance unknown (no Google key, Google slow or down, postcode not in the official table): the fallback
 * price, or the last band's price when there's none, so checkout never blocks.
 */
export async function sameDayQuote(
    place: ResolvedPlace,
    args: SameDayArgs,
    distanceKm: (postcode: string, destination: string) => Promise<DistanceOutcome>,
    log: Log,
): Promise<Quote | undefined> {
    let bands: PriceBand[] = [];
    let fallback: number | undefined;
    try {
        bands = parsePriceBands(args.priceBands);
    } catch (err) {
        log(`same-day delivery: ${errorMessage(err)}`);
    }
    try {
        fallback = parseRinggit(args.fallbackPrice);
    } catch (err) {
        log(`same-day delivery fallback price: ${errorMessage(err)}`);
    }

    // Google is only asked about postcodes in the official table, so made-up postcodes can't run up the bill.
    const outcome: DistanceOutcome = !place.postcode
        ? { source: 'no-postcode' }
        : !place.postcodeKnown
          ? { source: 'not-in-table' }
          : await distanceKm(place.postcode, destinationAddress(place));
    const metadata = {
        zone: place.zone,
        distanceKm: outcome.km === undefined ? null : Math.round(outcome.km * 10) / 10,
        distanceSource: outcome.source,
    };

    if (outcome.km !== undefined) {
        const band = bandFor(outcome.km, bands);
        if (band) return { priceSen: toSen(band.price), metadata: { ...metadata, priceSource: 'band', bandUpToKm: band.upToKm } };
        return fallback === undefined ? undefined : { priceSen: toSen(fallback), metadata: { ...metadata, priceSource: 'fallback' } };
    }
    if (fallback !== undefined) return { priceSen: toSen(fallback), metadata: { ...metadata, priceSource: 'fallback' } };
    const lastBand = bands[bands.length - 1];
    return lastBand ? { priceSen: toSen(lastBand.price), metadata: { ...metadata, priceSource: 'last-band' } } : undefined;
}

export interface CourierArgs {
    /** JSON zone × weight table in ringgit, used without live rates. */
    rateTable: string;
    useLiveRates?: boolean;
    allowedCouriers?: string[];
    markupPercent?: number;
    volumetricDivisor?: number;
}

/** Package size is only sent for a single boxed item; for several items it's the weight that counts. */
function singleBoxSize(items: ParcelItem[]): Pick<LiveRateRequest, 'lengthCm' | 'widthCm' | 'heightCm'> {
    const boxes = items.filter(item => item.quantity > 0 && (item.weightGrams ?? 1) > 0);
    const [only] = boxes;
    if (boxes.length !== 1 || only.quantity !== 1 || !only.lengthCm || !only.widthCm || !only.heightCm) return {};
    return { lengthCm: only.lengthCm, widthCm: only.widthCm, heightCm: only.heightCm };
}

/**
 * Courier price: the cheapest allowed live rate for the chargeable weight's bracket, plus markup, rounded up to the
 * next RM1; without live rates, the zone × weight table. Not offered when the table has no row for the zone.
 */
export async function courierQuote(input: {
    place: ResolvedPlace;
    items: ParcelItem[];
    args: CourierArgs;
    fromPostcode: string;
    liveRates?: (request: LiveRateRequest) => Promise<LiveRate[] | undefined>;
    log: Log;
}): Promise<Quote | undefined> {
    const { place, args, log } = input;
    const weightKg = chargeableWeightKg(input.items, args.volumetricDivisor || DEFAULT_VOLUMETRIC_DIVISOR);
    const bracketKg = weightBracketKg(weightKg);
    const metadata = { zone: place.zone, chargeableWeightKg: weightKg, weightBracketKg: bracketKg };

    if (args.useLiveRates !== false && input.liveRates && place.postcode && place.state && input.fromPostcode) {
        const rates = await input.liveRates({
            fromPostcode: input.fromPostcode,
            toPostcode: place.postcode,
            toState: place.state,
            weightKg: bracketKg,
            ...singleBoxSize(input.items),
        });
        const best = rates && cheapestAllowedRate(rates, args.allowedCouriers ?? []);
        if (best) {
            return {
                priceSen: customerPriceSen(best.priceSen, args.markupPercent ?? 0),
                metadata: {
                    ...metadata,
                    priceSource: 'live',
                    courier: best.courier,
                    service: best.service,
                    serviceId: best.serviceId,
                    courierPriceSen: best.priceSen,
                },
            };
        }
    }

    let table: CourierTable = {};
    try {
        table = parseCourierTable(args.rateTable);
    } catch (err) {
        log(`courier delivery: ${errorMessage(err)}`);
    }
    const rate = table[place.zone];
    return rate ? { priceSen: tablePriceSen(rate, weightKg), metadata: { ...metadata, priceSource: 'table' } } : undefined;
}
