import { Inject, Injectable } from '@nestjs/common';
import { GlobalSettingsService, ID, OrderTestingService, ProductVariant, RequestContext, TransactionalConnection } from '@vendure/core';
import { IsNull } from 'typeorm';
import { DELIVERY_MY_OPTIONS } from './constants';
import { DeliveryPromise, deliveryPromise, DispatchRules, earliestDispatchDate, parseClosedDates } from './dispatch';
import { AddressLike, resolvePlace } from './postcodes';
import { MalaysianDeliveryOptions } from './types';

export interface DeliveryQuoteInput {
    postalCode: string;
    province?: string | null;
    lines: Array<{ productVariantId: ID; quantity: number }>;
}

export interface DeliveryQuoteOption {
    id: ID;
    code: string;
    name: string;
    description: string;
    priceWithTax: number;
}

/** Staff enter closed dates in Global settings (custom field `deliveryClosedDates`). */
type GlobalSettingsDeliveryFields = { deliveryClosedDates?: string | null };

const MAX_QUOTE_LINES = 100;
const MAX_QUANTITY = 999;

@Injectable()
export class DeliveryService {
    constructor(
        private globalSettingsService: GlobalSettingsService,
        private orderTestingService: OrderTestingService,
        private connection: TransactionalConnection,
        @Inject(DELIVERY_MY_OPTIONS) private options: MalaysianDeliveryOptions,
    ) {}

    /** Cut-off, dispatch days, and closed dates from the plugin options plus Global settings. */
    async dispatchRules(ctx: RequestContext): Promise<DispatchRules> {
        const settings = await this.globalSettingsService.getSettings(ctx);
        // Lines that aren't dates can't be saved (the field validates), so any left over are skipped.
        const { dates } = parseClosedDates((settings.customFields as GlobalSettingsDeliveryFields).deliveryClosedDates);
        return {
            cutoffTime: this.options.cutoffTime,
            dispatchWeekdays: this.options.dispatchWeekdays,
            closedDates: new Set([...this.options.closedDates, ...dates]),
        };
    }

    /** The earliest dispatch date now, with the rules it came from. It's the same for every zone. */
    async earliestDispatch(ctx: RequestContext, now = new Date()): Promise<{ earliest: string; rules: DispatchRules }> {
        const rules = await this.dispatchRules(ctx);
        return { earliest: earliestDispatchDate(now, rules), rules };
    }

    async promise(ctx: RequestContext, address: AddressLike, now = new Date()): Promise<DeliveryPromise> {
        const { zone } = resolvePlace(address, this.options.includePutrajaya);
        return deliveryPromise({
            zone,
            zoneLabel: this.options.zoneLabels[zone],
            now,
            rules: await this.dispatchRules(ctx),
            courierDeliveryTime: this.options.courierDeliveryTime,
        });
    }

    /**
     * Delivery options and prices for a basket before there's an order: the same eligibility checkers and calculators
     * as checkout, run by Vendure's OrderTestingService against a mock order, so the prices match exactly.
     */
    async quote(ctx: RequestContext, input: DeliveryQuoteInput): Promise<DeliveryQuoteOption[]> {
        const lines = input.lines
            .filter(line => line.quantity > 0)
            .slice(0, MAX_QUOTE_LINES)
            .map(line => ({ productVariantId: line.productVariantId, quantity: Math.min(line.quantity, MAX_QUANTITY) }));
        // Only variants this channel sells; anything else is left out rather than failing the whole quote.
        const ids = [...new Set(lines.map(line => String(line.productVariantId)))];
        const variants = ids.length
            ? await this.connection.findByIdsInChannel(ctx, ProductVariant, ids, ctx.channelId, { where: { deletedAt: IsNull() } })
            : [];
        const known = new Set(variants.map(variant => String(variant.id)));

        const quotes = await this.orderTestingService.testEligibleShippingMethods(ctx, {
            shippingAddress: {
                streetLine1: '',
                postalCode: input.postalCode,
                province: input.province ?? '',
                countryCode: 'MY',
            },
            lines: lines.filter(line => known.has(String(line.productVariantId))),
        });
        return quotes.map(quote => ({
            id: quote.id,
            code: quote.code,
            name: quote.name,
            description: quote.description ?? '',
            priceWithTax: quote.priceWithTax,
        }));
    }
}
