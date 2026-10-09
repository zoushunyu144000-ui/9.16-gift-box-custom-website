import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Order, Permission, PERMISSIONS_METADATA_KEY, Promotion, RequestContext, RuntimeVendureConfig } from '@vendure/core';
import { LoyaltyAdminResolver } from './api/admin.resolver';
import { LoyaltyShopResolver } from './api/shop.resolver';
import { LoyaltyPlugin } from './loyalty.plugin';
import { DEFAULT_LOYALTY_OPTIONS } from './points';
import { createLoyaltyPromotionOperations, LOYALTY_ACTION_CODE, LOYALTY_CONDITION_CODE } from './promotion';

const allowed = (resolver: { prototype: object }, method: string) =>
    Reflect.getMetadata(PERMISSIONS_METADATA_KEY, (resolver.prototype as Record<string, unknown>)[method]);

function configure() {
    const config = {
        customFields: { Customer: [], Order: [] },
        promotionOptions: { promotionConditions: [], promotionActions: [] },
        orderOptions: { process: [] },
    } as unknown as RuntimeVendureConfig;
    return Reflect.getMetadata('configuration', LoyaltyPlugin)(config) as RuntimeVendureConfig;
}

describe('loyalty plugin wiring', () => {
    it('keeps the balance read-only and visible to the customer', () => {
        const field = configure().customFields.Customer.find(f => f.name === 'loyaltyPoints');
        assert.ok(field);
        assert.equal(field.type, 'int');
        assert.equal(field.defaultValue, 0);
        assert.equal(field.nullable, false);
        assert.equal(field.readonly, true);
        assert.equal(field.public, true);
    });

    it('stores the points requested on the order, settable only through applyLoyaltyPoints', () => {
        const field = configure().customFields.Order.find(f => f.name === 'loyaltyPointsApplied');
        assert.ok(field);
        assert.equal(field.readonly, true);
        assert.equal(field.defaultValue, 0);
    });

    it('registers its promotion condition and action, and the checkout check', () => {
        const config = configure();
        assert.deepEqual(config.promotionOptions.promotionConditions?.map(c => c.code), [LOYALTY_CONDITION_CODE]);
        assert.deepEqual(config.promotionOptions.promotionActions?.map(a => a.code), [LOYALTY_ACTION_CODE]);
        assert.equal(config.orderOptions.process?.length, 1);
    });

    it('refuses invalid options at start-up', () => {
        assert.throws(() => LoyaltyPlugin.init({ pointValueSen: 0 }), /pointValueSen/);
        LoyaltyPlugin.init({});
        assert.deepEqual(LoyaltyPlugin.options, DEFAULT_LOYALTY_OPTIONS);
    });

    it('guards the APIs with the contract’s permissions', () => {
        assert.deepEqual(allowed(LoyaltyAdminResolver, 'adjustLoyaltyPoints'), [Permission.UpdateCustomer]);
        assert.deepEqual(allowed(LoyaltyAdminResolver, 'customerLoyaltyHistory'), [Permission.ReadCustomer]);
        assert.deepEqual(allowed(LoyaltyShopResolver, 'applyLoyaltyPoints'), [Permission.Owner]);
        assert.deepEqual(allowed(LoyaltyShopResolver, 'loyaltyHistory'), [Permission.Authenticated]);
        assert.deepEqual(allowed(LoyaltyShopResolver, 'loyaltySettings'), [Permission.Public]);
    });
});

describe('points discount promotion', () => {
    const { condition, action } = createLoyaltyPromotionOperations(DEFAULT_LOYALTY_OPTIONS);
    const ctx = { channel: { pricesIncludeTax: true } } as unknown as RequestContext;
    const promotion = {} as Promotion;
    const order = (points: number, subTotalWithTax: number, orderPlacedAt?: Date) =>
        ({ customFields: { loyaltyPointsApplied: points }, subTotal: subTotalWithTax, subTotalWithTax, orderPlacedAt }) as unknown as Order;

    it('applies when the points fit the order, passing them to the action', async () => {
        assert.deepEqual(await condition.check(ctx, order(1000, 40000), [], promotion), { points: 1000 });
        assert.deepEqual(await condition.check(ctx, order(2000, 4000), [], promotion), { points: 2000 }); // exactly half
    });

    it('does not apply without points, below the minimum or above half the subtotal', async () => {
        assert.equal(await condition.check(ctx, order(0, 40000), [], promotion), false);
        assert.equal(await condition.check(ctx, order(499, 40000), [], promotion), false);
        assert.equal(await condition.check(ctx, order(2001, 4000), [], promotion), false);
    });

    it('takes exactly the points’ value off', async () => {
        const state = { [LOYALTY_CONDITION_CODE]: { points: 1000 } };
        assert.equal(await action.execute(ctx, order(1000, 40000), [], state, promotion), -1000);
    });

    it('keeps the discount on a placed order whose points were taken, even after staff change it', async () => {
        const placed = order(2000, 3000, new Date()); // items cut to RM 30 after 2,000 points were used
        assert.deepEqual(await condition.check(ctx, placed, [], promotion), { points: 2000 });
        const state = { [LOYALTY_CONDITION_CODE]: { points: 2000 } };
        assert.equal(await action.execute(ctx, placed, [], state, promotion), -2000);
        // ...but never takes off more than the items cost.
        assert.equal(await action.execute(ctx, order(2000, 1500, new Date()), [], state, promotion), -1500);
    });

    it('applies only together with its condition', () => {
        assert.deepEqual(action.conditions?.map(c => c.code), [LOYALTY_CONDITION_CODE]);
    });

    it('is applied after other promotions', () => {
        assert.ok(condition.priorityValue > 10);
    });
});
