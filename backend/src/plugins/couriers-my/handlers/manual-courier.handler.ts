import { FulfillmentHandler, LanguageCode } from '@vendure/core';
import { CourierFulfillmentFields } from '../types';

const en = (value: string) => [{ languageCode: LanguageCode.en, value }];

/** Only http(s) links reach customers' emails and the storefront. */
export function trackingLink(value: string | undefined): string | null {
    const link = value?.trim();
    if (!link) return null;
    let url: URL;
    try {
        url = new URL(link);
    } catch {
        throw new Error('The tracking link must be a full web address, starting with https://');
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('The tracking link must start with https://');
    return url.toString();
}

/**
 * A parcel booked by hand with any courier (e.g. GDex, which EasyParcel doesn't offer): staff enter the
 * courier, tracking number and tracking link. Customers get the same shipped / delivered emails when
 * staff mark the fulfillment Shipped and Delivered.
 */
export const manualCourierHandler = new FulfillmentHandler({
    code: 'manual-courier',
    description: en('Courier booked by hand (e.g. GDex): enter the courier, tracking number and tracking link'),
    args: {
        courierName: {
            type: 'string',
            required: true,
            label: en('Courier'),
            description: en('e.g. GDex, Pos Laju, J&T Express, City-Link, Skynet'),
        },
        trackingNumber: { type: 'string', required: true, label: en('Tracking number') },
        trackingUrl: {
            type: 'string',
            required: false,
            label: en('Tracking link'),
            description: en("The courier's tracking page for this parcel; shown to the customer."),
        },
    },
    createFulfillment: (ctx, orders, lines, args) => {
        const courier = args.courierName?.trim();
        const trackingNumber = args.trackingNumber?.trim();
        if (!courier) throw new Error('Enter the courier.');
        if (!trackingNumber) throw new Error('Enter the tracking number.');
        const customFields: CourierFulfillmentFields = {
            provider: 'manual',
            providerOrderId: null,
            trackingUrl: trackingLink(args.trackingUrl),
            labelUrl: null,
            shipmentStatus: 'booked',
            lastEventAt: new Date(),
        };
        return { method: courier, trackingCode: trackingNumber, customFields };
    },
});
