import "server-only";

/**
 * A small in-memory limit per visitor, for public forms that send email to the shop. Each server
 * instance counts on its own, so on serverless hosting it slows bursts rather than enforcing an
 * exact number.
 */
const hits = new Map<string, number[]>();

/** The visitor's address as the hosting platform reports it. */
export function clientIp(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

/** Counts one use of `key`; false once it has been used `limit` times within `windowMs`. */
export function allowRequest(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) for (const [k, times] of hits) if (!times.some((t) => now - t < windowMs)) hits.delete(k);
  return true;
}
