import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { RequestContext } from '@vendure/core';
import { LiveRateLookup, RateCache, rateCacheKey } from './live-rates';
import { LiveRate, LiveRateProvider, LiveRateRequest } from './types';

const ctx = {} as RequestContext;
const request: LiveRateRequest = { fromPostcode: '50450', toPostcode: '10200', toState: 'Pulau Pinang', weightKg: 3 };
const jnt: LiveRate = { courier: 'J&T Express', service: 'Standard', priceSen: 980, serviceId: 'EP-CS0I' };
const poslaju: LiveRate = { courier: 'Pos Laju', service: 'Next Day', priceSen: 1250, serviceId: 'EP-CS0W' };

function memoryCache(): RateCache & { entries: Map<string, { rates: LiveRate[]; ttlMs: number }> } {
    const entries = new Map<string, { rates: LiveRate[]; ttlMs: number }>();
    return {
        entries,
        get: async key => entries.get(key)?.rates,
        set: async (key, rates, ttlMs) => {
            entries.set(key, { rates, ttlMs });
        },
    };
}

const provider = (answer: () => Promise<LiveRate[]>, calls: LiveRateRequest[] = []): LiveRateProvider => ({
    getRates: async (_ctx, input) => {
        calls.push(input);
        return answer();
    },
});

describe('live courier rates', () => {
    it('merges every provider’s rates and keeps them a day per postcode and weight bracket', async () => {
        const calls: LiveRateRequest[] = [];
        const cache = memoryCache();
        const lookup = new LiveRateLookup(
            [provider(async () => [jnt], calls), provider(async () => [poslaju], calls)],
            cache,
            { timeoutMs: 500, cacheHours: 24 },
        );
        assert.deepEqual(await lookup.rates(ctx, request), [jnt, poslaju]);
        assert.deepEqual(calls, [request, request]);
        assert.deepEqual(cache.entries.get('delivery-my:live-rates:50450:10200:3kg'), { rates: [jnt, poslaju], ttlMs: 24 * 60 * 60 * 1000 });

        assert.deepEqual(await lookup.rates(ctx, request), [jnt, poslaju]);
        assert.equal(calls.length, 2, 'second quote from the cache');
        await lookup.rates(ctx, { ...request, weightKg: 4 });
        assert.equal(calls.length, 4, 'another weight bracket is asked again');
    });

    it('leaves out a provider that is too slow or fails, and drops unusable rates', async () => {
        const logged: string[] = [];
        const lookup = new LiveRateLookup(
            [
                provider(() => new Promise(() => undefined)),
                provider(async () => {
                    throw new Error('EasyParcel is down');
                }),
                provider(async () => [jnt, { ...poslaju, priceSen: Number.NaN }, null as unknown as LiveRate]),
            ],
            memoryCache(),
            { timeoutMs: 50, cacheHours: 24, log: m => logged.push(m) },
        );
        const started = Date.now();
        assert.deepEqual(await lookup.rates(ctx, request), [jnt]);
        assert.ok(Date.now() - started < 1000);
        assert.equal(logged.length, 2);
        assert.match(logged.join('\n'), /longer than 50 ms/);
        assert.match(logged.join('\n'), /EasyParcel is down/);
    });

    it('answers nothing (so the table is used) when no provider answers in time, and caches nothing', async () => {
        const cache = memoryCache();
        const lookup = new LiveRateLookup([provider(() => new Promise(() => undefined))], cache, { timeoutMs: 50, cacheHours: 24 });
        assert.equal(await lookup.rates(ctx, request), undefined);
        assert.equal(cache.entries.size, 0);
    });

    it('does nothing without providers', async () => {
        const lookup = new LiveRateLookup([], memoryCache(), { timeoutMs: 50, cacheHours: 24 });
        assert.equal(lookup.hasProviders, false);
        assert.equal(await lookup.rates(ctx, request), undefined);
    });

    it('shares one request between checkouts asking at the same moment', async () => {
        const calls: LiveRateRequest[] = [];
        const lookup = new LiveRateLookup([provider(async () => [jnt], calls)], memoryCache(), { timeoutMs: 500, cacheHours: 24 });
        await Promise.all([lookup.rates(ctx, request), lookup.rates(ctx, request)]);
        assert.equal(calls.length, 1);
    });

    it('caches by size too when a single box is sent', () => {
        assert.equal(rateCacheKey(request), 'delivery-my:live-rates:50450:10200:3kg');
        assert.equal(rateCacheKey({ ...request, lengthCm: 40, widthCm: 30, heightCm: 20 }), 'delivery-my:live-rates:50450:10200:3kg:40x30x20cm');
    });
});
