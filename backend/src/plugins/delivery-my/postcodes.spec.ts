import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { lookupPostcode, normalisePostcode, postcodeTable, resolvePlace, stateFromProvince } from './postcodes';

const zone = (postalCode: string, more: { province?: string; countryCode?: string; includePutrajaya?: boolean } = {}) =>
    resolvePlace({ postalCode, province: more.province, countryCode: more.countryCode ?? 'MY' }, more.includePutrajaya ?? false).zone;

describe('postcode → zone', () => {
    it('Kuala Lumpur 50450 is KL & Selangor', () => {
        assert.equal(zone('50450'), 'klang-valley');
        assert.deepEqual(lookupPostcode('50450'), { state: 'W.P. Kuala Lumpur', city: 'Kuala Lumpur' });
    });

    it('Selangor 40000 (Shah Alam) and 47301 (Petaling Jaya) are KL & Selangor', () => {
        assert.equal(zone('40000'), 'klang-valley');
        assert.equal(zone('47301'), 'klang-valley');
        assert.equal(lookupPostcode('47301')?.state, 'Selangor');
    });

    it('Putrajaya 62000 is Peninsular, or KL & Selangor with includePutrajaya', () => {
        assert.equal(zone('62000'), 'peninsular');
        assert.equal(zone('62000', { includePutrajaya: true }), 'klang-valley');
    });

    it('Penang 10200 is Peninsular', () => {
        assert.equal(zone('10200'), 'peninsular');
        assert.equal(lookupPostcode('10200')?.state, 'Pulau Pinang');
    });

    it('Sabah 88000 and Labuan 87000 are Sabah & Labuan; Sarawak 93050 is Sarawak', () => {
        assert.equal(zone('88000'), 'sabah-labuan');
        assert.equal(zone('87000'), 'sabah-labuan');
        assert.equal(zone('93050'), 'sarawak');
    });

    it('postcodes not in the table are unknown, unless the province says where', () => {
        assert.equal(zone('99999'), 'unknown');
        assert.equal(zone('00000'), 'unknown');
        assert.equal(zone('KL'), 'unknown');
        assert.equal(zone(''), 'unknown');
        assert.equal(zone('99999', { province: 'Selangor' }), 'klang-valley');
        assert.equal(zone('99999', { province: 'Wilayah Persekutuan Kuala Lumpur' }), 'klang-valley');
        assert.equal(zone('99999', { province: 'Penang' }), 'peninsular');
        assert.equal(zone('99999', { province: 'Sabah' }), 'sabah-labuan');
        assert.equal(zone('99999', { province: 'Atlantis' }), 'unknown');
        const guessed = resolvePlace({ postalCode: '99999', province: 'Selangor', city: 'Shah Alam' }, false);
        assert.deepEqual(guessed, { zone: 'klang-valley', postcode: '99999', state: 'Selangor', city: 'Shah Alam', postcodeKnown: false });
    });

    it('the postcode wins over a province that disagrees', () => {
        assert.equal(zone('50450', { province: 'Sabah' }), 'klang-valley');
    });

    it('cleans up postcodes: spaces, and the leading zero spreadsheets drop', () => {
        assert.equal(normalisePostcode(' 50 450 '), '50450');
        assert.equal(normalisePostcode('1000'), '01000');
        assert.equal(lookupPostcode('1000')?.state, 'Perlis');
        assert.equal(normalisePostcode('504501'), undefined);
    });

    it('addresses outside Malaysia are unknown', () => {
        assert.equal(zone('50450', { countryCode: 'SG' }), 'unknown');
        assert.equal(resolvePlace({ postalCode: '50450' }, false).zone, 'klang-valley');
    });

    it('state names are trimmed (the 2026 table has "Negeri Sembilan  ")', () => {
        assert.equal(lookupPostcode('71000')?.state, 'Negeri Sembilan');
        assert.equal(lookupPostcode('45600')?.city, 'Bestari Jaya');
    });
});

describe('province names customers type', () => {
    const cases: Array<[string, string | undefined]> = [
        ['Kuala Lumpur', 'W.P. Kuala Lumpur'],
        ['W.P. Kuala Lumpur', 'W.P. Kuala Lumpur'],
        ['WP Kuala Lumpur', 'W.P. Kuala Lumpur'],
        ['KL', 'W.P. Kuala Lumpur'],
        ['Wilayah Persekutuan Putrajaya', 'W.P. Putrajaya'],
        ['Federal Territory of Labuan', 'W.P. Labuan'],
        ['Selangor Darul Ehsan', 'Selangor'],
        ['Penang', 'Pulau Pinang'],
        ['PULAU PINANG', 'Pulau Pinang'],
        ['Malacca', 'Melaka'],
        ['N. Sembilan', 'Negeri Sembilan'],
        ['Johor Darul Ta’zim', 'Johor'],
        ['Singapore', undefined],
        ['Kuala Selangor', undefined],
        ['', undefined],
    ];
    for (const [input, state] of cases) {
        it(`"${input}" → ${state ?? 'not a state'}`, () => assert.equal(stateFromProvince(input), state));
    }
    it('handles a missing province', () => assert.equal(stateFromProvince(null), undefined));
});

describe('the official postcode table (data.gov.my, data as of 2026-06)', () => {
    it('has all 2,930 postcodes', () => {
        assert.equal(postcodeTable().size, 2930);
    });

    it('KL and Selangor are exactly the prefixes 40–48, 50–60, 63, 64 and 68, shared with no other state', () => {
        const expected = ['40', '41', '42', '43', '44', '45', '46', '47', '48', ...Array.from({ length: 11 }, (_, i) => String(50 + i)), '63', '64', '68'];
        const klSelangor = new Set<string>();
        const others = new Set<string>();
        for (const [postcode, { state }] of postcodeTable()) {
            (state === 'W.P. Kuala Lumpur' || state === 'Selangor' ? klSelangor : others).add(postcode.slice(0, 2));
        }
        assert.deepEqual([...klSelangor].sort(), expected);
        assert.deepEqual(expected.filter(p => others.has(p)), []);
    });

    it('Putrajaya is 62; East Malaysia is 87 and up; states do not follow tidy ranges', () => {
        const states = (prefix: string) =>
            new Set([...postcodeTable()].filter(([postcode]) => postcode.startsWith(prefix)).map(([, place]) => place.state));
        assert.deepEqual([...states('62')], ['W.P. Putrajaya']);
        for (const [postcode, { state }] of postcodeTable()) {
            const eastMalaysia = state === 'Sabah' || state === 'Sarawak' || state === 'W.P. Labuan';
            assert.equal(Number(postcode) >= 87000, eastMalaysia, postcode);
        }
        assert.deepEqual([...states('34')].sort(), ['Kedah', 'Perak']);
        assert.deepEqual([...states('39')], ['Pahang']);
        assert.deepEqual([...states('49')], ['Pahang']);
        assert.deepEqual([...states('69')], ['Pahang']);
    });
});
