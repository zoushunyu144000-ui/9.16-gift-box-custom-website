import { NextResponse } from "next/server";
import { z } from "zod";
import { isVendureConfigured } from "@/lib/store";
import { publicOrigin, retryPayment } from "@/lib/vendure/payments";

/** With the commerce backend: opens a new payment page for an order still waiting for payment. */
export async function POST(req: Request) {
  if (!isVendureConfigured) return NextResponse.json({ error: "Not available" }, { status: 404 });
  const parsed = z.object({ orderId: z.string().max(40) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  try {
    const result = await retryPayment(parsed.data.orderId, publicOrigin(req));
    return "url" in result ? NextResponse.json({ redirectUrl: result.url }) : NextResponse.json({ error: result.error }, { status: result.status });
  } catch (err) {
    console.error("[payments] retry failed", err);
    return NextResponse.json({ error: "The payment page couldn’t be opened. Please try again." }, { status: 502 });
  }
}
