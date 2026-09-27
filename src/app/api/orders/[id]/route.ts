import { NextResponse } from "next/server";
import { loadOrderForCustomer, publicOrder } from "@/lib/orders";
import { getStore } from "@/lib/store";

/** Customer order lookup. Requires ?t=<access token>. Optional signed snapshot in the X-Order-Snapshot header. */
export async function GET(req: Request, ctx: RouteContext<"/api/orders/[id]">) {
  const { id } = await ctx.params;
  const token = new URL(req.url).searchParams.get("t");
  const store = await getStore();
  const order = await loadOrderForCustomer(store, id, token, req.headers.get("x-order-snapshot"));
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  return NextResponse.json(publicOrder(order));
}
