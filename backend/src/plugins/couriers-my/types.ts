/**
 * Normalised shipment status shared by every provider (API contract §3). Storefronts read it from
 * `order.fulfillments { customFields { shipmentStatus } }`.
 */
export const SHIPMENT_STATUSES = ['booked', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'failed', 'cancelled'] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

/** No further provider updates are expected once a shipment reaches one of these. */
export const FINAL_SHIPMENT_STATUSES: readonly ShipmentStatus[] = ['delivered', 'failed', 'cancelled'];

export const COURIER_PROVIDERS = ['lalamove', 'easyparcel', 'manual'] as const;
export type CourierProvider = (typeof COURIER_PROVIDERS)[number];

/** Fulfillment custom fields added by this plugin (`trackingUrl` and `shipmentStatus` are public). */
export interface CourierFulfillmentFields {
    provider?: string | null;
    providerOrderId?: string | null;
    trackingUrl?: string | null;
    labelUrl?: string | null;
    shipmentStatus?: string | null;
    lastEventAt?: Date | null;
}

declare module '@vendure/core/dist/entity/custom-entity-fields' {
    interface CustomFulfillmentFields {
        provider?: string | null;
        providerOrderId?: string | null;
        trackingUrl?: string | null;
        labelUrl?: string | null;
        shipmentStatus?: string | null;
        lastEventAt?: Date | null;
    }
}

export function isShipmentStatus(value: unknown): value is ShipmentStatus {
    return typeof value === 'string' && (SHIPMENT_STATUSES as readonly string[]).includes(value);
}

export function isFinalShipmentStatus(value: string | null | undefined): boolean {
    return !!value && (FINAL_SHIPMENT_STATUSES as readonly string[]).includes(value);
}
