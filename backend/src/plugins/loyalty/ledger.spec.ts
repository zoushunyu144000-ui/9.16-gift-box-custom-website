import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cancellationEntries, LedgerEntryLike, orderEntryKey } from './points';

describe('ledger keys', () => {
    it('name one entry per order and kind', () => {
        assert.equal(orderEntryKey(42, 'earned'), 'order:42:earned');
        assert.notEqual(orderEntryKey(42, 'earned'), orderEntryKey(42, 'redeemed'));
        assert.notEqual(orderEntryKey(42, 'earned'), orderEntryKey(43, 'earned'));
    });

    it('are the same whether the id comes as a number or a string', () => {
        assert.equal(orderEntryKey('42', 'redeemed-reversed'), orderEntryKey(42, 'redeemed-reversed'));
    });
});

describe('cancelling an order', () => {
    const earned: LedgerEntryLike = { customerId: 7, points: 188, uniqueKey: orderEntryKey(42, 'earned') };
    const redeemed: LedgerEntryLike = { customerId: 7, points: -500, uniqueKey: orderEntryKey(42, 'redeemed') };

    it('plans nothing for an order without points', () => {
        assert.deepEqual(cancellationEntries(42, []), []);
    });

    it('takes back the points the order earned', () => {
        assert.deepEqual(cancellationEntries(42, [earned]), [
            {
                customerId: 7,
                points: -188,
                reason: 'reversed',
                uniqueKey: 'order:42:earned-reversed',
                note: 'Order cancelled: points earned on it removed',
            },
        ]);
    });

    it('gives back the points used on the order', () => {
        assert.deepEqual(cancellationEntries(42, [redeemed]), [
            {
                customerId: 7,
                points: 500,
                reason: 'reversed',
                uniqueKey: 'order:42:redeemed-reversed',
                note: 'Order cancelled: points used on it returned',
            },
        ]);
    });

    it('does both for an order that used points and earned some', () => {
        assert.deepEqual(
            cancellationEntries(42, [redeemed, earned]).map(e => e.points),
            [-188, 500],
        );
    });

    it('plans nothing the second time, so a repeated cancellation event changes nothing', () => {
        const first = cancellationEntries(42, [earned, redeemed]);
        assert.equal(first.length, 2);
        assert.deepEqual(cancellationEntries(42, [earned, redeemed, ...first]), []);
    });

    it('gives back to the customer who had the points', () => {
        const otherCustomer = { ...redeemed, customerId: 9 };
        assert.equal(cancellationEntries(42, [otherCustomer])[0].customerId, 9);
    });

    it('ignores entries of other orders and staff adjustments', () => {
        const otherOrder: LedgerEntryLike = { customerId: 7, points: 300, uniqueKey: orderEntryKey(43, 'earned') };
        const adjustment: LedgerEntryLike = { customerId: 7, points: 50, uniqueKey: null };
        assert.deepEqual(cancellationEntries(42, [otherOrder, adjustment]), []);
    });
});
