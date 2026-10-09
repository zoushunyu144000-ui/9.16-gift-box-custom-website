import { OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { InjectableStrategy, Injector, Logger, PluginCommonModule, VendurePlugin } from '@vendure/core';
import { DeliveryShopResolver, shopApiExtensions } from './api';
import { DELIVERY_MY_OPTIONS, en, loggerCtx } from './constants';
import { DeliveryDistance } from './delivery-distance.entity';
import { deliveryDateCheck } from './delivery-date-check';
import { DeliveryService } from './delivery.service';
import { isValidDate, minutesOf, parseClosedDates } from './dispatch';
import { DistanceService } from './distance.service';
import { LiveRateService } from './live-rate.service';
import { postcodeTable } from './postcodes';
import { courierRatesCalculator, distanceZonesCalculator, postcodeZoneChecker } from './shipping';
import { DeliveryZone, MalaysianDeliveryOptions, ShopOrigin } from './types';

export type MalaysianDeliveryInitOptions = Partial<Omit<MalaysianDeliveryOptions, 'origin' | 'zoneLabels'>> & {
    origin: ShopOrigin;
    zoneLabels?: Partial<Record<DeliveryZone, string>>;
};

const DEFAULTS: Omit<MalaysianDeliveryOptions, 'origin' | 'zoneLabels'> = {
    includePutrajaya: false,
    cutoffTime: '15:00',
    dispatchWeekdays: [1, 2, 3, 4, 5, 6],
    closedDates: [],
    courierDeliveryTime: '3–5 days',
    liveRateProviders: [],
    timeoutMs: 2500,
    distanceCacheDays: 30,
    liveRateCacheHours: 24,
    liveRateMaxKg: 30,
    deliveryNotesMaxLength: 500,
};

/** Checks the options once at startup, so a typo stops the server with a clear message instead of odd prices. */
function resolveOptions(input: MalaysianDeliveryInitOptions): MalaysianDeliveryOptions {
    // An option given as undefined or null keeps its default.
    const given = Object.fromEntries(Object.entries(input).filter(([, value]) => value != null)) as MalaysianDeliveryInitOptions;
    const options = { ...DEFAULTS, ...given };
    const { origin } = options;
    if (!origin || !Number.isFinite(origin.latitude) || !Number.isFinite(origin.longitude) || !/^\d{5}$/.test(origin.postcode ?? '')) {
        throw new Error('MalaysianDeliveryPlugin.init() needs origin: { latitude, longitude, address, postcode } of the shop’s pickup point.');
    }
    minutesOf(options.cutoffTime);
    if (!options.dispatchWeekdays.length || options.dispatchWeekdays.some(d => !Number.isInteger(d) || d < 0 || d > 6)) {
        throw new Error('MalaysianDeliveryPlugin: dispatchWeekdays must list days 0 (Sunday) to 6 (Saturday).');
    }
    const badDates = options.closedDates.filter(d => !isValidDate(d));
    if (badDates.length) throw new Error(`MalaysianDeliveryPlugin: closedDates must be YYYY-MM-DD (got ${badDates.join(', ')}).`);
    return {
        ...options,
        zoneLabels: {
            'klang-valley': options.includePutrajaya ? 'KL, Selangor & Putrajaya' : 'KL & Selangor',
            peninsular: 'Peninsular Malaysia',
            'sabah-labuan': 'Sabah & Labuan',
            sarawak: 'Sarawak',
            unknown: 'Postcode not found',
            ...Object.fromEntries(Object.entries(given.zoneLabels ?? {}).filter(([, label]) => label)),
        },
    };
}

/**
 * Delivery for Malaysian shops: zones from the postcode, dispatch dates, and delivery prices at checkout.
 *
 * - Zone from the postcode (official data.gov.my table): klang-valley (KL, Selangor; Putrajaya by option),
 *   peninsular, sabah-labuan, sarawak, else unknown. Postcodes not in the table go by the province given.
 * - Dispatch: orders confirmed before the cut-off (Malaysian time) on a dispatch day go out that day; Sundays
 *   and closed dates (option + Global settings, edited by staff) roll to the next dispatch day.
 * - Shipping methods use the `my-postcode-zone` checker with `my-distance-zones` (same-day, road distance from the
 *   shop via Google) or `my-courier-rates` (live rates from a registered LiveRateProvider, else a zone × weight table).
 * - Shop API: `deliveryPromise(postalCode)` and `deliveryQuote(input)`; a checkout check on the preferred date.
 */
@VendurePlugin({
    imports: [PluginCommonModule],
    compatibility: '^3.0.0',
    entities: [DeliveryDistance],
    providers: [
        { provide: DELIVERY_MY_OPTIONS, useFactory: () => MalaysianDeliveryPlugin.options },
        DeliveryService,
        DistanceService,
        LiveRateService,
    ],
    shopApiExtensions: { schema: shopApiExtensions, resolvers: [DeliveryShopResolver] },
    configuration: config => {
        const options = MalaysianDeliveryPlugin.options;
        if (!options) throw new Error('Add the plugin as MalaysianDeliveryPlugin.init({ origin: … }) in the Vendure config.');
        config.customFields.GlobalSettings.push({
            name: 'deliveryClosedDates',
            type: 'text',
            nullable: true,
            label: en('Closed dates (no dispatch)'),
            description: en('One date per line as YYYY-MM-DD, e.g. 2026-12-25 Christmas Day (a note after the date is fine). Sundays are always closed. Orders roll to the next working day.'),
            ui: { component: 'textarea-form-input' },
            validate: (value: string | null) => parseClosedDates(value).errors[0],
        });
        config.customFields.Order.push(
            {
                name: 'preferredDeliveryDate',
                type: 'string',
                nullable: true,
                label: en('Preferred delivery date'),
                description: en('YYYY-MM-DD, chosen by the customer. Checked before payment: a dispatch day, on or after the earliest dispatch date.'),
            },
            {
                name: 'deliveryNotes',
                type: 'text',
                nullable: true,
                label: en('Delivery notes'),
                description: en('From the customer, e.g. “Leave it with the guard house.”'),
                validate: (value: string | null) =>
                    value && value.length > options.deliveryNotesMaxLength
                        ? `Delivery notes are limited to ${options.deliveryNotesMaxLength} characters.`
                        : undefined,
            },
        );
        config.customFields.ProductVariant.push(
            {
                name: 'weightGrams',
                type: 'int',
                defaultValue: 1000,
                min: 0,
                label: en('Packed weight (g)'),
                description: en('With its box, for courier prices. 0 for things that add nothing to the parcel, like a personalised name.'),
            },
            { name: 'lengthCm', type: 'int', nullable: true, min: 1, label: en('Packed length (cm)'), description: en('Optional. With width and height, bulky light boxes are charged by size (volumetric weight).') },
            { name: 'widthCm', type: 'int', nullable: true, min: 1, label: en('Packed width (cm)') },
            { name: 'heightCm', type: 'int', nullable: true, min: 1, label: en('Packed height (cm)') },
        );
        config.shippingOptions.shippingEligibilityCheckers.push(postcodeZoneChecker(options));
        config.shippingOptions.shippingCalculators.push(distanceZonesCalculator(options), courierRatesCalculator(options));
        config.orderOptions.process = [...(config.orderOptions.process ?? []), deliveryDateCheck()];
        return config;
    },
})
export class MalaysianDeliveryPlugin implements OnApplicationBootstrap, OnApplicationShutdown {
    static options: MalaysianDeliveryOptions;

    static init(options: MalaysianDeliveryInitOptions) {
        this.options = resolveOptions(options);
        return MalaysianDeliveryPlugin;
    }

    constructor(private moduleRef: ModuleRef) {}

    async onApplicationBootstrap() {
        const { options } = MalaysianDeliveryPlugin;
        // Read the postcode table now, so a missing file stops startup rather than the first checkout.
        Logger.verbose(`Postcode table: ${postcodeTable().size} postcodes`, loggerCtx);
        if (!options.googleMapsApiKey && !process.env.GOOGLE_MAPS_API_KEY) {
            Logger.warn('GOOGLE_MAPS_API_KEY is not set: same-day delivery is charged at its fallback price.', loggerCtx);
        }
        const injector = new Injector(this.moduleRef);
        for (const provider of options.liveRateProviders as Array<InjectableStrategy>) await provider.init?.(injector);
    }

    async onApplicationShutdown() {
        for (const provider of MalaysianDeliveryPlugin.options.liveRateProviders as Array<InjectableStrategy>) await provider.destroy?.();
    }
}
