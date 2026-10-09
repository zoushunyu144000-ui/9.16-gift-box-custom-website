import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    assertValidLoyaltyOptions,
    DEFAULT_LOYALTY_OPTIONS,
    formatPoints,
    maxRedeemablePoints,
    pointsEarned,
    pointsRequestedOn,
    pointsValue,
    productsSubtotalSen,
    redemptionProblem,
} from './points';

const options = DEFAULT_LOYALTY_OPTIONS;

describe('earning points', () => {
    it('gives a point per whole ringgit, rounding down', () => {
        assert.equal(pointsEarned(18850, 1), 188); // RM 188.50
        assert.equal(pointsEarned(18899, 1), 188);
        assert.equal(pointsEarned(18900, 1), 189);
        assert.equal(pointsEarned(99, 1), 0); // under RM 1
    });

    it('rounds the ringgit down before applying the rate', () => {
        assert.equal(pointsEarned(18850, 2), 376); // floor(188.50) × 2, not floor(377.00)
    });

    it('gives nothing for an empty or negative total, or when earning is off', () => {
        assert.equal(pointsEarned(0, 1), 0);
        assert.equal(pointsEarned(-500, 1), 0);
        assert.equal(pointsEarned(50000, 0), 0);
    });
});

describe('what points are worth', () => {
    it('makes 100 points worth RM 1 by default', () => {
        assert.equal(pointsValue(100, options.pointValueSen), 100);
        assert.equal(pointsValue(500, options.pointValueSen), 500);
    });

    it('follows the shop’s value per point', () => {
        assert.equal(pointsValue(500, 2), 1000);
    });
});

describe('the most points an order can take', () => {
    it('is half the products subtotal by default', () => {
        assert.equal(maxRedeemablePoints(40000, options), 20000); // RM 400 → RM 200 → 20,000 points
    });

    it('rounds the cap down to whole sen, then to whole points', () => {
        assert.equal(maxRedeemablePoints(999, options), 499); // 50% of 999 sen = 499.5
        assert.equal(maxRedeemablePoints(999, { pointValueSen: 2, maxRedeemPercent: 50 }), 249); // 499 sen ÷ 2
    });

    it('is 0 for an empty bag or when redeeming is off', () => {
        assert.equal(maxRedeemablePoints(0, options), 0);
        assert.equal(maxRedeemablePoints(-100, options), 0);
        assert.equal(maxRedeemablePoints(40000, { pointValueSen: 1, maxRedeemPercent: 0 }), 0);
    });

    it('is measured on the subtotal the customer sees', () => {
        assert.equal(productsSubtotalSen({ subTotal: 10000, subTotalWithTax: 10800 }, true), 10800);
        assert.equal(productsSubtotalSen({ subTotal: 10000, subTotalWithTax: 10800 }, false), 10000);
    });
});

describe('checking points before they are used', () => {
    const check = (points: number, balance = 5000, productsSubtotalSen = 40000) =>
        redemptionProblem({ points, balance, productsSubtotalSen }, options);

    it('accepts points within the balance, from the minimum, up to half the subtotal', () => {
        assert.equal(check(500), undefined);
        assert.equal(check(5000), undefined);
        assert.equal(check(1000, 5000, 2000), undefined); // exactly half of RM 20
    });

    it('takes 0 as removing the points', () => {
        assert.equal(check(0, 0, 0), undefined);
    });

    it('refuses fractions and negative numbers', () => {
        assert.equal(check(1.5), 'Please enter a whole number of points.');
        assert.equal(check(-500), 'Please enter a whole number of points.');
    });

    it('refuses fewer than the minimum', () => {
        assert.equal(check(499), 'Please use at least 500 points.');
    });

    it('refuses more than the balance', () => {
        assert.equal(check(600, 550), 'You have 550 points to use.');
        assert.equal(check(1200, 0), 'You don’t have any points to use yet.');
        assert.equal(check(1200, -40), 'You don’t have any points to use yet.');
    });

    it('refuses more than half the products subtotal, saying how many fit', () => {
        assert.equal(check(1001, 5000, 2000), 'Points can pay for up to 50% of the items in your bag, so up to 1,000 points on this order.');
        assert.equal(check(500, 5000, 999), 'Points can pay for up to 50% of the items in your bag, so this order is too small to use points.');
    });

    it('says so when the shop has turned redeeming off', () => {
        const off = { ...options, maxRedeemPercent: 0 };
        assert.equal(redemptionProblem({ points: 500, balance: 5000, productsSubtotalSen: 40000 }, off), 'Points can’t be used on orders at the moment.');
    });
});

describe('points stored on an order', () => {
    it('reads the requested points, treating missing or empty values as none', () => {
        assert.equal(pointsRequestedOn({ customFields: { loyaltyPointsApplied: 1200 } }), 1200);
        assert.equal(pointsRequestedOn({ customFields: { loyaltyPointsApplied: 0 } }), 0);
        assert.equal(pointsRequestedOn({ customFields: { loyaltyPointsApplied: null } }), 0);
        assert.equal(pointsRequestedOn({ customFields: {} }), 0);
        assert.equal(pointsRequestedOn({}), 0);
    });
});

describe('showing points', () => {
    it('groups thousands', () => {
        assert.equal(formatPoints(999), '999');
        assert.equal(formatPoints(1500), '1,500');
        assert.equal(formatPoints(-1234567), '-1,234,567');
    });
});

describe('plugin options', () => {
    it('accepts the defaults and turning earning or redeeming off', () => {
        assert.doesNotThrow(() => assertValidLoyaltyOptions(options));
        assert.doesNotThrow(() => assertValidLoyaltyOptions({ ...options, pointsPerRinggit: 0, maxRedeemPercent: 0 }));
    });

    it('refuses settings the maths can’t use', () => {
        assert.throws(() => assertValidLoyaltyOptions({ ...options, pointValueSen: 0 }), /pointValueSen/);
        assert.throws(() => assertValidLoyaltyOptions({ ...options, pointsPerRinggit: 1.5 }), /pointsPerRinggit/);
        assert.throws(() => assertValidLoyaltyOptions({ ...options, maxRedeemPercent: 120 }), /maxRedeemPercent/);
        assert.throws(() => assertValidLoyaltyOptions({ ...options, minRedeemPoints: 0 }), /minRedeemPoints/);
        assert.throws(() => assertValidLoyaltyOptions({ ...options, earnOnState: '' }), /earnOnState/);
    });
});
