import { LanguageCode, PromotionCondition, PromotionOrderAction } from '@vendure/core';
import { LoyaltyOptions, maxRedeemablePoints, pointsRequestedOn, pointsValue, productsSubtotalSen } from './points';

export const LOYALTY_CONDITION_CODE = 'loyalty_points_used';
export const LOYALTY_ACTION_CODE = 'loyalty_points_discount';

/**
 * The points discount goes through Vendure's promotions, so it shows on the order like any other discount
 * (order.discounts, totals, emails, refunds). setupLoyalty() creates the promotion that uses these two.
 *
 * The condition passes only when the points asked for fit the order (minimum, share of the subtotal), so the
 * discount is always exactly the points' value and the points taken when the order is placed match it.
 * The balance is checked when points are applied and again before payment rather than here, because prices
 * are recalculated on every change to the bag and that should not need the database.
 */
export function createLoyaltyPromotionOperations(options: LoyaltyOptions) {
    const condition = new PromotionCondition({
        code: LOYALTY_CONDITION_CODE,
        description: [{ languageCode: LanguageCode.en, value: 'The customer uses loyalty points on the order' }],
        args: {},
        // Promotions run in order of priority score: this one goes last, so points pay for what other discounts leave.
        priorityValue: 1000,
        check(ctx, order) {
            const points = pointsRequestedOn(order);
            if (points === 0 || points < options.minRedeemPoints) return false;
            const subtotal = productsSubtotalSen(order, ctx.channel.pricesIncludeTax);
            return points <= maxRedeemablePoints(subtotal, options) ? { points } : false;
        },
    });

    const action = new PromotionOrderAction({
        code: LOYALTY_ACTION_CODE,
        description: [{ languageCode: LanguageCode.en, value: 'Take the value of the loyalty points used off the order' }],
        args: {},
        conditions: [condition],
        execute(ctx, order, args, state) {
            return -pointsValue(state[LOYALTY_CONDITION_CODE].points, options.pointValueSen);
        },
    });

    return { condition, action };
}
