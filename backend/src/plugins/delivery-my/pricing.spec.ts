import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    bandFor,
    chargeableWeightKg,
    cheapestAllowedRate,
    customerPriceSen,
    parseCourierTable,
    parsePriceBands,
    parseRinggit,
    PLACEHOLDER_COURIER_TABLE,
    PLACEHOLDER_PRICE_BANDS,
    tablePriceSen,
    weightBracketKg,
} from './pricing';
import { LiveRate } from './types';

describe('same-day price bands', () => {
    const bands = parsePriceBands(JSON.stringify(PLACEHOLDER_PRICE_BANDS));
    const price = (km: number) => bandFor(km, bands)?.price;

    it('takes the first band that reaches the distance; a boundary belongs to the nearer band', () => {
        assert.equal(price(0.4), 15);
        assert.equal(price(5), 15);
        assert.equal(price(5.01), 20);
        assert.equal(price(10), 20);
        assert.equal(price(19.9), 28);
        assert.equal(price(30), 35);
        assert.equal(price(45), 45);
    });

    it('has no band beyond the last one', () => {
        assert.equal(price(45.1), undefined);
    });

    it('sorts bands typed out of order, and takes numbers written as text', () => {
        const sorted = parsePriceBands('[{"upToKm":10,"price":20},{"upToKm":"5","price":"15"}]');
        assert.deepEqual(sorted, [
            { upToKm: 5, price: 15 },
            { upToKm: 10, price: 20 },
        ]);
    });

    it('explains a broken table', () => {
        assert.throws(() => parsePriceBands('[{upToKm:5,price:15}]'), /isn't valid JSON/);
        assert.throws(() => parsePriceBands('[]'), /at least one band/);
        assert.throws(() => parsePriceBands('[{"upToKm":5}]'), /Band 1 .* "price"/);
        assert.throws(() => parsePriceBands('[{"upToKm":0,"price":10}]'), /Band 1/);
    });

    it('reads ringgit prices as staff type them', () => {
        assert.equal(parseRinggit('45'), 45);
        assert.equal(parseRinggit('RM 45.50'), 45.5);
        assert.equal(parseRinggit('rm1,200'), 1200);
        assert.equal(parseRinggit(''), undefined);
        assert.equal(parseRinggit('  '), undefined);
        assert.equal(parseRinggit(undefined), undefined);
        assert.throws(() => parseRinggit('forty'), /isn't a price/);
        assert.throws(() => parseRinggit('-5'), /isn't a price/);
    });
});

describe('chargeable weight', () => {
    it('adds packed weights × quantity, 1000 g for items without one', () => {
        assert.equal(chargeableWeightKg([{ quantity: 2, weightGrams: 1500 }, { quantity: 1 }]), 4);
        assert.equal(chargeableWeightKg([{ quantity: 3, weightGrams: null }]), 3);
    });

    it('charges a bulky light box by size: L × W × H ÷ 5000', () => {
        // 40 × 30 × 20 cm = 4.8 kg volumetric against 1.2 kg actual
        assert.equal(chargeableWeightKg([{ quantity: 2, weightGrams: 1200, lengthCm: 40, widthCm: 30, heightCm: 20 }]), 9.6);
        // a small heavy item still counts by weight
        assert.equal(chargeableWeightKg([{ quantity: 1, weightGrams: 2500, lengthCm: 10, widthCm: 10, heightCm: 10 }]), 2.5);
    });

    it('uses the configured divisor', () => {
        assert.equal(chargeableWeightKg([{ quantity: 1, weightGrams: 500, lengthCm: 40, widthCm: 30, heightCm: 20 }], 6000), 4);
    });

    it('needs all three sizes to count the volume', () => {
        assert.equal(chargeableWeightKg([{ quantity: 1, weightGrams: 800, lengthCm: 100, widthCm: 100 }]), 0.8);
    });

    it('lets weightless items (a personalised name) add nothing', () => {
        assert.equal(chargeableWeightKg([{ quantity: 3, weightGrams: 0 }, { quantity: 1, weightGrams: 1000 }]), 1);
    });

    it('works to the gram, without floating-point crumbs', () => {
        assert.equal(chargeableWeightKg([{ quantity: 3, weightGrams: 100 }, { quantity: 1, weightGrams: 200 }]), 0.5);
    });
});

describe('courier zone × weight table', () => {
    const table = parseCourierTable(JSON.stringify(PLACEHOLDER_COURIER_TABLE));

    it('charges the first kg, then each further started kg', () => {
        const peninsular = table.peninsular!;
        assert.equal(tablePriceSen(peninsular, 0), 1000);
        assert.equal(tablePriceSen(peninsular, 0.4), 1000);
        assert.equal(tablePriceSen(peninsular, 1), 1000);
        assert.equal(tablePriceSen(peninsular, 1.2), 1300);
        assert.equal(tablePriceSen(peninsular, 3), 1600);
    });

    it('has a rate per zone', () => {
        assert.equal(tablePriceSen(table['sabah-labuan']!, 2.5), 1800 + 2 * 600);
        assert.equal(tablePriceSen(table.sarawak!, 1), 1600);
        assert.equal(table['klang-valley'], undefined);
    });

    it('rounds weight up to the whole kg, never below 1', () => {
        assert.equal(weightBracketKg(0), 1);
        assert.equal(weightBracketKg(1), 1);
        assert.equal(weightBracketKg(1.001), 2);
        assert.equal(weightBracketKg(0.1 + 0.2 + 0.7), 1);
    });

    it('rejects typos in zones and missing rates', () => {
        assert.throws(() => parseCourierTable('{"penisular":{"firstKg":10,"eachExtraKg":3}}'), /unknown zone "penisular"/);
        assert.throws(() => parseCourierTable('{"sarawak":{"firstKg":16}}'), /"sarawak" needs/);
        assert.throws(() => parseCourierTable('[1,2]'), /one object per zone/);
        assert.throws(() => parseCourierTable('not json'), /isn't valid JSON/);
    });
});

describe('live courier rates', () => {
    const rates: LiveRate[] = [
        { courier: 'Pos Laju', service: 'Next Day', priceSen: 1250, serviceId: 'EP-CS0W' },
        { courier: 'J&T Express', service: 'Standard', priceSen: 980, serviceId: 'EP-CS0I' },
        { courier: 'DHL eCommerce', service: 'Parcel', priceSen: 1100, serviceId: 'EP-CS0D' },
        { courier: 'Broken', service: 'Free?', priceSen: 0, serviceId: 'X' },
    ];

    it('takes the cheapest real rate', () => {
        assert.equal(cheapestAllowedRate(rates)?.courier, 'J&T Express');
    });

    it('keeps to allowed couriers: any case, part of a name, or a service id', () => {
        assert.equal(cheapestAllowedRate(rates, ['pos laju', 'DHL'])?.courier, 'DHL eCommerce');
        assert.equal(cheapestAllowedRate(rates, ['EP-CS0W'])?.courier, 'Pos Laju');
        assert.equal(cheapestAllowedRate(rates, ['next day'])?.courier, 'Pos Laju');
        assert.equal(cheapestAllowedRate(rates, ['  ', ''])?.courier, 'J&T Express');
        assert.equal(cheapestAllowedRate(rates, ['Ninja Van']), undefined);
    });

    it('adds the markup, then rounds up to the next RM1', () => {
        assert.equal(customerPriceSen(980, 10), 1100); // RM10.78 → RM11
        assert.equal(customerPriceSen(1000, 10), 1100); // exactly RM11, not RM12 from 1100.0000000000002
        assert.equal(customerPriceSen(1001, 0), 1100);
        assert.equal(customerPriceSen(1000, 0), 1000);
        assert.equal(customerPriceSen(1234, 7.5), 1400); // RM13.27 → RM14
        assert.equal(customerPriceSen(1000, -20), 1000); // no discounts by accident
    });
});
