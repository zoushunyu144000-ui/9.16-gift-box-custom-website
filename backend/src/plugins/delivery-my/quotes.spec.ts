import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DistanceOutcome, RoadDistanceLookup } from './distance';
import { resolvePlace } from './postcodes';
import { PLACEHOLDER_COURIER_TABLE, PLACEHOLDER_PRICE_BANDS } from './pricing';
import { courierQuote, destinationAddress, sameDayQuote } from './quotes';
import { LiveRate, LiveRateRequest } from './types';

const noLog = () => undefined;
const kl = resolvePlace({ postalCode: '50450' }, false);
const sameDayArgs = { priceBands: JSON.stringify(PLACEHOLDER_PRICE_BANDS), fallbackPrice: '50' };
const at = (km: number) => async (): Promise<DistanceOutcome> => ({ km, source: 'google' });

describe('same-day price (my-distance-zones)', () => {
    it('asks for the road distance to "postcode city, state, Malaysia" and prices it by band', async () => {
        const asked: string[] = [];
        const quote = await sameDayQuote(
            kl,
            sameDayArgs,
            async (postcode, destination) => {
                asked.push(`${postcode} → ${destination}`);
                return { km: 7.34, source: 'google' };
            },
            noLog,
        );
        assert.deepEqual(asked, ['50450 → 50450 Kuala Lumpur, Wilayah Persekutuan Kuala Lumpur, Malaysia']);
        assert.equal(quote?.priceSen, 2000);
        assert.deepEqual(quote?.metadata, { zone: 'klang-valley', distanceKm: 7.3, distanceSource: 'google', priceSource: 'band', bandUpToKm: 10 });
    });

    it('beyond the last band: the fallback price, or not offered without one', async () => {
        assert.equal((await sameDayQuote(kl, sameDayArgs, at(60), noLog))?.priceSen, 5000);
        assert.equal(await sameDayQuote(kl, { ...sameDayArgs, fallbackPrice: '' }, at(60), noLog), undefined);
    });

    it('falls back when Google times out, so checkout never blocks', async () => {
        const lookup = new RoadDistanceLookup(
            { find: async () => undefined, save: async () => undefined },
            {
                origin: { latitude: 3.1478, longitude: 101.713 },
                apiKey: () => 'key',
                timeoutMs: 50,
                cacheDays: 30,
                // Google taking 10 seconds, unless the request is aborted first.
                fetchFn: ((_url: string, init: RequestInit) =>
                    new Promise((resolve, reject) => {
                        const slow = setTimeout(() => resolve(new Response('{"routes":[{"distanceMeters":1}]}')), 10_000);
                        init.signal?.addEventListener('abort', () => {
                            clearTimeout(slow);
                            reject(new Error('aborted'));
                        });
                    })) as typeof fetch,
            },
        );
        const started = Date.now();
        const quote = await sameDayQuote(kl, sameDayArgs, (p, d) => lookup.distanceKm(p, d), noLog);
        assert.ok(Date.now() - started < 1000);
        assert.equal(quote?.priceSen, 5000);
        assert.equal(quote?.metadata.priceSource, 'fallback');
        assert.equal(quote?.metadata.distanceSource, 'error');
    });

    it('with no fallback price, an unknown distance charges the last band rather than blocking checkout', async () => {
        const quote = await sameDayQuote(kl, { ...sameDayArgs, fallbackPrice: '' }, async () => ({ source: 'no-key' }), noLog);
        assert.equal(quote?.priceSen, 4500);
        assert.equal(quote?.metadata.priceSource, 'last-band');
    });

    it('does not ask Google about postcodes missing from the official table', async () => {
        const guessed = resolvePlace({ postalCode: '99999', province: 'Selangor' }, false);
        let asked = false;
        const quote = await sameDayQuote(
            guessed,
            sameDayArgs,
            async () => {
                asked = true;
                return { km: 1, source: 'google' };
            },
            noLog,
        );
        assert.equal(asked, false);
        assert.equal(quote?.priceSen, 5000);
        assert.equal(quote?.metadata.distanceSource, 'not-in-table');
    });

    it('logs a broken price table and still charges the fallback', async () => {
        const logged: string[] = [];
        const quote = await sameDayQuote(kl, { priceBands: '[{"upToKm":5,"price":15},]', fallbackPrice: '50' }, at(3), m => logged.push(m));
        assert.equal(quote?.priceSen, 5000);
        assert.match(logged[0], /isn't valid JSON/);
    });
});

describe('courier price (my-courier-rates)', () => {
    const penang = resolvePlace({ postalCode: '10200' }, false);
    const courierArgs = { rateTable: JSON.stringify(PLACEHOLDER_COURIER_TABLE), markupPercent: 10 };
    const rates: LiveRate[] = [
        { courier: 'Pos Laju', service: 'Next Day', priceSen: 1250, serviceId: 'EP-CS0W' },
        { courier: 'J&T Express', service: 'Standard', priceSen: 980, serviceId: 'EP-CS0I' },
    ];

    it('uses the zone × weight table when there are no live rates', async () => {
        const quote = await courierQuote({ place: penang, items: [{ quantity: 3 }], args: courierArgs, fromPostcode: '50450', log: noLog });
        assert.equal(quote?.priceSen, 1600); // RM10 first kg + 2 × RM3
        assert.deepEqual(quote?.metadata, { zone: 'peninsular', chargeableWeightKg: 3, weightBracketKg: 3, priceSource: 'table' });
    });

    it('takes the cheapest allowed live rate, adds the markup and rounds up to the next RM1', async () => {
        const asked: LiveRateRequest[] = [];
        const quote = await courierQuote({
            place: penang,
            items: [
                { quantity: 2, weightGrams: 1200 },
                { quantity: 2, weightGrams: 0 },
            ],
            args: courierArgs,
            fromPostcode: '50450',
            liveRates: async request => {
                asked.push(request);
                return rates;
            },
            log: noLog,
        });
        // 2.4 kg is asked as its 3 kg bracket, from the shop's postcode, with the state as the table writes it
        assert.deepEqual(asked, [{ fromPostcode: '50450', toPostcode: '10200', toState: 'Pulau Pinang', weightKg: 3 }]);
        assert.equal(quote?.priceSen, 1100); // J&T RM9.80 + 10% = RM10.78 → RM11
        assert.equal(quote?.metadata.priceSource, 'live');
        assert.equal(quote?.metadata.courier, 'J&T Express');
        assert.equal(quote?.metadata.courierPriceSen, 980);
    });

    it('keeps to the allowed couriers', async () => {
        const quote = await courierQuote({
            place: penang,
            items: [{ quantity: 1 }],
            args: { ...courierArgs, allowedCouriers: ['Pos Laju'] },
            fromPostcode: '50450',
            liveRates: async () => rates,
            log: noLog,
        });
        assert.equal(quote?.priceSen, 1400); // RM12.50 + 10% = RM13.75 → RM14
    });

    it('sends the box size for a single box only', async () => {
        const asked: LiveRateRequest[] = [];
        const liveRates = async (request: LiveRateRequest) => {
            asked.push(request);
            return rates;
        };
        const box = { quantity: 1, weightGrams: 1500, lengthCm: 30, widthCm: 20, heightCm: 10 };
        await courierQuote({ place: penang, items: [box, { quantity: 2, weightGrams: 0 }], args: courierArgs, fromPostcode: '50450', liveRates, log: noLog });
        await courierQuote({ place: penang, items: [{ ...box, quantity: 2 }], args: courierArgs, fromPostcode: '50450', liveRates, log: noLog });
        assert.deepEqual(asked[0], { fromPostcode: '50450', toPostcode: '10200', toState: 'Pulau Pinang', weightKg: 2, lengthCm: 30, widthCm: 20, heightCm: 10 });
        assert.equal(asked[1].lengthCm, undefined);
    });

    it('falls back to the table when live rates are missing, none are allowed, or they are switched off', async () => {
        const table = (over: object, liveRates?: () => Promise<LiveRate[] | undefined>) =>
            courierQuote({ place: penang, items: [{ quantity: 1 }], args: { ...courierArgs, ...over }, fromPostcode: '50450', liveRates, log: noLog });
        assert.equal((await table({}, async () => undefined))?.metadata.priceSource, 'table');
        assert.equal((await table({ allowedCouriers: ['Ninja Van'] }, async () => rates))?.metadata.priceSource, 'table');
        let asked = false;
        const off = await table({ useLiveRates: false }, async () => {
            asked = true;
            return rates;
        });
        assert.equal(off?.metadata.priceSource, 'table');
        assert.equal(asked, false);
    });

    it('asks couriers only about postcodes in the official table, and parcels up to the weight limit', async () => {
        let asked = 0;
        const liveRates = async () => {
            asked++;
            return rates;
        };
        const guessed = resolvePlace({ postalCode: '98999', province: 'Sarawak' }, false);
        const notInTable = await courierQuote({ place: guessed, items: [{ quantity: 1 }], args: courierArgs, fromPostcode: '50450', liveRates, log: noLog });
        assert.equal(notInTable?.metadata.priceSource, 'table');
        assert.equal(notInTable?.priceSen, 1600);
        const heavy = await courierQuote({ place: penang, items: [{ quantity: 31 }], args: courierArgs, fromPostcode: '50450', liveRates, liveRateMaxKg: 30, log: noLog });
        assert.equal(heavy?.metadata.priceSource, 'table');
        assert.equal(asked, 0);
        const atLimit = await courierQuote({ place: penang, items: [{ quantity: 30 }], args: courierArgs, fromPostcode: '50450', liveRates, liveRateMaxKg: 30, log: noLog });
        assert.equal(atLimit?.metadata.priceSource, 'live');
    });

    it('is not offered in a zone the table has no row for', async () => {
        const quote = await courierQuote({ place: kl, items: [{ quantity: 1 }], args: courierArgs, fromPostcode: '50450', log: noLog });
        assert.equal(quote, undefined);
    });

    it('prices East Malaysia from its own rows', async () => {
        const sabah = resolvePlace({ postalCode: '88000' }, false);
        const sarawak = resolvePlace({ postalCode: '93050' }, false);
        assert.equal((await courierQuote({ place: sabah, items: [{ quantity: 2 }], args: courierArgs, fromPostcode: '50450', log: noLog }))?.priceSen, 2400);
        assert.equal((await courierQuote({ place: sarawak, items: [{ quantity: 1 }], args: courierArgs, fromPostcode: '50450', log: noLog }))?.priceSen, 1600);
    });
});

describe('destination address for Google', () => {
    it('spells out the Federal Territories', () => {
        assert.equal(destinationAddress(resolvePlace({ postalCode: '62000' }, false)), '62000 Putrajaya, Wilayah Persekutuan Putrajaya, Malaysia');
        assert.equal(destinationAddress(resolvePlace({ postalCode: '47301' }, false)), '47301 Petaling Jaya, Selangor, Malaysia');
    });
});
