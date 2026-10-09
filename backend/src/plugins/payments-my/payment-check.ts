import { formatMoney } from './gateways/format';
import { GatewayPaymentStatus } from './gateways/types';

export interface ExpectedPayment {
    /** Gateway display name, for the reason. */
    gateway: string;
    orderCode: string;
    /** Amount owed, sen. */
    amount: number;
    currencyCode: string;
    /** The shop's merchant account at the gateway: CHIP brand id, Billplz collection id. */
    account?: string;
}

export type PaymentCheck = { ok: true } | { ok: false; reason: string };

/**
 * Whether a payment, as the gateway reports it, settles this order: paid, for this order, into this shop's
 * account, in the order's currency, for exactly the amount owed. Anything else is declined with a reason
 * staff can act on.
 */
export function checkGatewayPayment(payment: GatewayPaymentStatus, expected: ExpectedPayment): PaymentCheck {
    const { gateway } = expected;
    if (payment.state !== 'paid') {
        return { ok: false, reason: `${gateway} reports payment ${payment.id} as ${payment.gatewayStatus}, not paid.` };
    }
    if (payment.reference !== expected.orderCode) {
        const owner = payment.reference ? `order ${payment.reference}` : 'no order';
        return { ok: false, reason: `${gateway} payment ${payment.id} is for ${owner}, not ${expected.orderCode}.` };
    }
    if (expected.account && payment.account && payment.account !== expected.account) {
        return { ok: false, reason: `${gateway} payment ${payment.id} belongs to another ${gateway} account.` };
    }
    if (payment.currencyCode !== expected.currencyCode) {
        return { ok: false, reason: `${gateway} payment ${payment.id} is in ${payment.currencyCode || 'an unknown currency'}, not ${expected.currencyCode}.` };
    }
    if (payment.paidAmount !== expected.amount) {
        return {
            ok: false,
            reason: `${formatMoney(payment.paidAmount, payment.currencyCode)} was paid with ${gateway}, but ${formatMoney(expected.amount, expected.currencyCode)} is owed.`,
        };
    }
    return { ok: true };
}
