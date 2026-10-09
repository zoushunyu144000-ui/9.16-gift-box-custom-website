import { Inject, Injectable } from '@nestjs/common';
import { CacheService, Logger, RequestContext } from '@vendure/core';
import { DELIVERY_MY_OPTIONS, loggerCtx } from './constants';
import { LiveRateLookup } from './live-rates';
import { LiveRate, LiveRateRequest, MalaysianDeliveryOptions } from './types';

/** LiveRate as a type alias: Vendure's cache only takes JSON-shaped types, which interfaces don't count as. */
type CachedRate = { courier: string; service: string; priceSen: number; serviceId: string };

@Injectable()
export class LiveRateService {
    private lookup: LiveRateLookup;

    constructor(cacheService: CacheService, @Inject(DELIVERY_MY_OPTIONS) options: MalaysianDeliveryOptions) {
        this.lookup = new LiveRateLookup(
            options.liveRateProviders,
            {
                get: key => cacheService.get<CachedRate[]>(key),
                set: (key, rates, ttl) => cacheService.set<CachedRate[]>(key, rates, { ttl }),
            },
            {
                timeoutMs: options.timeoutMs,
                cacheHours: options.liveRateCacheHours,
                log: message => Logger.warn(message, loggerCtx),
            },
        );
    }

    get hasProviders(): boolean {
        return this.lookup.hasProviders;
    }

    rates(ctx: RequestContext, request: LiveRateRequest): Promise<LiveRate[] | undefined> {
        return this.lookup.rates(ctx, request);
    }
}
