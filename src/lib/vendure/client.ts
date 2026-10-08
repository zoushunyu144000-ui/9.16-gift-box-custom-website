import "server-only";

/**
 * Server-side client for the commerce backend's Shop API (Vendure, see backend/).
 * The storefront switches to it when VENDURE_SHOP_API_URL is set; without it the site runs in demo mode.
 */
export const VENDURE_SHOP_API_URL = process.env.VENDURE_SHOP_API_URL || "";
export const isVendureConfigured = Boolean(VENDURE_SHOP_API_URL);

export class VendureError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

/**
 * Runs a Shop API operation. `token` is the customer's Vendure session (bearer); the response's
 * `token` is the session to keep (Vendure creates one for a new guest and may rotate it on login).
 */
export async function shopApi<T>(query: string, variables: Record<string, unknown> = {}, opts: { token?: string | null } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  if (process.env.VENDURE_CHANNEL_TOKEN) headers["vendure-token"] = process.env.VENDURE_CHANNEL_TOKEN;
  const res = await fetch(VENDURE_SHOP_API_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  const body = (await res.json().catch(() => null)) as { data?: T; errors?: { message: string; extensions?: { code?: string } }[] } | null;
  if (!res.ok || !body || body.errors?.length || !body.data) {
    const first = body?.errors?.[0];
    throw new VendureError(first?.message || `Shop API request failed (${res.status})`, first?.extensions?.code);
  }
  return { data: body.data, token: res.headers.get("vendure-auth-token") ?? opts.token ?? null };
}

/** A Vendure ErrorResult (union member with errorCode), or the value itself. */
export type Result<T> = T | { __typename: string; errorCode: string; message: string; [key: string]: unknown };

export function isErrorResult(value: unknown): value is { __typename: string; errorCode: string; message: string; interceptorError?: string; transitionError?: string } {
  return Boolean(value && typeof value === "object" && "errorCode" in value);
}

/** The most useful customer-facing text in an ErrorResult (interceptor and transition errors carry the reason). */
export function errorMessage(e: { message: string; interceptorError?: string; transitionError?: string }) {
  return e.interceptorError || e.transitionError || e.message;
}
