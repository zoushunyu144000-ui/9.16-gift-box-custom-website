import "server-only";
import type { Store } from "./store/types";
import type { Order } from "./types";
import { openSnapshot, sealSnapshot, verifyOrderAccess } from "./security";

/**
 * Load an order for a customer-facing page. Requires the access token from the order link.
 * If the preview's temporary storage has been recycled, falls back to the signed snapshot
 * the browser kept (only possible in demo mode; with Supabase the database is the source of truth).
 */
export async function loadOrderForCustomer(store: Store, id: string, token: string | null, sealed?: string | null) {
  if (!verifyOrderAccess(id, token)) return null;
  const stored = await store.getOrder(id);
  if (stored) return stored;
  if (store.kind === "demo") {
    const snap = openSnapshot<Order>(sealed);
    if (snap && snap.id === id) {
      await store.createOrder(snap);
      return snap;
    }
  }
  return null;
}

export function publicOrder(order: Order) {
  // Everything in an order is the customer's own data; internal notes stay private.
  const { internalNotes: _internal, ...rest } = order;
  void _internal;
  return { order: rest, snapshot: sealSnapshot(order) };
}

export async function markOrderPaid(store: Store, order: Order, reference: string) {
  if (order.status === "paid") return order;
  const now = new Date().toISOString();
  const next: Order = { ...order, status: "paid", updatedAt: now, payment: { ...order.payment, reference, paidAt: now, failureReason: undefined } };
  await store.saveOrder(next);
  return next;
}

export async function markOrderFailed(store: Store, order: Order, reason: string) {
  if (order.status === "paid") return order;
  const next: Order = { ...order, status: "payment_failed", updatedAt: new Date().toISOString(), payment: { ...order.payment, failureReason: reason } };
  await store.saveOrder(next);
  return next;
}
