import { LanguageCode, PluginCommonModule, VendurePlugin } from '@vendure/core';
import { adminApiExtensions, shopApiExtensions } from './api/api-extensions';
import { LoyaltyAdminResolver } from './api/admin.resolver';
import { ApplyLoyaltyPointsResultResolver, LoyaltyShopResolver } from './api/shop.resolver';
import { loyaltyCheckoutCheck } from './checkout-check';
import { LOYALTY_OPTIONS } from './constants';
import { LoyaltyPointsEntry } from './loyalty-points-entry.entity';
import { LoyaltyService } from './loyalty.service';
import { assertValidLoyaltyOptions, DEFAULT_LOYALTY_OPTIONS, LoyaltyOptions } from './points';
import { createLoyaltyPromotionOperations } from './promotion';

const en = (value: string) => [{ languageCode: LanguageCode.en, value }];

/**
 * Member points.
 *
 * - Earn: registered customers get floor(products total after discounts, in ringgit) × pointsPerRinggit when
 *   an order reaches `earnOnState`; once per order, taken back if the order is cancelled.
 * - Redeem: the Shop API's applyLoyaltyPoints stores the points on the active order; a promotion (created by
 *   setupLoyalty) turns them into a discount. They leave the balance when the order is placed and come back
 *   if it is cancelled.
 * - Every change is a LoyaltyPointsEntry; Customer.customFields.loyaltyPoints is the running balance, updated
 *   in the same transaction. Staff see the balance and history on the customer page and can adjust it.
 */
@VendurePlugin({
    imports: [PluginCommonModule],
    compatibility: '^3.0.0',
    entities: [LoyaltyPointsEntry],
    providers: [LoyaltyService, { provide: LOYALTY_OPTIONS, useFactory: () => LoyaltyPlugin.options }],
    shopApiExtensions: { schema: shopApiExtensions, resolvers: [LoyaltyShopResolver, ApplyLoyaltyPointsResultResolver] },
    adminApiExtensions: { schema: adminApiExtensions, resolvers: [LoyaltyAdminResolver] },
    dashboard: './dashboard/index.tsx',
    configuration: config => {
        const options = LoyaltyPlugin.options;
        config.customFields.Customer.push({
            name: 'loyaltyPoints',
            type: 'int',
            defaultValue: 0,
            nullable: false,
            // Changed only through the ledger (orders and staff adjustments), so it always matches the history.
            readonly: true,
            public: true,
            label: en('Loyalty points'),
            description: en('Current balance.'),
            // Shown with its history in the Loyalty points block instead.
            ui: { dashboard: false },
        });
        config.customFields.Order.push({
            name: 'loyaltyPointsApplied',
            type: 'int',
            defaultValue: 0,
            nullable: false,
            // Set only by applyLoyaltyPoints, which checks the balance and limits.
            readonly: true,
            public: true,
            label: en('Loyalty points used'),
        });
        const { condition, action } = createLoyaltyPromotionOperations(options);
        config.promotionOptions.promotionConditions = [...(config.promotionOptions.promotionConditions ?? []), condition];
        config.promotionOptions.promotionActions = [...(config.promotionOptions.promotionActions ?? []), action];
        config.orderOptions.process = [...(config.orderOptions.process ?? []), loyaltyCheckoutCheck()];
        return config;
    },
})
export class LoyaltyPlugin {
    static options: LoyaltyOptions = { ...DEFAULT_LOYALTY_OPTIONS };

    static init(options: Partial<LoyaltyOptions> = {}) {
        const merged = { ...DEFAULT_LOYALTY_OPTIONS, ...options };
        assertValidLoyaltyOptions(merged);
        this.options = merged;
        return LoyaltyPlugin;
    }
}
