import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RateLimiter } from './rate-limiter';

const MINUTE = 60_000;

function clock(start = 0) {
    const c = { time: start, now: () => c.time };
    return c;
}

describe('rate limiter', () => {
    it('lets a key through up to the limit, then refuses', () => {
        const c = clock();
        const limiter = new RateLimiter(3, 60 * MINUTE, c.now);
        assert.deepEqual([1, 2, 3, 4].map(() => limiter.tryHit('1.2.3.4')), [true, true, true, false]);
        assert.equal(limiter.tryHit('5.6.7.8'), true, 'other addresses are counted separately');
    });

    it('lets the key in again as its oldest events leave the window', () => {
        const c = clock();
        const limiter = new RateLimiter(2, 10 * MINUTE, c.now);
        limiter.tryHit('ip');
        c.time += 4 * MINUTE;
        limiter.tryHit('ip');
        assert.equal(limiter.tryHit('ip'), false);
        assert.equal(limiter.retryAfterSeconds('ip'), 6 * 60);
        c.time += 6 * MINUTE;
        assert.equal(limiter.retryAfterSeconds('ip'), 0);
        assert.equal(limiter.tryHit('ip'), true, 'the first event is now 10 minutes old');
        assert.equal(limiter.tryHit('ip'), false, 'the second is still inside the window');
    });

    it('does not count refused attempts, so waiting always helps', () => {
        const c = clock();
        const limiter = new RateLimiter(1, MINUTE, c.now);
        assert.equal(limiter.tryHit('ip'), true);
        for (let i = 0; i < 5; i++) {
            c.time += 10_000;
            assert.equal(limiter.tryHit('ip'), false);
        }
        c.time = MINUTE;
        assert.equal(limiter.tryHit('ip'), true);
    });

    it('forgets quiet addresses so memory stays small', () => {
        const c = clock();
        const limiter = new RateLimiter(5, MINUTE, c.now, 3);
        for (const ip of ['a', 'b', 'c']) limiter.tryHit(ip);
        c.time += 2 * MINUTE;
        limiter.tryHit('d');
        assert.equal(limiter.size, 1, 'a, b and c were swept once there were more than 3 keys');
        limiter.tryHit('e');
        limiter.sweep();
        assert.equal(limiter.size, 2);
    });
});
