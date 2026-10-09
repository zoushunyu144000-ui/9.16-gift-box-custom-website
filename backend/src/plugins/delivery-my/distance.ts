import { errorMessage, isTimeout, withTimeout } from './timeout';

/**
 * Road distance from the shop to a postcode, from Google's Routes API (computeRoutes), cached per postcode.
 * Billing (checked Oct 2026): requests without live traffic are the "Compute Routes Essentials" SKU,
 * 10,000 free a month, then US$5 per 1,000. Each postcode is asked about at most once per cache period.
 */
export const ROUTES_API_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';

export interface LatLng {
    latitude: number;
    longitude: number;
}

export interface RouteRequest {
    apiKey: string;
    origin: LatLng;
    /** "50450 Kuala Lumpur, Wilayah Persekutuan Kuala Lumpur, Malaysia" */
    destination: string;
    timeoutMs: number;
    fetchFn?: typeof fetch;
}

/** Driving distance in metres. Throws on HTTP errors, timeouts and addresses Google can't route to. */
export async function fetchRoadDistanceMeters(request: RouteRequest): Promise<number> {
    const response = await (request.fetchFn ?? fetch)(ROUTES_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': request.apiKey,
            // Only the distance: a smaller answer, and nothing that costs extra.
            'X-Goog-FieldMask': 'routes.distanceMeters',
        },
        body: JSON.stringify({
            origin: { location: { latLng: { latitude: request.origin.latitude, longitude: request.origin.longitude } } },
            destination: { address: request.destination },
            travelMode: 'DRIVE',
            // Live traffic would make it a Pro request at twice the price; distance doesn't need it.
            routingPreference: 'TRAFFIC_UNAWARE',
            regionCode: 'my',
            units: 'METRIC',
        }),
        signal: AbortSignal.timeout(request.timeoutMs),
    });
    if (!response.ok) {
        const detail = (await response.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 200);
        throw new Error(`Google Routes API answered ${response.status}${detail ? `: ${detail}` : ''}`);
    }
    const body = (await response.json()) as { routes?: Array<{ distanceMeters?: number }> };
    if (!body.routes?.length) throw new Error('Google found no road route to this address');
    // Google leaves out zero values, so a route without distanceMeters is 0 m.
    return body.routes[0].distanceMeters ?? 0;
}

export type DistanceOutcome =
    | { km: number; source: 'google' | 'cache' | 'stale-cache' }
    | { km?: undefined; source: 'no-key' | 'error' | 'not-in-table' | 'no-postcode' };

export interface StoredDistance {
    distanceMeters: number;
    fetchedAt: Date;
}

/** Where distances are kept between restarts (the delivery_distance table in the plugin). */
export interface DistanceStore {
    find(postcode: string, origin: string): Promise<StoredDistance | undefined>;
    save(entry: StoredDistance & { postcode: string; origin: string; destination: string }): Promise<void>;
}

export interface RoadDistanceSettings {
    origin: LatLng;
    /** Read on every lookup, so a key added to the environment works after a restart without code changes. */
    apiKey: () => string | undefined;
    timeoutMs: number;
    cacheDays: number;
    /** After Google fails for a postcode, wait this long before asking about it again (default 5 minutes). */
    retryAfterMs?: number;
    /** After Google times out, ask it about no postcode for this long (default 1 minute). */
    coolDownMs?: number;
    fetchFn?: typeof fetch;
    now?: () => number;
    log?: (message: string) => void;
}

/** Distances are cached per origin too, so moving the pickup point gets fresh distances. */
export function originKey(origin: LatLng): string {
    return `${origin.latitude.toFixed(5)},${origin.longitude.toFixed(5)}`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export class RoadDistanceLookup {
    private memory = new Map<string, StoredDistance>();
    private inFlight = new Map<string, Promise<number | undefined>>();
    private failedUntil = new Map<string, number>();
    private slowUntil = 0;

    constructor(
        private store: DistanceStore,
        private settings: RoadDistanceSettings,
    ) {}

    /**
     * Fresh cached distance → Google → an expired cached distance → nothing (the calculator then uses its fallback
     * price). Never throws and never waits longer than the timeout.
     */
    async distanceKm(postcode: string, destination: string): Promise<DistanceOutcome> {
        const origin = originKey(this.settings.origin);
        const key = `${origin}|${postcode}`;
        const now = this.now();
        let stored = this.memory.get(key);
        if (!stored) {
            stored = await this.store.find(postcode, origin).catch(err => {
                this.log(`couldn't read the cached distance for ${postcode}: ${errorMessage(err)}`);
                return undefined;
            });
            if (stored) this.memory.set(key, stored);
        }
        if (stored && now - stored.fetchedAt.getTime() < this.settings.cacheDays * DAY_MS) {
            return { km: stored.distanceMeters / 1000, source: 'cache' };
        }

        const apiKey = this.settings.apiKey();
        let meters: number | undefined;
        if (apiKey && (this.failedUntil.get(key) ?? 0) <= now && this.slowUntil <= now) {
            let pending = this.inFlight.get(key);
            if (!pending) {
                pending = this.fetchAndStore(postcode, origin, destination, apiKey).finally(() => this.inFlight.delete(key));
                this.inFlight.set(key, pending);
            }
            meters = await pending;
        }
        if (meters !== undefined) return { km: meters / 1000, source: 'google' };
        if (stored) return { km: stored.distanceMeters / 1000, source: 'stale-cache' };
        return { source: apiKey ? 'error' : 'no-key' };
    }

    private async fetchAndStore(postcode: string, origin: string, destination: string, apiKey: string): Promise<number | undefined> {
        const key = `${origin}|${postcode}`;
        try {
            const { timeoutMs, fetchFn } = this.settings;
            const meters = await withTimeout(
                fetchRoadDistanceMeters({ apiKey, origin: this.settings.origin, destination, timeoutMs, fetchFn }),
                timeoutMs,
                'Google Routes API',
            );
            const entry = { distanceMeters: meters, fetchedAt: new Date(this.now()) };
            this.memory.set(key, entry);
            await this.store.save({ ...entry, postcode, origin, destination }).catch(err => {
                this.log(`couldn't save the distance for ${postcode}: ${errorMessage(err)}`);
            });
            return meters;
        } catch (err) {
            this.failedUntil.set(key, this.now() + (this.settings.retryAfterMs ?? 5 * 60 * 1000));
            // Slowness hits every postcode: rather than make each checkout wait out the timeout, skip Google a while.
            if (isTimeout(err)) this.slowUntil = this.now() + (this.settings.coolDownMs ?? 60 * 1000);
            this.log(`no road distance for ${postcode} (${errorMessage(err)}); same-day delivery uses the fallback price`);
            return undefined;
        }
    }

    private now() {
        return this.settings.now?.() ?? Date.now();
    }

    private log(message: string) {
        this.settings.log?.(message);
    }
}
