import { PaymentOptions } from '@vendure/core';

type RefundProcess = NonNullable<PaymentOptions['refundProcess']>[number];

/**
 * Lets a payment handler leave a new refund Pending: Billplz always (staff refund by hand, then settle it),
 * CHIP while its refund is still processing. Vendure moves every new refund from Pending to the state the
 * handler returns, and its default refund process has no Pending → Pending step, so without this the refund
 * is saved but the dashboard reports a RefundStateTransitionError.
 */
export const pendingRefundProcess: RefundProcess = {
    transitions: {
        Pending: { to: ['Pending'] },
    },
};
