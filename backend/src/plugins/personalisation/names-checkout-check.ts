import { Injector, OrderLine, OrderProcess, OrderState, TransactionalConnection } from '@vendure/core';
import { PersonalisationOptions } from './names';

/**
 * Before payment: every names line must still have its gift in the order (a customer can remove the
 * box and leave the names behind).
 */
export function namesCheckoutCheck(options: PersonalisationOptions): OrderProcess<OrderState> {
    let connection: TransactionalConnection;
    return {
        init(injector: Injector) {
            connection = injector.get(TransactionalConnection);
        },
        async onTransitionStart(fromState, toState, { ctx, order }) {
            if (toState !== 'ArrangingPayment') return;
            const lines = await connection.getRepository(ctx, OrderLine).find({
                where: { order: { id: order.id } },
                relations: { productVariant: { product: true } },
            });
            const skus = new Set(lines.map(l => l.productVariant.sku));
            for (const line of lines) {
                if (line.productVariant.sku !== options.namesSku) continue;
                const namesFor = (line.customFields as { namesFor?: string | null }).namesFor;
                if (!namesFor || !skus.has(namesFor)) {
                    return 'Some personalised names are no longer with their gift. Please add the gift again or remove the names.';
                }
            }
        },
    };
}
