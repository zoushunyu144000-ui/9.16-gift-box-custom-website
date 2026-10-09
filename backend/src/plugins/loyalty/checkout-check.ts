import { Injector, OrderProcess, OrderState } from '@vendure/core';
import { LoyaltyService } from './loyalty.service';

/**
 * Before payment: points applied to the bag must still be there to spend (the balance can change, e.g. a
 * staff adjustment) and must still fit the bag. Stopping here, before any payment, is the last safe point.
 */
export function loyaltyCheckoutCheck(): OrderProcess<OrderState> {
    let loyalty: LoyaltyService;
    return {
        init(injector: Injector) {
            loyalty = injector.get(LoyaltyService);
        },
        async onTransitionStart(fromState, toState, { ctx, order }) {
            if (toState !== 'ArrangingPayment') return;
            return loyalty.checkBeforePayment(ctx, order);
        },
    };
}
