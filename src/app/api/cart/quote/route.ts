import { NextResponse } from "next/server";
import { z } from "zod";
import { quoteLines } from "@/lib/pricing";
import type { Quote } from "@/lib/types";
import { getStore, isVendureConfigured } from "@/lib/store";
import { quoteDelivery } from "@/lib/vendure/delivery";

const Body = z.object({
  lines: z
    .array(
      z.object({
        key: z.string().max(400),
        productId: z.string().max(80),
        variantId: z.string().max(80).optional(),
        quantity: z.number(),
        // Room for a bulk list of 99 names at the longest per-name limit (see personalisationLimit).
        personalisation: z.string().max(6500).optional(),
        personalisationCount: z.number().int().min(1).max(99).optional(),
        giftMessage: z.string().max(1000).optional(),
      }),
    )
    .max(50),
  // Checkout sends the address once it has a postcode, for delivery priced per address.
  postcode: z.string().max(10).optional(),
  state: z.string().max(40).optional(),
  deliveryOptionId: z.string().max(40).optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const quote = await quoteLines(await getStore(), parsed.data.lines);
  if (isVendureConfigured) {
    const { postcode, state, deliveryOptionId, lines } = parsed.data;
    const delivery: Quote["delivery"] = await quoteDelivery({ postcode, state, optionId: deliveryOptionId, lines }).catch((err) => {
      // Not priced yet rather than a wrong price; the backend still prices the order at checkout.
      console.error("[quote] delivery quote failed", err);
      return { status: "postcode", options: [] };
    });
    if (delivery) {
      const fee = delivery.options.find((o) => o.id === delivery.selectedId)?.price ?? 0;
      return NextResponse.json({ ...quote, deliveryFee: fee, total: quote.subtotal + fee, delivery });
    }
  }
  return NextResponse.json(quote);
}
