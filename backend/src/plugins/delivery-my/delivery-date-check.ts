import { Injector, OrderProcess, OrderState } from '@vendure/core';
import { DeliveryService } from './delivery.service';
import { dateLabel, isDispatchDay, isValidDate, weekdayName, weekdayOf } from './dispatch';

/**
 * Before payment: a preferred delivery date, when the customer chose one, must be a day the shop dispatches
 * (not a Sunday or closed date), on or after the earliest dispatch date for the shipping address.
 */
export function deliveryDateCheck(): OrderProcess<OrderState> {
    let deliveryService: DeliveryService;
    return {
        init(injector: Injector) {
            deliveryService = injector.get(DeliveryService);
        },
        async onTransitionStart(fromState, toState, { ctx, order }) {
            if (toState !== 'ArrangingPayment') return;
            const date = (order.customFields as { preferredDeliveryDate?: string | null }).preferredDeliveryDate?.trim();
            if (!date) return;
            if (!isValidDate(date)) return 'Please choose your delivery date again; we couldn’t read the date chosen.';

            const promise = await deliveryService.promise(ctx, order.shippingAddress ?? {});
            if (date < promise.earliestDispatchDate) {
                return `The earliest delivery date we can offer is ${dateLabel(promise.earliestDispatchDate)}. Please choose that date or later.`;
            }
            const rules = await deliveryService.dispatchRules(ctx);
            if (!isDispatchDay(date, rules)) {
                return rules.closedDates.has(date)
                    ? `We’re closed on ${dateLabel(date)}. Please choose another delivery date.`
                    : `We don’t deliver on ${weekdayName(weekdayOf(date))}s. Please choose another delivery date.`;
            }
        },
    };
}
