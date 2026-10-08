import { Injector, LanguageCode, OrderLine, OrderProcess, OrderState, PluginCommonModule, TransactionalConnection, VendurePlugin } from '@vendure/core';

export interface AgeCheckOptions {
    /** Products or variants with a value of this facet (e.g. "alcohol: Contains alcohol") need the check. */
    facetCode: string;
    /** Malaysia: 21. */
    minimumAge: number;
}

/**
 * Orders with age-restricted items (alcohol) need the customer to confirm their age before payment.
 * Mark items with a value of the configured facet, on the product or on just some variants
 * (e.g. a gift box whose upgraded version adds wine). The storefront sets Order.customFields.ageConfirmed.
 */
@VendurePlugin({
    imports: [PluginCommonModule],
    compatibility: '^3.0.0',
    configuration: config => {
        config.customFields.Order.push({
            name: 'ageConfirmed',
            type: 'boolean',
            defaultValue: false,
            label: [{ languageCode: LanguageCode.en, value: 'Age confirmed' }],
        });
        config.orderOptions.process = [...(config.orderOptions.process ?? []), ageCheck(AgeCheckPlugin.options)];
        return config;
    },
})
export class AgeCheckPlugin {
    static options: AgeCheckOptions = { facetCode: 'alcohol', minimumAge: 21 };

    static init(options: Partial<AgeCheckOptions> = {}) {
        this.options = { ...this.options, ...options };
        return AgeCheckPlugin;
    }
}

function ageCheck({ facetCode, minimumAge }: AgeCheckOptions): OrderProcess<OrderState> {
    let connection: TransactionalConnection;
    return {
        init(injector: Injector) {
            connection = injector.get(TransactionalConnection);
        },
        async onTransitionStart(fromState, toState, { ctx, order }) {
            if (toState !== 'ArrangingPayment') return;
            if ((order.customFields as { ageConfirmed?: boolean }).ageConfirmed) return;
            const lines = await connection.getRepository(ctx, OrderLine).find({
                where: { order: { id: order.id } },
                relations: { productVariant: { facetValues: { facet: true }, product: { facetValues: { facet: true } } } },
            });
            const restricted = lines.some(l =>
                [...l.productVariant.facetValues, ...l.productVariant.product.facetValues].some(fv => fv.facet.code === facetCode),
            );
            if (restricted) return `Please confirm you are ${minimumAge} or older to buy items containing alcohol.`;
        },
    };
}
