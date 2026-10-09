import { ShipmentStatus } from './types';

/**
 * Lalamove order statuses (API v3 "Order Status") → normalised status.
 *
 * A Lalamove driver goes straight from the shop to the recipient, so PICKED_UP is reported as
 * `out_for_delivery` (there is no hub or line-haul in between). ON_GOING means a driver accepted the job
 * and is on the way to the shop: still `booked`. REJECTED (too many drivers turned it down) and EXPIRED
 * (no driver within the window) end the order without delivering, so both are `failed` and need re-booking.
 */
const LALAMOVE_STATUSES: Record<string, ShipmentStatus> = {
    ASSIGNING_DRIVER: 'booked',
    ON_GOING: 'booked',
    PICKED_UP: 'out_for_delivery',
    COMPLETED: 'delivered',
    CANCELED: 'cancelled',
    CANCELLED: 'cancelled',
    REJECTED: 'failed',
    EXPIRED: 'failed',
};

export function lalamoveStatus(status: string | null | undefined, podStatus?: string | null): ShipmentStatus | undefined {
    const normalised = LALAMOVE_STATUSES[(status ?? '').trim().toUpperCase()];
    // With proof of delivery on, a stop the driver could not complete is reported on the stop, not the order.
    if (normalised === 'delivered' && (podStatus ?? '').toUpperCase() === 'FAILED') return 'failed';
    return normalised;
}

/**
 * EasyParcel shipment status codes (Open API 2026-09 "Shipment Status Codes") → normalised status.
 * 2 "To Be Collected" and 11 "Drop Off" both wait for the parcel to reach the courier; 8 "On Hold" is a
 * courier exception that usually resumes, so it stays in transit.
 */
const EASYPARCEL_CODES: Record<number, ShipmentStatus> = {
    0: 'cancelled',
    2: 'booked',
    3: 'picked_up',
    4: 'in_transit',
    5: 'delivered',
    6: 'failed',
    7: 'booked',
    8: 'in_transit',
    11: 'booked',
};

/**
 * The code wins, refined by the text: EasyParcel documents that codes vary by courier (its own sample
 * reports a cancellation as code 8 "Cancelled"), and only the text says "out for delivery".
 */
export function easyParcelStatus(code: number | string | null | undefined, text?: string | null): ShipmentStatus | undefined {
    const description = (text ?? '').toLowerCase();
    if (/\bcancel/.test(description)) return 'cancelled';
    const numeric = typeof code === 'string' && code.trim() !== '' ? Number(code) : code;
    const fromCode = typeof numeric === 'number' && Number.isFinite(numeric) ? EASYPARCEL_CODES[numeric] : undefined;
    if (fromCode === 'in_transit' && /out for delivery|on delivery|with courier for delivery|on vehicle for delivery/.test(description)) {
        return 'out_for_delivery';
    }
    if (fromCode) return fromCode;
    // Unknown code: fall back to the wording.
    if (/\breturn/.test(description)) return 'failed';
    if (/\bdelivered\b/.test(description) && !/\b(not|un|failed)\b.*deliver/.test(description)) return 'delivered';
    if (/out for delivery/.test(description)) return 'out_for_delivery';
    if (/\b(collected|picked up|pickup completed)\b/.test(description)) return 'picked_up';
    if (/transit|hub|arrived|departed|sorting/.test(description)) return 'in_transit';
    return undefined;
}

/** How far along a shipment is; failed and cancelled count as finished. */
export const STATUS_PROGRESS: Record<ShipmentStatus, number> = {
    booked: 0,
    picked_up: 1,
    in_transit: 2,
    out_for_delivery: 3,
    delivered: 4,
    failed: 4,
    cancelled: 4,
};

/**
 * The Vendure fulfillment state a provider status calls for: once the courier has the parcel it is
 * Shipped (the customer gets the tracking email), and Delivered when the provider confirms delivery.
 * Failed and cancelled shipments are only recorded; staff decide whether to re-book or cancel.
 */
export function fulfillmentStateFor(status: ShipmentStatus | null | undefined): 'Shipped' | 'Delivered' | undefined {
    switch (status) {
        case 'picked_up':
        case 'in_transit':
        case 'out_for_delivery':
            return 'Shipped';
        case 'delivered':
            return 'Delivered';
        default:
            return undefined;
    }
}

/** Customer wording for each status, used in emails and the dashboard. */
export const STATUS_LABELS: Record<ShipmentStatus, string> = {
    booked: 'Booked',
    picked_up: 'Picked up',
    in_transit: 'In transit',
    out_for_delivery: 'Out for delivery',
    delivered: 'Delivered',
    failed: 'Delivery failed',
    cancelled: 'Cancelled',
};
