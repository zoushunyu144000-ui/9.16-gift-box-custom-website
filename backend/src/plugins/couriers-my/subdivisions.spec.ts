import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { easyParcelPhone, toE164 } from './phone';
import { resolveSubdivision, subdivisionFromPostcode, subdivisionFromState } from './subdivisions';

describe('Malaysian subdivision codes', () => {
    it('reads state names the way addresses are written', () => {
        assert.equal(subdivisionFromState('Kuala Lumpur'), 'MY-14');
        assert.equal(subdivisionFromState('W.P. Kuala Lumpur'), 'MY-14');
        assert.equal(subdivisionFromState('Wilayah Persekutuan Kuala Lumpur'), 'MY-14');
        assert.equal(subdivisionFromState('Selangor'), 'MY-10');
        assert.equal(subdivisionFromState('Pulau Pinang'), 'MY-07');
        assert.equal(subdivisionFromState('Penang'), 'MY-07');
        assert.equal(subdivisionFromState('Sabah'), 'MY-12');
        assert.equal(subdivisionFromState('Sarawak'), 'MY-13');
        assert.equal(subdivisionFromState('WP Labuan'), 'MY-15');
        assert.equal(subdivisionFromState('Wilayah Persekutuan Putrajaya'), 'MY-16');
        assert.equal(subdivisionFromState('Malacca'), 'MY-04');
        assert.equal(subdivisionFromState('N. Sembilan'), 'MY-05');
        assert.equal(subdivisionFromState('Johor Darul Ta’zim'), 'MY-01');
    });

    it('accepts ISO codes and state numbers', () => {
        assert.equal(subdivisionFromState('MY-14'), 'MY-14');
        assert.equal(subdivisionFromState('my-7'), 'MY-07');
        assert.equal(subdivisionFromState('10'), 'MY-10');
        assert.equal(subdivisionFromState('MY-17'), undefined);
        assert.equal(subdivisionFromState('Atlantis'), undefined);
    });

    it('falls back to the postcode', () => {
        assert.equal(subdivisionFromPostcode('50450'), 'MY-14'); // Kuala Lumpur
        assert.equal(subdivisionFromPostcode('47300'), 'MY-10'); // Petaling Jaya
        assert.equal(subdivisionFromPostcode('63000'), 'MY-10'); // Cyberjaya
        assert.equal(subdivisionFromPostcode('62502'), 'MY-16'); // Putrajaya
        assert.equal(subdivisionFromPostcode('11950'), 'MY-07'); // Bayan Lepas
        assert.equal(subdivisionFromPostcode('88000'), 'MY-12'); // Kota Kinabalu
        assert.equal(subdivisionFromPostcode('93350'), 'MY-13'); // Kuching
        assert.equal(subdivisionFromPostcode('87000'), 'MY-15'); // Labuan
        assert.equal(subdivisionFromPostcode('39000'), 'MY-06'); // Cameron Highlands
        assert.equal(subdivisionFromPostcode('1234'), undefined);
        assert.equal(resolveSubdivision('', '81300'), 'MY-01');
        assert.equal(resolveSubdivision('Selangor', '50450'), 'MY-10'); // what the customer wrote wins
    });
});

describe('phone numbers', () => {
    it('normalises Malaysian numbers to E.164 for Lalamove', () => {
        assert.equal(toE164('012-345 6789'), '+60123456789');
        assert.equal(toE164('+60 12-345 6789'), '+60123456789');
        assert.equal(toE164('60123456789'), '+60123456789');
        assert.equal(toE164('03-2161 1234'), '+60321611234');
        assert.equal(toE164('0060123456789'), '+60123456789');
        assert.equal(toE164('+65 9123 4567'), '+6591234567');
        assert.equal(toE164(''), undefined);
        assert.equal(toE164('abc'), undefined);
    });

    it('splits numbers into country and national number for EasyParcel', () => {
        assert.deepEqual(easyParcelPhone('011-2676 0658'), { countryCode: 'MY', number: '1126760658' });
        assert.deepEqual(easyParcelPhone('+65 9123 4567'), { countryCode: 'SG', number: '91234567' });
        assert.deepEqual(easyParcelPhone('+673 712 3456'), { countryCode: 'BN', number: '7123456' });
        assert.equal(easyParcelPhone(null), undefined);
    });
});
