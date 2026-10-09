import { CollectionMethod, EASYPARCEL_API_VERSION, EASYPARCEL_BASE_URL, LabelSize } from './clients/easyparcel';
import { GOOGLE_GEOCODING_URL } from './clients/google-geocoding';
import { FetchFn } from './clients/http';
import { LALAMOVE_PRODUCTION_URL, LALAMOVE_SANDBOX_URL } from './clients/lalamove';
import { hmacSha256Hex } from './crypto';
import { ParcelSize, PostalAddress } from './parcel';
import { MY_SUBDIVISIONS } from './subdivisions';

/** Where parcels are collected: Lalamove's pickup stop and EasyParcel's sender. */
export interface ShopOrigin {
    /** Who the driver or courier asks for. */
    contactName: string;
    phone: string;
    company?: string;
    email?: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    postcode: string;
    /** State name or ISO 3166-2 code, e.g. "Kuala Lumpur" or "MY-14". */
    state: string;
    countryCode?: string;
    /** Pickup coordinates for Lalamove (the address is geocoded only for recipients). */
    lat: number;
    lng: number;
}

export interface LalamoveOptions {
    apiKey?: string;
    apiSecret?: string;
    /** rest.sandbox.lalamove.com unless false. Keys start pk_test/sk_test (sandbox) or pk_prod/sk_prod. */
    sandbox?: boolean;
    /** Overrides the API host (tests, proxies). Also read from LALAMOVE_BASE_URL. */
    baseUrl?: string;
    /** UN/LOCODE market, default MY. */
    market?: string;
    /** Address language, en_MY or ms_MY. */
    language?: string;
    /** Used when staff leave the vehicle empty. MY offers MOTORCYCLE and CAR at least; see GET /v3/cities. */
    defaultServiceType?: string;
    /** Ask drivers for a photo or signature at the door. Default true. */
    proofOfDelivery?: boolean;
    /** Pickup time (Malaysia, HH:mm) for orders whose preferred delivery date is a later day. Default 10:00. */
    scheduledPickupTime?: string;
}

export interface EasyParcelOptions {
    /** Our developer app on the EasyParcel Developer Hub; each shop's merchant account connects to it. */
    clientId?: string;
    clientSecret?: string;
    /**
     * Informational: EasyParcel uses the same endpoints for both, and the account the merchant connects
     * (demo or live) decides the environment. Shown in the connection status.
     */
    sandbox?: boolean;
    /** Overrides the API host (tests, proxies). Also read from EASYPARCEL_BASE_URL. */
    baseUrl?: string;
    apiVersion?: string;
    /** A6 suits thermal label printers. */
    defaultLabelSize?: LabelSize;
    /** Which services to offer and book: courier pickup from the shop (default), drop-off, or either. */
    collection?: CollectionMethod;
    /** Secret in the webhook URL. Derived from the client secret and public URL when not set. */
    webhookSecret?: string;
    /** EasyParcel's own (paid) tracking messages to the recipient. Off by default: the shop emails customers itself. */
    notifications?: { sms?: boolean; email?: boolean; whatsapp?: boolean };
    /** How long live rates are reused for the same parcel and route, in ms. Default 10 minutes. */
    rateCacheMs?: number;
}

export interface CouriersPluginOptions {
    origin: ShopOrigin;
    /** Public base URL of this server (VENDURE_PUBLIC_URL), for webhook and OAuth callback URLs. */
    publicUrl?: string;
    lalamove?: LalamoveOptions;
    easyParcel?: EasyParcelOptions;
    /** Geocodes recipient addresses for Lalamove (results are cached per address). */
    googleMapsApiKey?: string;
    /** Overrides the Geocoding endpoint (tests). Also read from GOOGLE_GEOCODING_URL. */
    geocodingUrl?: string;
    /** The box assumed when products have no weight or size. */
    defaultParcel?: Partial<ParcelSize>;
    /** Cron for re-checking open shipments. Default every 30 minutes. */
    reconcileSchedule?: string;
    /** Stop polling shipments older than this (e.g. sandbox ones that never move). Default 30 days. */
    reconcileMaxAgeDays?: number;
    /** Register the shipped / delivered customer emails with the EmailPlugin. Default true. */
    customerEmails?: boolean;
    /** fetch for all provider calls (tests). */
    fetch?: FetchFn;
}

export interface ResolvedCouriersOptions {
    origin: ShopOrigin & { countryCode: string };
    publicUrl: string;
    lalamove: Required<Omit<LalamoveOptions, 'apiKey' | 'apiSecret'>> & { apiKey: string; apiSecret: string; configured: boolean };
    easyParcel: Required<Omit<EasyParcelOptions, 'clientId' | 'clientSecret' | 'notifications'>> & {
        clientId: string;
        clientSecret: string;
        notifications: { sms: boolean; email: boolean; whatsapp: boolean };
        configured: boolean;
    };
    google: { apiKey: string; url: string };
    defaultParcel: ParcelSize;
    reconcileSchedule: string;
    reconcileMaxAgeDays: number;
    customerEmails: boolean;
    fetch: FetchFn;
}

/** Placeholder until a shop sets its own pickup address. */
export const PLACEHOLDER_ORIGIN: ShopOrigin = {
    contactName: 'Shop',
    phone: '+60300000000',
    addressLine1: 'Jalan Ampang',
    city: 'Kuala Lumpur',
    postcode: '50450',
    state: 'MY-14',
    lat: 3.1478,
    lng: 101.713,
};

export function resolveOptions(options: CouriersPluginOptions, env: NodeJS.ProcessEnv = process.env): ResolvedCouriersOptions {
    const port = env.PORT || env.VENDURE_SERVER_PORT || '3000';
    const publicUrl = (options.publicUrl || env.VENDURE_PUBLIC_URL || `http://localhost:${port}`).replace(/\/+$/, '');
    const lalamove = options.lalamove ?? {};
    const sandbox = lalamove.sandbox !== false;
    const easyParcel = options.easyParcel ?? {};
    const clientSecret = easyParcel.clientSecret ?? '';
    return {
        origin: { ...options.origin, countryCode: (options.origin.countryCode ?? 'MY').toUpperCase() },
        publicUrl,
        lalamove: {
            apiKey: lalamove.apiKey ?? '',
            apiSecret: lalamove.apiSecret ?? '',
            sandbox,
            baseUrl: lalamove.baseUrl || env.LALAMOVE_BASE_URL || (sandbox ? LALAMOVE_SANDBOX_URL : LALAMOVE_PRODUCTION_URL),
            market: lalamove.market ?? 'MY',
            language: lalamove.language ?? 'en_MY',
            defaultServiceType: lalamove.defaultServiceType ?? 'MOTORCYCLE',
            proofOfDelivery: lalamove.proofOfDelivery ?? true,
            scheduledPickupTime: lalamove.scheduledPickupTime ?? '10:00',
            configured: !!(lalamove.apiKey && lalamove.apiSecret),
        },
        easyParcel: {
            clientId: easyParcel.clientId ?? '',
            clientSecret,
            sandbox: easyParcel.sandbox !== false,
            baseUrl: easyParcel.baseUrl || env.EASYPARCEL_BASE_URL || EASYPARCEL_BASE_URL,
            apiVersion: easyParcel.apiVersion ?? EASYPARCEL_API_VERSION,
            defaultLabelSize: easyParcel.defaultLabelSize ?? 'A6',
            collection: easyParcel.collection ?? 'pickup',
            // Stable per deployment without another setting; differs between shops that share the developer app.
            webhookSecret:
                easyParcel.webhookSecret || (clientSecret ? hmacSha256Hex(clientSecret, `couriers-my:easyparcel-webhook:${publicUrl}`).slice(0, 40) : ''),
            notifications: {
                sms: !!easyParcel.notifications?.sms,
                email: !!easyParcel.notifications?.email,
                whatsapp: !!easyParcel.notifications?.whatsapp,
            },
            rateCacheMs: easyParcel.rateCacheMs ?? 10 * 60_000,
            configured: !!(easyParcel.clientId && clientSecret),
        },
        google: { apiKey: options.googleMapsApiKey ?? '', url: options.geocodingUrl || env.GOOGLE_GEOCODING_URL || GOOGLE_GEOCODING_URL },
        defaultParcel: { weightKg: 1, lengthCm: 30, widthCm: 25, heightCm: 15, ...options.defaultParcel },
        reconcileSchedule: options.reconcileSchedule ?? '*/30 * * * *',
        reconcileMaxAgeDays: options.reconcileMaxAgeDays ?? 30,
        customerEmails: options.customerEmails ?? true,
        fetch: options.fetch ?? ((input, init) => fetch(input, init)),
    };
}

/** The shop origin as a postal address for couriers (an ISO state code is written out as the state's name). */
export function originAddress(origin: ShopOrigin & { countryCode: string }): PostalAddress & { email?: string } {
    return {
        fullName: origin.contactName,
        company: origin.company,
        streetLine1: origin.addressLine1,
        streetLine2: origin.addressLine2,
        city: origin.city,
        province: MY_SUBDIVISIONS[origin.state.trim().toUpperCase()] ?? origin.state,
        postalCode: origin.postcode,
        countryCode: origin.countryCode,
        phoneNumber: origin.phone,
        email: origin.email,
    };
}
