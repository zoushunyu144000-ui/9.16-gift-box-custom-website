import { INestApplicationContext } from '@nestjs/common';
import {
    defaultShippingCalculator,
    defaultShippingEligibilityChecker,
    manualFulfillmentHandler,
    RequestContext,
    ShippingMethod,
    ShippingMethodService,
} from '@vendure/core';
import { MalaysianDeliveryPlugin } from './delivery-my.plugin';
import { timeLabel, weekdaysLabel } from './dispatch';
import { CourierTable, PLACEHOLDER_COURIER_TABLE, PLACEHOLDER_PRICE_BANDS, PriceBand } from './pricing';
import { DeliveryZone } from './types';

export const SAME_DAY_METHOD_CODE = 'same-day-delivery';
export const COURIER_METHOD_CODE = 'courier-delivery';

/** Placeholder: charged beyond the last distance band and when Google can't be reached, until the client sets theirs. */
const PLACEHOLDER_SAME_DAY_FALLBACK = 50;

export interface SetupDeliveryMethodsOptions {
    /** Fulfillment handler code for same-day orders, e.g. 'lalamove' once couriers-my is installed. Default: Vendure's manual handler. */
    sameDayFulfillmentHandler?: string;
    /** Fulfillment handler code for courier orders, e.g. 'easyparcel' once couriers-my is installed. Default: Vendure's manual handler. */
    courierFulfillmentHandler?: string;
    /** Ringgit by road distance. Default: placeholder bands RM15 (5 km) to RM45 (45 km). */
    sameDayPriceBands?: PriceBand[];
    /** Ringgit beyond the last band or when the distance is unknown; null = not offered beyond the last band. Default: RM50 (placeholder). */
    sameDayFallbackPrice?: number | null;
    /** Ringgit per zone, used without live courier rates. Default: placeholder rates. */
    courierRates?: CourierTable;
    /** Markup on live courier rates, %. Default 0. */
    courierMarkupPercent?: number;
    /**
     * Existing methods to switch off, by code. Default: flat rates charged on every order (Vendure's default checker
     * with no minimum and default calculator above RM0), i.e. the placeholder rate from store.json. Free ones, such
     * as store pickup, are left alone.
     */
    disableMethodCodes?: string[];
}

export interface SetupDeliveryMethodsResult {
    created: string[];
    alreadyThere: string[];
    disabled: string[];
}

const argValue = (operation: { args: Array<{ name: string; value: string }> }, name: string) =>
    operation.args.find(arg => arg.name === name)?.value;

/** The placeholder the shop setup creates from store.json: one flat price for every order. */
function isFlatPlaceholder(method: ShippingMethod): boolean {
    return (
        method.calculator.code === defaultShippingCalculator.code &&
        Number(argValue(method.calculator, 'rate') ?? 0) > 0 &&
        method.checker.code === defaultShippingEligibilityChecker.code &&
        Number(argValue(method.checker, 'orderMinimum') ?? 0) === 0
    );
}

const zonesChecker = (zones: DeliveryZone[]) => ({
    code: 'my-postcode-zone',
    arguments: [{ name: 'zones', value: JSON.stringify(zones) }],
});

/**
 * Creates the shop's two delivery methods, "Same-day delivery (KL & Selangor)" and "Courier delivery", and switches
 * off the old flat-rate method. Safe to run again: methods that already exist (by code) are left as staff edited them.
 * Needs MalaysianDeliveryPlugin in the config the app was bootstrapped with.
 */
export async function setupDeliveryMethods(
    app: INestApplicationContext,
    ctx: RequestContext,
    opts: SetupDeliveryMethodsOptions = {},
): Promise<SetupDeliveryMethodsResult> {
    const options = MalaysianDeliveryPlugin.options;
    if (!options) throw new Error('setupDeliveryMethods needs MalaysianDeliveryPlugin.init({ … }) in the Vendure config.');
    const shippingMethodService = app.get(ShippingMethodService);
    const { items: existing } = await shippingMethodService.findAll(ctx);
    const result: SetupDeliveryMethodsResult = { created: [], alreadyThere: [], disabled: [] };

    const fallback = opts.sameDayFallbackPrice === undefined ? PLACEHOLDER_SAME_DAY_FALLBACK : opts.sameDayFallbackPrice;
    const methods = [
        {
            code: SAME_DAY_METHOD_CODE,
            name: `Same-day delivery (${options.zoneLabels['klang-valley']})`,
            description: `By Lalamove, the same day for orders confirmed before ${timeLabel(options.cutoffTime)}, ${weekdaysLabel(options.dispatchWeekdays)}.`,
            fulfillmentHandler: opts.sameDayFulfillmentHandler ?? manualFulfillmentHandler.code,
            checker: zonesChecker(['klang-valley']),
            calculator: {
                code: 'my-distance-zones',
                arguments: [
                    { name: 'priceBands', value: JSON.stringify(opts.sameDayPriceBands ?? PLACEHOLDER_PRICE_BANDS) },
                    { name: 'fallbackPrice', value: fallback === null ? '' : String(fallback) },
                    { name: 'taxRate', value: '0' },
                ],
            },
        },
        {
            code: COURIER_METHOD_CODE,
            name: 'Courier delivery',
            description: `Sent by courier; delivery normally takes ${options.courierDeliveryTime}.`,
            fulfillmentHandler: opts.courierFulfillmentHandler ?? manualFulfillmentHandler.code,
            checker: zonesChecker(['peninsular', 'sabah-labuan', 'sarawak']),
            calculator: {
                code: 'my-courier-rates',
                arguments: [
                    { name: 'rateTable', value: JSON.stringify(opts.courierRates ?? PLACEHOLDER_COURIER_TABLE) },
                    { name: 'useLiveRates', value: 'true' },
                    { name: 'allowedCouriers', value: '[]' },
                    { name: 'markupPercent', value: String(opts.courierMarkupPercent ?? 0) },
                    { name: 'volumetricDivisor', value: '5000' },
                    { name: 'taxRate', value: '0' },
                ],
            },
        },
    ];
    for (const { name, description, ...method } of methods) {
        if (existing.some(m => m.code === method.code)) {
            result.alreadyThere.push(method.code);
            continue;
        }
        await shippingMethodService.create(ctx, { ...method, translations: [{ languageCode: ctx.languageCode, name, description }] });
        result.created.push(method.code);
    }

    const ours = [SAME_DAY_METHOD_CODE, COURIER_METHOD_CODE];
    for (const method of existing) {
        if (ours.includes(method.code)) continue;
        const wanted = opts.disableMethodCodes ? opts.disableMethodCodes.includes(method.code) : isFlatPlaceholder(method);
        const alreadyOff = method.checker.code === 'my-postcode-zone' && method.checker.args.every(a => a.name !== 'zones' || a.value === '[]');
        if (!wanted || alreadyOff) continue;
        // Shipping methods have no on/off switch: with no zones ticked this one matches no address. Staff can
        // bring it back by ticking zones in its eligibility checker, or delete it.
        await shippingMethodService.update(ctx, { id: method.id, checker: zonesChecker([]), translations: [] });
        result.disabled.push(method.code);
    }
    return result;
}
