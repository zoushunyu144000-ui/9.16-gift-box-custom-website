/**
 * Counts events per key (here: the customer's IP address) over a sliding time window, in memory.
 * Enough to stop a script from filling the shop's inbox; it starts afresh when the server restarts and is
 * not shared between several server instances.
 */
export class RateLimiter {
    private hits = new Map<string, number[]>();

    constructor(
        readonly limit: number,
        readonly windowMs: number,
        private now: () => number = Date.now,
        /** Above this many keys, keys with no recent events are forgotten so memory can't grow without bound. */
        private sweepAbove = 1000,
    ) {}

    /** Records an event for the key if it is still under the limit; false means over the limit (nothing recorded). */
    tryHit(key: string): boolean {
        const now = this.now();
        const recent = this.recent(key, now);
        if (recent.length >= this.limit) {
            this.hits.set(key, recent);
            return false;
        }
        recent.push(now);
        this.hits.set(key, recent);
        if (this.hits.size > this.sweepAbove) this.sweep(now);
        return true;
    }

    /** Seconds until the key may send again; 0 when it may now. */
    retryAfterSeconds(key: string): number {
        const now = this.now();
        const recent = this.recent(key, now);
        if (recent.length < this.limit) return 0;
        return Math.ceil((recent[recent.length - this.limit] + this.windowMs - now) / 1000);
    }

    /** Number of keys currently remembered (for tests). */
    get size() {
        return this.hits.size;
    }

    sweep(now = this.now()) {
        for (const [key, times] of this.hits) {
            if (!times.some(t => now - t < this.windowMs)) this.hits.delete(key);
        }
    }

    private recent(key: string, now: number) {
        return (this.hits.get(key) ?? []).filter(t => now - t < this.windowMs);
    }
}
