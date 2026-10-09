import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DistanceStore, fetchRoadDistanceMeters, originKey, RoadDistanceLookup, ROUTES_API_URL, StoredDistance } from './distance';

const SHOP = { latitude: 3.1478, longitude: 101.713 };
const PJ = '47301 Petaling Jaya, Selangor, Malaysia';
const DAY = 24 * 60 * 60 * 1000;

type Call = { url: string; init: RequestInit };

/** A fetch that answers with `body` (or an HTTP status) and records each request. */
function stubFetch(answer: { status?: number; body?: unknown }, calls: Call[] = []): typeof fetch {
    return (async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: String(url), init: init ?? {} });
        return new Response(JSON.stringify(answer.body ?? {}), { status: answer.status ?? 200 });
    }) as typeof fetch;
}

/** A network that would take 10 seconds to answer, unless the request is aborted first. */
const hangingFetch = ((_url: string | URL | Request, init?: RequestInit) =>
    new Promise((resolve, reject) => {
        const slow = setTimeout(() => resolve(new Response('{"routes":[{"distanceMeters":1}]}')), 10_000);
        init?.signal?.addEventListener('abort', () => {
            clearTimeout(slow);
            reject(init.signal?.reason);
        });
    })) as typeof fetch;

describe('Google Routes API request', () => {
    it('asks computeRoutes for the driving distance only, without live traffic', async () => {
        const calls: Call[] = [];
        const meters = await fetchRoadDistanceMeters({
            apiKey: 'test-key',
            origin: SHOP,
            destination: PJ,
            timeoutMs: 1000,
            fetchFn: stubFetch({ body: { routes: [{ distanceMeters: 7342 }] } }, calls),
        });
        assert.equal(meters, 7342);
        assert.equal(calls.length, 1);
        const [{ url, init }] = calls;
        assert.equal(url, 'https://routes.googleapis.com/directions/v2:computeRoutes');
        assert.equal(url, ROUTES_API_URL);
        assert.equal(init.method, 'POST');
        assert.deepEqual(init.headers, {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': 'test-key',
            'X-Goog-FieldMask': 'routes.distanceMeters',
        });
        assert.deepEqual(JSON.parse(String(init.body)), {
            origin: { location: { latLng: { latitude: 3.1478, longitude: 101.713 } } },
            destination: { address: PJ },
            travelMode: 'DRIVE',
            routingPreference: 'TRAFFIC_UNAWARE',
            regionCode: 'my',
            units: 'METRIC',
        });
        assert.ok(init.signal instanceof AbortSignal, 'the request can be timed out');
    });

    it('treats an HTTP error as an error', async () => {
        const fetchFn = stubFetch({ status: 403, body: { error: { message: 'API key not valid' } } });
        await assert.rejects(fetchRoadDistanceMeters({ apiKey: 'bad', origin: SHOP, destination: PJ, timeoutMs: 1000, fetchFn }), /answered 403: .*API key not valid/);
    });

    it('treats "no route" (an empty answer) as an error', async () => {
        const fetchFn = stubFetch({ body: {} });
        await assert.rejects(fetchRoadDistanceMeters({ apiKey: 'k', origin: SHOP, destination: 'Nowhere', timeoutMs: 1000, fetchFn }), /no road route/);
    });

    it('reads a route Google sends without distanceMeters as 0 m (it leaves zeros out)', async () => {
        const fetchFn = stubFetch({ body: { routes: [{}] } });
        assert.equal(await fetchRoadDistanceMeters({ apiKey: 'k', origin: SHOP, destination: PJ, timeoutMs: 1000, fetchFn }), 0);
    });

    it('gives up after the timeout', async () => {
        const started = Date.now();
        await assert.rejects(fetchRoadDistanceMeters({ apiKey: 'k', origin: SHOP, destination: PJ, timeoutMs: 50, fetchFn: hangingFetch }));
        assert.ok(Date.now() - started < 1000);
    });
});

/** The delivery_distance table, in memory. */
function memoryStore(rows = new Map<string, StoredDistance>()): DistanceStore & { rows: Map<string, StoredDistance> } {
    return {
        rows,
        find: async (postcode, origin) => rows.get(`${origin}|${postcode}`),
        save: async ({ postcode, origin, distanceMeters, fetchedAt }) => {
            rows.set(`${origin}|${postcode}`, { distanceMeters, fetchedAt });
        },
    };
}

describe('road distance lookup (cached per postcode)', () => {
    const settings = (over: Partial<ConstructorParameters<typeof RoadDistanceLookup>[1]> = {}) => ({
        origin: SHOP,
        apiKey: () => 'key',
        timeoutMs: 50,
        cacheDays: 30,
        ...over,
    });

    it('asks Google once per postcode and reuses the distance for 30 days', async () => {
        const calls: Call[] = [];
        let now = Date.parse('2026-10-09T02:00:00Z');
        const store = memoryStore();
        const fetchFn = stubFetch({ body: { routes: [{ distanceMeters: 7342 }] } }, calls);
        const lookup = new RoadDistanceLookup(store, settings({ fetchFn, now: () => now }));
        assert.deepEqual(await lookup.distanceKm('47301', PJ), { km: 7.342, source: 'google' });
        assert.deepEqual(store.rows.get(`${originKey(SHOP)}|47301`)?.distanceMeters, 7342);

        now += 29 * DAY;
        assert.deepEqual(await new RoadDistanceLookup(store, settings({ fetchFn, now: () => now })).distanceKm('47301', PJ), { km: 7.342, source: 'cache' });
        assert.equal(calls.length, 1);

        now += 2 * DAY;
        assert.deepEqual(await lookup.distanceKm('47301', PJ), { km: 7.342, source: 'google' });
        assert.equal(calls.length, 2, 'asked again after 30 days');
    });

    it('keeps distances per pickup point, so moving the shop gets fresh ones', async () => {
        const calls: Call[] = [];
        const store = memoryStore();
        const fetchFn = stubFetch({ body: { routes: [{ distanceMeters: 7342 }] } }, calls);
        await new RoadDistanceLookup(store, settings({ fetchFn })).distanceKm('47301', PJ);
        await new RoadDistanceLookup(store, settings({ fetchFn, origin: { latitude: 3.0738, longitude: 101.5183 } })).distanceKm('47301', PJ);
        assert.equal(calls.length, 2);
    });

    it('without an API key: no request, nothing to go on unless a distance was cached before', async () => {
        const calls: Call[] = [];
        const fetchFn = stubFetch({ body: { routes: [{ distanceMeters: 1 }] } }, calls);
        assert.deepEqual(await new RoadDistanceLookup(memoryStore(), settings({ apiKey: () => undefined, fetchFn })).distanceKm('47301', PJ), {
            source: 'no-key',
        });
        const old = memoryStore(new Map([[`${originKey(SHOP)}|47301`, { distanceMeters: 7342, fetchedAt: new Date('2025-01-01') }]]));
        assert.deepEqual(await new RoadDistanceLookup(old, settings({ apiKey: () => undefined, fetchFn })).distanceKm('47301', PJ), {
            km: 7.342,
            source: 'stale-cache',
        });
        assert.equal(calls.length, 0);
    });

    it('when Google is too slow: gives up within the timeout, and waits 5 minutes before asking again', async () => {
        const logged: string[] = [];
        let now = Date.parse('2026-10-09T02:00:00Z');
        let attempts = 0;
        const fetchFn = ((url: string, init: RequestInit) => {
            attempts++;
            return hangingFetch(url, init);
        }) as typeof fetch;
        const lookup = new RoadDistanceLookup(memoryStore(), settings({ fetchFn, now: () => now, log: m => logged.push(m) }));
        const started = Date.now();
        assert.deepEqual(await lookup.distanceKm('47301', PJ), { source: 'error' });
        assert.ok(Date.now() - started < 1000);
        assert.match(logged[0], /no road distance for 47301 .*fallback price/);

        assert.deepEqual(await lookup.distanceKm('47301', PJ), { source: 'error' });
        assert.equal(attempts, 1, 'no second request straight away');
        now += 6 * 60 * 1000;
        await lookup.distanceKm('47301', PJ);
        assert.equal(attempts, 2);
    });

    it('when Google fails, an expired distance is better than none', async () => {
        const old = memoryStore(new Map([[`${originKey(SHOP)}|47301`, { distanceMeters: 7342, fetchedAt: new Date('2025-01-01') }]]));
        const lookup = new RoadDistanceLookup(old, settings({ fetchFn: stubFetch({ status: 500 }) }));
        assert.deepEqual(await lookup.distanceKm('47301', PJ), { km: 7.342, source: 'stale-cache' });
    });

    it('checkouts asking at the same moment share one request', async () => {
        const calls: Call[] = [];
        const lookup = new RoadDistanceLookup(memoryStore(), settings({ fetchFn: stubFetch({ body: { routes: [{ distanceMeters: 2500 }] } }, calls) }));
        const results = await Promise.all([lookup.distanceKm('50450', 'a'), lookup.distanceKm('50450', 'a'), lookup.distanceKm('50450', 'a')]);
        assert.deepEqual(
            results.map(r => r.km),
            [2.5, 2.5, 2.5],
        );
        assert.equal(calls.length, 1);
    });

    it('a cache that fails to save still gives the distance', async () => {
        const store: DistanceStore = {
            find: async () => undefined,
            save: async () => {
                throw new Error('duplicate key');
            },
        };
        const logged: string[] = [];
        const lookup = new RoadDistanceLookup(store, settings({ fetchFn: stubFetch({ body: { routes: [{ distanceMeters: 2500 }] } }), log: m => logged.push(m) }));
        assert.deepEqual(await lookup.distanceKm('50450', 'a'), { km: 2.5, source: 'google' });
        assert.match(logged[0], /couldn't save the distance for 50450: duplicate key/);
    });
});
