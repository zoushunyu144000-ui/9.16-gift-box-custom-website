"use client";

import { useEffect, useState } from "react";
import type { CartLine, Quote } from "@/lib/types";

/** Ask the server to price the bag. Re-runs whenever lines change. */
export function useQuote(lines: CartLine[], ready: boolean) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState(false);
  const signature = JSON.stringify(lines.map((l) => [l.key, l.quantity, l.personalisationCount]));

  useEffect(() => {
    if (!ready || lines.length === 0) return;
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
          }),
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error(String(res.status));
        setQuote(await res.json());
        setError(false);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError(true);
      }
    }, 150);
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
