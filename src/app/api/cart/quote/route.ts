import { NextResponse } from "next/server";
import { z } from "zod";
import { quoteLines } from "@/lib/pricing";
import { getStore } from "@/lib/store";

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
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const quote = await quoteLines(await getStore(), parsed.data.lines);
  return NextResponse.json(quote);
}
