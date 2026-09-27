"use client";

import { useCallback, useEffect, useState } from "react";
import type { Order } from "@/lib/types";
import { recallOrder, rememberOrder } from "../cart/use-quote";

export type PublicOrder = Omit<Order, "internalNotes">;

export function useOrder(orderId: string, tokenFromUrl: string) {
  const [order, setOrder] = useState<PublicOrder | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "notfound" | "error">("loading");
  const [token, setToken] = useState(tokenFromUrl);

  const load = useCallback(async () => {
    const saved = recallOrder(orderId);
    const t = tokenFromUrl || saved?.token || "";
    setToken(t);
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}?t=${encodeURIComponent(t)}`, {
        headers: saved?.snapshot ? { "x-order-snapshot": saved.snapshot } : {},
        cache: "no-store",
      });
      if (res.status === 404) return setState("notfound");
      if (!res.ok) return setState("error");
      const data = await res.json();
      rememberOrder(orderId, t, data.snapshot);
      setOrder(data.order);
      setState("ready");
    } catch {
      setState("error");
    }
  }, [orderId, tokenFromUrl]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount
    load();
  }, [load]);

  const apply = useCallback(
    (data: { order: PublicOrder; snapshot: string }) => {
      rememberOrder(orderId, token, data.snapshot);
      setOrder(data.order);
    },
    [orderId, token],
  );

  return { order, state, token, reload: load, apply };
}
