import type { RequestContext } from '@vendure/core';
import { errorMessage, withTimeout } from './timeout';
import { LiveRate, LiveRateProvider, LiveRateRequest } from './types';

/** Where live rates are kept for a day (Vendure's CacheService in the plugin). */
export interface RateCache {
    get(key: string): Promise<LiveRate[] | undefined>;
    set(key: string, rates: LiveRate[], ttlMs: number): Promise<void>;
}

export interface LiveRateSettings {
    timeoutMs: number;
    cacheHours: number;
    log?: (message: string) => void;
}

/** One cache entry per destination postcode and weight bracket (plus size, when a single boxed item is sent). */
export function rateCacheKey(request: LiveRateRequest): string {
    const size = request.lengthCm && request.widthCm && request.heightCm ? `:${request.lengthCm}x${request.widthCm}x${request.heightCm}cm` : '';
    return `delivery-my:live-rates:${request.fromPostcode}:${request.toPostcode}:${request.weightKg}kg${size}`;
}

function isUsableRate(rate: LiveRate | null | undefined): rate is LiveRate {
    return (
        !!rate &&
        typeof rate.courier === 'string' &&
        typeof rate.service === 'string' &&
        typeof rate.serviceId === 'string' &&
        Number.isFinite(rate.priceSen) &&
        rate.priceSen > 0
    );
}

/**
 * Asks every registered provider at once and merges their rates. A provider that fails or takes longer than the
 * timeout is left out; when none answers, the result is undefined and the calculator uses its zone × weight table.
 */
export class LiveRateLookup {
    private inFlight = new Map<string, Promise<LiveRate[] | undefined>>();

    constructor(
        private providers: LiveRateProvider[],
        private cache: RateCache,
        private settings: LiveRateSettings,
    ) {}

    get hasProviders(): boolean {
        return this.providers.length > 0;
    }

    async rates(ctx: RequestContext, request: LiveRateRequest): Promise<LiveRate[] | undefined> {
        if (!this.providers.length) return undefined;
        const key = rateCacheKey(request);
        const cached = await this.cache.get(key).catch(() => undefined);
        if (cached?.length) return cached;
        let pending = this.inFlight.get(key);
        if (!pending) {
            pending = this.fetch(ctx, request, key).finally(() => this.inFlight.delete(key));
            this.inFlight.set(key, pending);
        }
        return pending;
    }

    private async fetch(ctx: RequestContext, request: LiveRateRequest, key: string): Promise<LiveRate[] | undefined> {
        const results = await Promise.allSettled(
            this.providers.map((provider, i) =>
                withTimeout(
                    Promise.resolve().then(() => provider.getRates(ctx, request)),
                    this.settings.timeoutMs,
                    `courier rate provider ${i + 1}`,
                ),
            ),
        );
        const rates: LiveRate[] = [];
        for (const result of results) {
            if (result.status === 'fulfilled') rates.push(...(Array.isArray(result.value) ? result.value : []).filter(isUsableRate));
            else this.settings.log?.(`live courier rates for ${request.toPostcode} unavailable (${errorMessage(result.reason)}); using the rates table`);
        }
        if (!rates.length) return undefined;
        await this.cache.set(key, rates, this.settings.cacheHours * 60 * 60 * 1000).catch(() => undefined);
        return rates;
    }
}
