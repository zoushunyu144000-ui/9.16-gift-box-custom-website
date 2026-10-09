import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { RequestContext } from '@vendure/core';
import { LiveRateLookup, RateCache, rateCacheKey } from './live-rates';
import { LiveRate, LiveRateProvider, LiveRateRequest } from './types';

const ctx = { channelId: 1 } as unknown as RequestContext;
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
        assert.deepEqual(cache.entries.get('delivery-my:live-rates:1:50450:10200:Pulau Pinang:3kg'), { rates: [jnt, poslaju], ttlMs: 24 * 60 * 60 * 1000 });

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

    it('leaves a provider that timed out alone for a minute, so checkouts don’t each wait for it', async () => {
        let now = Date.parse('2026-10-09T02:00:00Z');
        const slowCalls: LiveRateRequest[] = [];
        const fastCalls: LiveRateRequest[] = [];
        const lookup = new LiveRateLookup(
            [provider(() => new Promise(() => undefined), slowCalls), provider(async () => [jnt], fastCalls)],
            memoryCache(),
            { timeoutMs: 50, cacheHours: 24, now: () => now },
        );
        assert.deepEqual(await lookup.rates(ctx, request), [jnt]);
        const started = Date.now();
        assert.deepEqual(await lookup.rates(ctx, { ...request, toPostcode: '88000' }), [jnt]);
        assert.ok(Date.now() - started < 40, 'no wait for the slow provider');
        assert.equal(slowCalls.length, 1);
        assert.equal(fastCalls.length, 2);
        now += 61 * 1000;
        await lookup.rates(ctx, { ...request, toPostcode: '93050' });
        assert.equal(slowCalls.length, 2, 'asked again after the minute');
    });

    it('does not cache when a provider failed, so its cheaper rates aren’t hidden for a day', async () => {
        const cache = memoryCache();
        const lookup = new LiveRateLookup(
            [
                provider(async () => [poslaju]),
                provider(async () => {
                    throw new Error('EasyParcel is down');
                }),
            ],
            cache,
            { timeoutMs: 500, cacheHours: 24 },
        );
        assert.deepEqual(await lookup.rates(ctx, request), [poslaju]);
        assert.equal(cache.entries.size, 0);
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

    it('caches per channel, postcode, state and weight bracket, and by size when a single box is sent', () => {
        assert.equal(rateCacheKey(request, 1), 'delivery-my:live-rates:1:50450:10200:Pulau Pinang:3kg');
        assert.equal(rateCacheKey(request), 'delivery-my:live-rates:-:50450:10200:Pulau Pinang:3kg');
        assert.notEqual(rateCacheKey(request, 1), rateCacheKey(request, 2));
        assert.notEqual(rateCacheKey(request, 1), rateCacheKey({ ...request, toState: 'Kedah' }, 1));
        assert.equal(
            rateCacheKey({ ...request, lengthCm: 40, widthCm: 30, heightCm: 20 }, 1),
            'delivery-my:live-rates:1:50450:10200:Pulau Pinang:3kg:40x30x20cm',
        );
    });
});
