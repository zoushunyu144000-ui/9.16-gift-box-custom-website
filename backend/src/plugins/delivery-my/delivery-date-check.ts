import { HistoryEntryType } from '@vendure/common/lib/generated-types';
import { HistoryService, Injector, Logger, Order, OrderProcess, OrderState, RequestContext } from '@vendure/core';
import { loggerCtx } from './constants';
import { DeliveryService } from './delivery.service';
import { preferredDateProblem } from './dispatch';
import { errorMessage } from './timeout';

/**
 * Before payment: a preferred delivery date, when the customer chose one, must be a day the shop dispatches
 * (not a Sunday or closed date), on or after the earliest dispatch date.
 *
 * Vendure lets order custom fields change after that check, and payment may come after the cut-off. So when the
 * order is placed the date is checked again and, if it no longer works, staff get a note on the order rather than
 * the payment being refused (the customer may already have paid the gateway).
 */
export function deliveryDateCheck(): OrderProcess<OrderState> {
    let deliveryService: DeliveryService;
    let historyService: HistoryService;

    async function problemWith(ctx: RequestContext, order: Order) {
        const date = (order.customFields as { preferredDeliveryDate?: string | null }).preferredDeliveryDate?.trim();
        if (!date) return undefined;
        const { earliest, rules } = await deliveryService.earliestDispatch(ctx);
        return preferredDateProblem(date, earliest, rules);
    }

    return {
        init(injector: Injector) {
            deliveryService = injector.get(DeliveryService);
            historyService = injector.get(HistoryService);
        },
        async onTransitionStart(fromState, toState, { ctx, order }) {
            if (toState !== 'ArrangingPayment') return;
            return (await problemWith(ctx, order))?.customer;
        },
        async onTransitionEnd(fromState, toState, { ctx, order }) {
            const placed = fromState === 'ArrangingPayment' && (toState === 'PaymentAuthorized' || toState === 'PaymentSettled');
            if (!placed) return;
            try {
                const problem = await problemWith(ctx, order);
                if (!problem) return;
                await historyService.createHistoryEntryForOrder(
                    { ctx, orderId: order.id, type: HistoryEntryType.ORDER_NOTE, data: { note: `${problem.staff} Please agree a delivery date with the customer.` } },
                    false,
                );
            } catch (err) {
                Logger.error(`Couldn’t check the preferred delivery date of order ${order.code}: ${errorMessage(err)}`, loggerCtx);
            }
        },
    };
}
