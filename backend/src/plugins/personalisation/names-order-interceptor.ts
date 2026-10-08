import {
    idsAreEqual,
    Injector,
    Order,
    OrderInterceptor,
    ProductVariant,
    RequestContext,
    TransactionalConnection,
    WillAddItemToOrderInput,
    WillAdjustOrderLineInput,
} from '@vendure/core';
import { In } from 'typeorm';
import { NAMES_PATTERN, namesLimit, PersonalisationOptions } from './names';

type NamesFields = { names?: string | null; namesFor?: string | null };

/**
 * Names are bought as their own order line: the names variant (namesSku), one unit per name, with the
 * names in `names` and the gift box they belong to in `namesFor` (that box's SKU, already in the order).
 * This checks every add or change of such a line, so the price always matches the names written.
 */
export class NamesOrderInterceptor implements OrderInterceptor {
    private connection: TransactionalConnection;

    constructor(private options: PersonalisationOptions) {}

    init(injector: Injector) {
        this.connection = injector.get(TransactionalConnection);
    }

    async willAddItemToOrder(ctx: RequestContext, order: Order, input: WillAddItemToOrderInput) {
        const fields = (input.customFields ?? {}) as NamesFields;
        if (input.productVariant.sku !== this.options.namesSku) {
            return fields.names || fields.namesFor ? 'Names are added with the personalised name item.' : undefined;
        }
        return this.check(ctx, order, fields, input.quantity);
    }

    async willAdjustOrderLine(ctx: RequestContext, order: Order, input: WillAdjustOrderLineInput) {
        const variant = await this.connection.getRepository(ctx, ProductVariant).findOne({ where: { id: input.orderLine.productVariantId } });
        if (variant?.sku !== this.options.namesSku) return;
        const fields = { ...(input.orderLine.customFields as NamesFields), ...(input.customFields as NamesFields | undefined) };
        return this.check(ctx, order, fields, input.quantity);
    }

    private async check(ctx: RequestContext, order: Order, fields: NamesFields, count: number) {
        const names = fields.names?.trim() ?? '';
        if (!names) return 'Please enter the name to personalise.';
        if (!NAMES_PATTERN.test(names)) return 'Names can only use capital letters A–Z, numbers and basic punctuation.';
        if (!fields.namesFor) return 'Please choose the gift the names are for.';

        const variants = await this.connection.getRepository(ctx, ProductVariant).find({
            where: { id: In(order.lines.map(l => l.productVariantId)) },
            relations: { product: true },
        });
        const box = variants.find(v => v.sku === fields.namesFor && order.lines.some(l => idsAreEqual(l.productVariantId, v.id)));
        if (!box) return 'Please add the gift to your bag before its names.';
        const settings = box.product.customFields as { personalisationEnabled?: boolean; personalisationMaxLength?: number };
        if (settings.personalisationEnabled === false) return `${box.product.name} can’t be personalised.`;
        const limit = namesLimit(settings.personalisationMaxLength || this.options.defaultMaxLength, count);
        if (names.length > limit) return `Please keep to ${limit} characters for ${count === 1 ? 'one name' : `${count} names`}.`;
    }
}
