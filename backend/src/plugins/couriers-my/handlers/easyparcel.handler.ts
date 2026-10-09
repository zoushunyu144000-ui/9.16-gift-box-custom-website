import { FulfillmentHandler, LanguageCode } from '@vendure/core';
import { ResolvedCouriersOptions } from '../options';
import { CourierBookingService } from '../services/courier-booking.service';

const en = (value: string) => [{ languageCode: LanguageCode.en, value }];

/**
 * Outstation couriers through EasyParcel: quotes the parcel, books the chosen (or cheapest) service and
 * returns the AWB as trackingCode, plus the label and tracking links. Booking debits the merchant's
 * prepaid EasyParcel wallet. Cancelling the fulfillment cancels the shipment while the courier hasn't
 * processed it yet.
 */
export function createEasyParcelHandler(options: ResolvedCouriersOptions) {
    let booking: CourierBookingService;
    return new FulfillmentHandler({
        code: 'easyparcel',
        description: en('EasyParcel courier (Pos Laju, J&T, DHL eCommerce, City-Link…): books the parcel and prints an AWB label'),
        args: {
            service: {
                type: 'string',
                required: false,
                defaultValue: 'cheapest',
                label: en('Courier'),
                description: en('"cheapest", a courier name (e.g. Pos Laju, J&T, City-Link) or an EasyParcel service id (EP-CS…)'),
            },
            labelSize: {
                type: 'string',
                required: false,
                defaultValue: options.easyParcel.defaultLabelSize,
                label: en('Label size'),
                ui: {
                    component: 'select-form-input',
                    options: [
                        { value: 'A6', label: en('A6 (thermal label printer)') },
                        { value: 'A5', label: en('A5') },
                        { value: 'A4', label: en('A4 (office printer)') },
                    ],
                },
            },
            weightKg: {
                type: 'float',
                required: false,
                label: en('Parcel weight (kg)'),
                description: en(`Empty: from the product weights, else ${options.defaultParcel.weightKg} kg`),
            },
            lengthCm: { type: 'int', required: false, label: en('Length (cm)') },
            widthCm: { type: 'int', required: false, label: en('Width (cm)') },
            heightCm: { type: 'int', required: false, label: en('Height (cm)') },
            collectionDate: {
                type: 'string',
                required: false,
                label: en('Collection date'),
                description: en('YYYY-MM-DD. Empty: today (Monday when today is Sunday).'),
            },
        },
        init(injector) {
            booking = injector.get(CourierBookingService);
        },
        createFulfillment: (ctx, orders, lines, args) =>
            booking.bookEasyParcel(ctx, orders, lines, {
                ...args,
                // Vendure turns empty number arguments into NaN.
                weightKg: Number.isFinite(args.weightKg) ? args.weightKg : undefined,
                lengthCm: Number.isFinite(args.lengthCm) ? args.lengthCm : undefined,
                widthCm: Number.isFinite(args.widthCm) ? args.widthCm : undefined,
                heightCm: Number.isFinite(args.heightCm) ? args.heightCm : undefined,
            }),
        onFulfillmentTransition: async (fromState, toState, { ctx, fulfillment }) => {
            if (toState === 'Cancelled') return booking.cancelAtProvider(ctx, fulfillment);
        },
    });
}
