import {
    idsAreEqual,
    Injector,
    Logger,
    Order,
    ProductVariant,
    RequestContext,
    ShippingCalculator,
    ShippingEligibilityChecker,
    TransactionalConnection,
} from '@vendure/core';
import { In } from 'typeorm';
import { en, loggerCtx } from './constants';
import { DistanceService } from './distance.service';
import { LiveRateService } from './live-rate.service';
import { resolvePlace } from './postcodes';
import { DEFAULT_VOLUMETRIC_DIVISOR, ParcelItem, PLACEHOLDER_COURIER_TABLE, PLACEHOLDER_PRICE_BANDS } from './pricing';
import { courierQuote, sameDayQuote } from './quotes';
import { DELIVERY_ZONES, MalaysianDeliveryOptions } from './types';

const log = (message: string) => Logger.warn(message, loggerCtx);

/** A list arg as the dashboard saves it, or typed as "peninsular, sarawak". */
function stringList(value: string[] | string | undefined): string[] {
    const items = Array.isArray(value) ? value : (value ?? '').split(',');
    return items.map(item => item.trim()).filter(Boolean);
}

const taxRateArg = {
    type: 'float' as const,
    defaultValue: 0,
    ui: { component: 'number-form-input', suffix: '%', min: 0 },
    label: en('Tax rate'),
    description: en('Tax on delivery. The prices above include it when the shop’s prices include tax (channel setting), like product prices.'),
};

/** Eligibility: the shipping address's delivery zone (from its postcode) is one of the ticked zones. */
export function postcodeZoneChecker(options: MalaysianDeliveryOptions) {
    return new ShippingEligibilityChecker({
        code: 'my-postcode-zone',
        description: en('Delivery zone from the postcode (Malaysia)'),
        args: {
            zones: {
                type: 'string',
                list: true,
                ui: {
                    component: 'select-form-input',
                    options: DELIVERY_ZONES.map(zone => ({ value: zone, label: en(`${options.zoneLabels[zone]} (${zone})`) })),
                },
                label: en('Zones'),
                description: en('Offer this method to addresses in these zones. The zone comes from the postcode; postcodes not in the official table go by the state the customer chose.'),
            },
        },
        check: (ctx, order, args) => {
            const zones = stringList(args.zones as string[] | string | undefined);
            return zones.includes(resolvePlace(order.shippingAddress, options.includePutrajaya).zone);
        },
    });
}

/** Same-day (Lalamove) price by road distance from the shop. */
export function distanceZonesCalculator(options: MalaysianDeliveryOptions) {
    let distances: DistanceService;
    return new ShippingCalculator({
        code: 'my-distance-zones',
        description: en('Price by road distance from the shop (same-day)'),
        args: {
            priceBands: {
                type: 'string',
                defaultValue: JSON.stringify(PLACEHOLDER_PRICE_BANDS),
                ui: { component: 'json-editor-form-input' },
                label: en('Price by road distance (RM)'),
                description: en('Nearest first: [{"upToKm":5,"price":15},{"upToKm":10,"price":20}]. Distance by road from the shop, from Google Maps.'),
            },
            fallbackPrice: {
                type: 'string',
                defaultValue: '',
                label: en('Fallback price (RM)'),
                description: en('Charged beyond the last band, and whenever the distance can’t be worked out (Google slow, down or not set up). Leave empty to not offer this method beyond the last band.'),
            },
            taxRate: taxRateArg,
        },
        init(injector: Injector) {
            distances = injector.get(DistanceService);
        },
        calculate: async (ctx, order, args) => {
            const place = resolvePlace(order.shippingAddress, options.includePutrajaya);
            const quote = await sameDayQuote(place, args, (postcode, destination) => distances.distanceKm(postcode, destination), log);
            if (!quote) return undefined;
            return { price: quote.priceSen, priceIncludesTax: ctx.channel.pricesIncludeTax, taxRate: args.taxRate ?? 0, metadata: quote.metadata };
        },
    });
}

/** Weight and size of what's in the order, from each variant's delivery fields. */
async function parcelItems(ctx: RequestContext, order: Order, connection: TransactionalConnection): Promise<ParcelItem[]> {
    const lines = order.lines ?? [];
    // Orders loaded by Vendure carry their variants; anything that doesn't is fetched in one go.
    const missingIds = lines.filter(line => !line.productVariant && line.productVariantId != null).map(line => line.productVariantId);
    const fetched = missingIds.length ? await connection.getRepository(ctx, ProductVariant).find({ where: { id: In(missingIds) } }) : [];
    return lines.map(line => {
        const variant = line.productVariant ?? fetched.find(v => idsAreEqual(v.id, line.productVariantId));
        const { weightGrams, lengthCm, widthCm, heightCm } = (variant?.customFields ?? {}) as Omit<ParcelItem, 'quantity'>;
        return { quantity: line.quantity, weightGrams, lengthCm, widthCm, heightCm };
    });
}

/** Outstation courier price: live rates when a provider answers, else a zone × weight table. */
export function courierRatesCalculator(options: MalaysianDeliveryOptions) {
    let liveRates: LiveRateService;
    let connection: TransactionalConnection;
    return new ShippingCalculator({
        code: 'my-courier-rates',
        description: en('Courier price by zone and weight (live rates when available)'),
        args: {
            rateTable: {
                type: 'string',
                defaultValue: JSON.stringify(PLACEHOLDER_COURIER_TABLE),
                ui: { component: 'json-editor-form-input' },
                label: en('Rates by zone (RM)'),
                description: en('Used when there are no live courier rates: {"peninsular":{"firstKg":10,"eachExtraKg":3}, …}. Zones: peninsular, sabah-labuan, sarawak, klang-valley. Weight is rounded up to the next kg.'),
            },
            useLiveRates: {
                type: 'boolean',
                defaultValue: true,
                label: en('Use live courier rates when available'),
            },
            allowedCouriers: {
                type: 'string',
                list: true,
                label: en('Allowed couriers'),
                description: en('Live rates only, e.g. “J&T”, “Pos Laju”. Leave empty to allow any courier.'),
            },
            markupPercent: {
                type: 'float',
                defaultValue: 0,
                ui: { component: 'number-form-input', suffix: '%', min: 0 },
                label: en('Markup on live rates'),
                description: en('Added to the cheapest courier price, then rounded up to the next RM1.'),
            },
            volumetricDivisor: {
                type: 'int',
                defaultValue: DEFAULT_VOLUMETRIC_DIVISOR,
                label: en('Volumetric divisor'),
                description: en('Volumetric weight (kg) = length × width × height (cm) ÷ this number; each item counts at the greater of its weight and volumetric weight.'),
            },
            taxRate: taxRateArg,
        },
        init(injector: Injector) {
            liveRates = injector.get(LiveRateService);
            connection = injector.get(TransactionalConnection);
        },
        calculate: async (ctx, order, args) => {
            const place = resolvePlace(order.shippingAddress, options.includePutrajaya);
            const quote = await courierQuote({
                place,
                items: await parcelItems(ctx, order, connection),
                args: { ...args, allowedCouriers: stringList(args.allowedCouriers as string[] | string | undefined) },
                fromPostcode: options.origin.postcode,
                liveRates: liveRates.hasProviders ? request => liveRates.rates(ctx, request) : undefined,
                liveRateMaxKg: options.liveRateMaxKg,
                log,
            });
            if (!quote) return undefined;
            return { price: quote.priceSen, priceIncludesTax: ctx.channel.pricesIncludeTax, taxRate: args.taxRate ?? 0, metadata: quote.metadata };
        },
    });
}

