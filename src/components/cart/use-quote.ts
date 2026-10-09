"use client";

import { useEffect, useState } from "react";
import type { CartLine, Quote } from "@/lib/types";

/** What checkout adds to a quote: the address so far, the delivery option, a discount code and points. */
export interface CheckoutContext {
  postcode: string;
  state: string;
  optionId?: string;
  /** With the commerce backend: price the customer's real order (discounts, points, delivery). */
  backend?: boolean;
  line1?: string;
  line2?: string;
  city?: string;
  couponCode?: string;
  loyaltyPoints?: number;
  /** While the order is being placed: no new quotes, so none can change the order after it. */
  paused?: boolean;
}

/**
 * Ask the server to price the bag. Re-runs whenever lines change, and, at checkout, when the
 * address, delivery option, discount code or points change.
 */
export function useQuote(lines: CartLine[], ready: boolean, checkout?: CheckoutContext) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState(false);
  const signature = JSON.stringify([lines.map((l) => [l.key, l.quantity, l.personalisationCount]), checkout]);

  useEffect(() => {
    if (!ready || lines.length === 0 || checkout?.paused) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/cart/quote", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            lines: lines.map(({ key, productId, variantId, quantity, personalisation, personalisationCount, giftMessage }) => ({
              key,
              productId,
              variantId,
              quantity,
              personalisation,
              personalisationCount,
              giftMessage,
            })),
            postcode: checkout?.postcode || undefined,
            state: checkout?.state || undefined,
            deliveryOptionId: checkout?.optionId || undefined,
            ...(checkout?.backend
              ? { checkout: true, line1: checkout.line1, line2: checkout.line2, city: checkout.city, couponCode: checkout.couponCode || undefined, loyaltyPoints: checkout.loyaltyPoints }
              : {}),
          }),
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error(String(res.status));
        setQuote(await res.json());
        setError(false);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError(true);
      }
    }, checkout?.backend ? 400 : 150);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, ready]);

  return { quote: lines.length ? quote : null, error };
}

const ORDERS_KEY = "moire.orders.v1";

export function rememberOrder(id: string, token: string, snapshot: string) {
  try {
    const all = JSON.parse(localStorage.getItem(ORDERS_KEY) || "{}");
    all[id] = { token, snapshot };
    localStorage.setItem(ORDERS_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

export function recallOrder(id: string): { token: string; snapshot: string } | null {
  try {
    return JSON.parse(localStorage.getItem(ORDERS_KEY) || "{}")[id] ?? null;
  } catch {
    return null;
  }
}
