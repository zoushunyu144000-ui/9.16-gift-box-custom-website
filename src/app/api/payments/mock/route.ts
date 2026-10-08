import { NextResponse } from "next/server";
import { z } from "zod";
import { loadOrderForCustomer, markOrderFailed, markOrderPaid, publicOrder } from "@/lib/orders";
import { getPaymentProvider } from "@/lib/payments";
import { getStore, isVendureConfigured } from "@/lib/store";
import { payTestOrder } from "@/lib/vendure/orders";

/**
 * Test-mode payment completion. Only active while PAYMENT_PROVIDER is "test".
 * A real gateway replaces this with a signed server-to-server webhook.
 */
const Body = z.object({
  orderId: z.string().max(40),
  token: z.string().max(80),
  outcome: z.enum(["success", "failure", "cancel"]),
  snapshot: z.string().max(40000).optional(),
});

export async function POST(req: Request) {
  if (getPaymentProvider().id !== "test") return NextResponse.json({ error: "Not available" }, { status: 404 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { orderId, token, outcome, snapshot } = parsed.data;

  if (isVendureConfigured) {
    try {
      const order = await payTestOrder(orderId, outcome);
      return order ? NextResponse.json({ order, snapshot: "" }) : NextResponse.json({ error: "Order not found" }, { status: 404 });
    } catch (err) {
      console.error("[payments] test payment failed", err);
      return NextResponse.json({ error: "The test payment could not be recorded." }, { status: 502 });
    }
  }

  const store = await getStore();
  const order = await loadOrderForCustomer(store, orderId, token, snapshot);
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (order.status !== "pending_payment" && order.status !== "payment_failed") {
    return NextResponse.json(publicOrder(order));
  }

  const updated =
    outcome === "success"
      ? await markOrderPaid(store, order, `TEST-${Date.now().toString(36).toUpperCase()}`)
      : await markOrderFailed(store, order, outcome === "cancel" ? "Payment was cancelled" : "The bank declined the payment (test)");

  return NextResponse.json(publicOrder(updated));
}
