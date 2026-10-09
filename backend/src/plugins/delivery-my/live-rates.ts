import type { RequestContext } from '@vendure/core';
import { errorMessage, isTimeout, withTimeout } from './timeout';
import { LiveRate, LiveRateProvider, LiveRateRequest } from './types';

/** Where live rates are kept for a day (Vendure's CacheService in the plugin). */
export interface RateCache {
    get(key: string): Promise<LiveRate[] | undefined>;
    set(key: string, rates: LiveRate[], ttlMs: number): Promise<void>;
}

export interface LiveRateSettings {
    timeoutMs: number;
    cacheHours: number;
    /** After a provider times out, leave it out for this long (default 1 minute). */
    coolDownMs?: number;
    now?: () => number;
    log?: (message: string) => void;
}

/**
 * One cache entry per channel (a channel may have its own courier account and rates), destination postcode and
 * weight bracket, plus size when a single boxed item is sent.
 */
export function rateCacheKey(request: LiveRateRequest, channel?: string | number): string {
    const size = request.lengthCm && request.widthCm && request.heightCm ? `:${request.lengthCm}x${request.widthCm}x${request.heightCm}cm` : '';
    const { fromPostcode, toPostcode, toState, weightKg } = request;
    return `delivery-my:live-rates:${channel ?? '-'}:${fromPostcode}:${toPostcode}:${toState}:${weightKg}kg${size}`;
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
 * Rates are cached only when every provider answered, so one slow provider can't hide cheaper rates for a day.
 */
export class LiveRateLookup {
    private inFlight = new Map<string, Promise<LiveRate[] | undefined>>();
    private slowUntil = new Map<LiveRateProvider, number>();

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
        const key = rateCacheKey(request, ctx.channelId);
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
        // A provider that just timed out is left out for a while, so checkouts don't each wait for it.
        const asked = this.providers.filter(provider => (this.slowUntil.get(provider) ?? 0) <= this.now());
        const results = await Promise.allSettled(
            asked.map(provider =>
                withTimeout(
                    Promise.resolve().then(() => provider.getRates(ctx, request)),
                    this.settings.timeoutMs,
                    `courier rate provider ${this.providers.indexOf(provider) + 1}`,
                ),
            ),
        );
        const rates: LiveRate[] = [];
        results.forEach((result, i) => {
            if (result.status === 'fulfilled') {
                rates.push(...(Array.isArray(result.value) ? result.value : []).filter(isUsableRate));
                return;
            }
            if (isTimeout(result.reason)) this.slowUntil.set(asked[i], this.now() + (this.settings.coolDownMs ?? 60 * 1000));
            this.settings.log?.(`live courier rates for ${request.toPostcode} unavailable (${errorMessage(result.reason)}); using the rates table`);
        });
        if (!rates.length) return undefined;
        const everyoneAnswered = asked.length === this.providers.length && results.every(result => result.status === 'fulfilled');
        if (everyoneAnswered) await this.cache.set(key, rates, this.settings.cacheHours * 60 * 60 * 1000).catch(() => undefined);
        return rates;
    }

    private now() {
        return this.settings.now?.() ?? Date.now();
    }
}
