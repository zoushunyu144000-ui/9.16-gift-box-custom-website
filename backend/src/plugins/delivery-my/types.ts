import type { RequestContext } from '@vendure/core';

/** Delivery zones worked out from the postcode (see postcodes.ts). */
export const DELIVERY_ZONES = ['klang-valley', 'peninsular', 'sabah-labuan', 'sarawak', 'unknown'] as const;
export type DeliveryZone = (typeof DELIVERY_ZONES)[number];

/** One parcel to price, as `LiveRateProvider.getRates` receives it (contract §2). */
export interface LiveRateRequest {
    /** The shop's pickup postcode (plugin option `origin.postcode`). */
    fromPostcode: string;
    toPostcode: string;
    /** State as written in the data.gov.my table, e.g. "Pulau Pinang", "W.P. Labuan" (see MALAYSIAN_STATES). */
    toState: string;
    /** Chargeable weight rounded up to the whole kg, so one cached quote covers the whole bracket. */
    weightKg: number;
    lengthCm?: number;
    widthCm?: number;
    heightCm?: number;
}

export interface LiveRate {
    courier: string;
    service: string;
    priceSen: number;
    serviceId: string;
}

/**
 * A courier rate service (e.g. couriers-my's `easyParcelRateProvider`), registered with
 * `MalaysianDeliveryPlugin.init({ liveRateProviders: [...] })`. The `my-courier-rates` calculator asks every
 * provider, takes the cheapest allowed rate, then adds the markup and rounds up to the next RM1.
 * A provider may also have `init(injector)` / `destroy()` like any Vendure strategy; they are called at startup and shutdown.
 */
export interface LiveRateProvider {
    getRates(ctx: RequestContext, input: LiveRateRequest): Promise<LiveRate[]>;
}

export interface ShopOrigin {
    latitude: number;
    longitude: number;
    /** For people and couriers; road distances start from latitude/longitude. */
    address: string;
    /** Couriers collect from here. */
    postcode: string;
}

export interface MalaysianDeliveryOptions {
    /** The shop's pickup point. Same-day prices use the road distance from here. */
    origin: ShopOrigin;
    /** Count Putrajaya (postcodes 62xxx) as KL & Selangor rather than Peninsular. */
    includePutrajaya: boolean;
    /** Orders confirmed before this time (24-hour "HH:MM", Malaysian time) are dispatched that day. */
    cutoffTime: string;
    /** Days the shop dispatches: 0 = Sunday … 6 = Saturday. */
    dispatchWeekdays: number[];
    /** YYYY-MM-DD dates without dispatch, on top of the ones staff enter in Global settings. */
    closedDates: string[];
    /** Customer wording for courier zones, e.g. "3–5 days" in "Delivery normally takes 3–5 days." */
    courierDeliveryTime: string;
    /** Names customers see for each zone. Defaults depend on includePutrajaya. */
    zoneLabels: Record<DeliveryZone, string>;
    liveRateProviders: LiveRateProvider[];
    /** Google Maps Platform key with the Routes API enabled. Defaults to the GOOGLE_MAPS_API_KEY environment variable. */
    googleMapsApiKey?: string;
    /** How long to wait for Google or a courier before using the fallback price (ms). */
    timeoutMs: number;
    /** How long a road distance is reused (days). */
    distanceCacheDays: number;
    /** How long live courier rates are reused (hours). */
    liveRateCacheHours: number;
    /** Longest delivery note a customer can leave. */
    deliveryNotesMaxLength: number;
}
