import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GatewayPaymentStatus } from './gateways/types';
import { checkGatewayPayment, ExpectedPayment } from './payment-check';

const expected: ExpectedPayment = { gateway: 'CHIP', orderCode: 'ABC123', amount: 40000, currencyCode: 'MYR', account: 'brand-1' };
const paid: GatewayPaymentStatus = {
    id: 'p-1',
    reference: 'ABC123',
    state: 'paid',
    gatewayStatus: 'paid',
    amount: 40000,
    paidAmount: 40000,
    currencyCode: 'MYR',
    account: 'brand-1',
};

const reason = (payment: GatewayPaymentStatus) => {
    const check = checkGatewayPayment(payment, expected);
    return check.ok ? 'ok' : check.reason;
};

describe('accepting a gateway payment', () => {
    it('accepts a paid payment for this order, account, currency and amount', () => {
        assert.equal(reason(paid), 'ok');
        assert.equal(reason({ ...paid, account: undefined }), 'ok');
    });

    it('declines a payment that is not paid', () => {
        assert.equal(reason({ ...paid, state: 'pending', gatewayStatus: 'viewed', paidAmount: 0 }), 'CHIP reports payment p-1 as viewed, not paid.');
        assert.match(reason({ ...paid, state: 'refunded', gatewayStatus: 'refunded' }), /refunded, not paid/);
    });

    it('declines a payment for another order or without one', () => {
        assert.equal(reason({ ...paid, reference: 'XYZ999' }), 'CHIP payment p-1 is for order XYZ999, not ABC123.');
        assert.equal(reason({ ...paid, reference: undefined }), 'CHIP payment p-1 is for no order, not ABC123.');
    });

    it('declines a payment into another account or currency', () => {
        assert.match(reason({ ...paid, account: 'brand-2' }), /another CHIP account/);
        assert.match(reason({ ...paid, currencyCode: 'SGD' }), /is in SGD, not MYR/);
        assert.match(reason({ ...paid, currencyCode: '' }), /unknown currency/);
    });

    it('declines a payment for any other amount', () => {
        assert.equal(reason({ ...paid, paidAmount: 39900 }), 'RM 399.00 was paid with CHIP, but RM 400.00 is owed.');
        assert.match(reason({ ...paid, paidAmount: 40100 }), /RM 401\.00 was paid/);
    });
});
