"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { MAX_NAMES } from "@/lib/catalog";
import type { CartLine } from "@/lib/types";

const STORAGE_KEY = "moire.cart.v1";
const MAX_QTY = 99;

type Listener = () => void;
const listeners = new Set<Listener>();
let cache: CartLine[] | null = null;
const EMPTY: CartLine[] = [];

function read(): CartLine[] {
  if (cache) return cache;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as CartLine[]) : [];
    cache = Array.isArray(parsed) ? parsed.filter((l) => l && l.productId && l.snapshot) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(lines: CartLine[]) {
  cache = lines;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
  } catch {
    /* storage unavailable (private mode) — cart still works for this visit */
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      cache = null;
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function lineKey(l: Pick<CartLine, "productId" | "variantId" | "personalisation" | "giftMessage">) {
  return [l.productId, l.variantId ?? "", (l.personalisation ?? "").trim(), (l.giftMessage ?? "").trim()].join("|");
}

/** The bag's own price for a line until the server re-prices it: the items, plus each name. */
export function snapshotTotal(l: CartLine) {
  const names = l.personalisation ? (l.snapshot.personalisationFee ?? 0) * (l.personalisationCount ?? 1) : 0;
  return l.snapshot.unitPrice * l.quantity + names;
}

/** Two adds of the same line keep every name that was paid for. */
function mergeLines(into: CartLine, from: Pick<CartLine, "quantity" | "personalisation" | "personalisationCount">): CartLine {
  return {
    ...into,
    quantity: Math.min(MAX_QTY, into.quantity + from.quantity),
    personalisationCount: into.personalisation ? Math.min(MAX_NAMES, (into.personalisationCount ?? 1) + (from.personalisationCount ?? 1)) : undefined,
  };
}

interface CartContextValue {
  lines: CartLine[];
  ready: boolean;
  count: number;
  subtotal: number;
  add: (line: Omit<CartLine, "key">) => void;
  setQuantity: (key: string, qty: number) => void;
  update: (key: string, patch: Partial<Pick<CartLine, "giftMessage" | "personalisation">>) => void;
  remove: (key: string) => void;
  clear: () => void;
  drawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  lastAdded: string | null;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const lines = useSyncExternalStore(subscribe, read, () => EMPTY);
  const ready = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [lastAdded, setLastAdded] = useState<string | null>(null);

  const add = useCallback((line: Omit<CartLine, "key">) => {
    const key = lineKey(line);
    const current = read();
    const existing = current.find((l) => l.key === key);
    const next = existing
      ? current.map((l) => (l.key === key ? { ...mergeLines(l, line), snapshot: line.snapshot } : l))
      : [...current, { ...line, key }];
    write(next);
    setLastAdded(key);
    setDrawerOpen(true);
  }, []);

  const setQuantity = useCallback((key: string, qty: number) => {
    const q = Math.max(0, Math.min(MAX_QTY, Math.floor(qty)));
    const current = read();
    write(q === 0 ? current.filter((l) => l.key !== key) : current.map((l) => (l.key === key ? { ...l, quantity: q } : l)));
  }, []);

  const update = useCallback((key: string, patch: Partial<Pick<CartLine, "giftMessage" | "personalisation">>) => {
    const current = read();
    const target = current.find((l) => l.key === key);
    if (!target) return;
    const updated = { ...target, ...patch };
    const newKey = lineKey(updated);
    const others = current.filter((l) => l.key !== key);
    const merge = others.find((l) => l.key === newKey);
    if (merge) {
      write(others.map((l) => (l.key === newKey ? mergeLines(l, target) : l)));
    } else {
      write(current.map((l) => (l.key === key ? { ...updated, key: newKey } : l)));
    }
  }, []);

  const remove = useCallback((key: string) => write(read().filter((l) => l.key !== key)), []);
  const clear = useCallback(() => write([]), []);

  // Close drawer on Escape
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawerOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  const value = useMemo<CartContextValue>(
    () => ({
      lines,
      ready,
      count: lines.reduce((n, l) => n + l.quantity, 0),
      subtotal: lines.reduce((n, l) => n + snapshotTotal(l), 0),
      add,
      setQuantity,
      update,
      remove,
      clear,
      drawerOpen,
      openDrawer: () => setDrawerOpen(true),
      closeDrawer: () => setDrawerOpen(false),
      lastAdded,
    }),
    [lines, ready, add, setQuantity, update, remove, clear, drawerOpen, lastAdded],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside <CartProvider>");
  return ctx;
}
