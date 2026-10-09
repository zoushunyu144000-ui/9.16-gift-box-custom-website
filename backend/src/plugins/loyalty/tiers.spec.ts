import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assertValidTiers, LoyaltyTier, tierChanges, tierFor } from './tiers';

const silver: LoyaltyTier = { name: 'Silver members', minSpendSen: 100000 }; // RM 1,000
const gold: LoyaltyTier = { name: 'Gold members', minSpendSen: 500000 }; // RM 5,000
const tiers = [gold, silver]; // any order

describe('which tier a lifetime spend reaches', () => {
    it('is the highest threshold met', () => {
        assert.equal(tierFor(100000, tiers), silver); // exactly RM 1,000
        assert.equal(tierFor(499999, tiers), silver);
        assert.equal(tierFor(500000, tiers), gold);
        assert.equal(tierFor(9000000, tiers), gold);
    });

    it('is none below the lowest threshold or without tiers', () => {
        assert.equal(tierFor(99999, tiers), undefined);
        assert.equal(tierFor(0, tiers), undefined);
        assert.equal(tierFor(9000000, []), undefined);
    });
});

describe('moving customers between tier groups', () => {
    it('adds a customer who reaches a tier', () => {
        assert.deepEqual(tierChanges([{ customerId: 1, spendSen: 120000, tierGroups: [] }], tiers), [
            { group: 'Silver members', add: [1], remove: [] },
        ]);
    });

    it('moves an upgraded customer out of the lower tier', () => {
        assert.deepEqual(tierChanges([{ customerId: 1, spendSen: 600000, tierGroups: ['Silver members'] }], tiers), [
            { group: 'Gold members', add: [1], remove: [] },
            { group: 'Silver members', add: [], remove: [1] },
        ]);
    });

    it('moves a customer down when spend drops (a cancelled order) and out when below every tier', () => {
        assert.deepEqual(tierChanges([{ customerId: 1, spendSen: 200000, tierGroups: ['Gold members'] }], tiers), [
            { group: 'Gold members', add: [], remove: [1] },
            { group: 'Silver members', add: [1], remove: [] },
        ]);
        assert.deepEqual(tierChanges([{ customerId: 2, spendSen: 0, tierGroups: ['Silver members'] }], tiers), [
            { group: 'Silver members', add: [], remove: [2] },
        ]);
    });

    it('changes nothing for customers already in the right tier, so a rerun is a no-op', () => {
        const members = [
            { customerId: 1, spendSen: 600000, tierGroups: ['Gold members'] },
            { customerId: 2, spendSen: 150000, tierGroups: ['Silver members'] },
            { customerId: 3, spendSen: 5000, tierGroups: [] },
        ];
        assert.deepEqual(tierChanges(members, tiers), []);
    });

    it('takes a customer out of extra tier groups (e.g. added by hand)', () => {
        assert.deepEqual(tierChanges([{ customerId: 1, spendSen: 600000, tierGroups: ['Gold members', 'Silver members'] }], tiers), [
            { group: 'Silver members', add: [], remove: [1] },
        ]);
    });
});

describe('tier settings', () => {
    it('accepts no tiers and a list of distinct ones', () => {
        assert.doesNotThrow(() => assertValidTiers([]));
        assert.doesNotThrow(() => assertValidTiers(tiers));
    });

    it('refuses unnamed, repeated or zero tiers', () => {
        assert.throws(() => assertValidTiers([{ name: ' ', minSpendSen: 100 }]), /needs a name/);
        assert.throws(() => assertValidTiers([silver, { ...silver, minSpendSen: 200000 }]), /listed twice/);
        assert.throws(() => assertValidTiers([{ ...silver, name: 'Bronze', minSpendSen: 0 }]), /above 0/);
        assert.throws(() => assertValidTiers([silver, { name: 'Other', minSpendSen: 100000 }]), /two tiers start at 100000/);
    });
});
