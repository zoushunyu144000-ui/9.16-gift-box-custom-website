import { FulfillmentHandler, LanguageCode } from '@vendure/core';
import { ResolvedCouriersOptions } from '../options';
import { CourierBookingService } from '../services/courier-booking.service';

const en = (value: string) => [{ languageCode: LanguageCode.en, value }];

/**
 * Same-day delivery in KL & Selangor: quotes and books a Lalamove driver from the shop to the order's
 * shipping address. trackingCode = Lalamove order id, trackingUrl = Lalamove's live share link.
 * Cancelling the fulfillment cancels the Lalamove order (allowed while a driver is being assigned or
 * within 5 minutes of a match; otherwise the cancellation is refused with Lalamove's reason).
 */
export function createLalamoveHandler(options: ResolvedCouriersOptions) {
    let booking: CourierBookingService;
    return new FulfillmentHandler({
        code: 'lalamove',
        description: en('Lalamove same-day delivery: books a driver from the shop to the shipping address'),
        args: {
            serviceType: {
                type: 'string',
                required: false,
                defaultValue: options.lalamove.defaultServiceType,
                label: en('Vehicle'),
                description: en('Lalamove service type, e.g. MOTORCYCLE or CAR (keys: GET /delivery/lalamove/service-types)'),
            },
            scheduleAt: {
                type: 'datetime',
                required: false,
                label: en('Pickup time'),
                description: en(
                    `Empty: now, or for a later preferred delivery date that day at ${options.lalamove.scheduledPickupTime} (Malaysia time).`,
                ),
            },
            remarks: {
                type: 'string',
                required: false,
                label: en('Note for the driver'),
                ui: { component: 'textarea-form-input' },
            },
        },
        init(injector) {
            booking = injector.get(CourierBookingService);
        },
        createFulfillment: (ctx, orders, lines, args) => booking.bookLalamove(ctx, orders, lines, args),
        onFulfillmentTransition: async (fromState, toState, { ctx, fulfillment }) => {
            if (toState === 'Cancelled') return booking.cancelAtProvider(ctx, fulfillment);
        },
    });
}
