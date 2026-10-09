import { NextResponse } from "next/server";
import { z } from "zod";
import { MALAYSIAN_STATES } from "@/lib/catalog";
import { publicOrder } from "@/lib/orders";
import { getPaymentProvider } from "@/lib/payments";
import { quoteLines } from "@/lib/pricing";
import { newOrderId, orderAccessToken } from "@/lib/security";
import { getStore, isVendureConfigured } from "@/lib/store";
import type { Order } from "@/lib/types";
import { earliestDeliveryDate } from "@/lib/dates";
import { placeVendureOrder } from "@/lib/vendure/checkout";
import { publicOrigin } from "@/lib/vendure/payments";

const phone = z
  .string()
  .trim()
  .min(8, "Please enter a valid phone number")
  .max(20)
  .regex(/^[+0-9 ()-]+$/, "Please enter a valid phone number");

const Body = z.object({
  customer: z.object({
    name: z.string().trim().min(2, "Please enter your name").max(80),
    email: z.string().trim().email("Please enter a valid email").max(120),
    phone,
  }),
  recipient: z.object({
    name: z.string().trim().min(2, "Please enter the recipient's name").max(80),
    phone,
  }),
  address: z.object({
    line1: z.string().trim().min(3, "Please enter the street address").max(120),
    line2: z.string().trim().max(120).optional().or(z.literal("")),
    postcode: z.string().trim().regex(/^\d{5}$/, "Postcode must be 5 digits"),
    city: z.string().trim().min(2, "Please enter the city").max(60),
    state: z.enum(MALAYSIAN_STATES as [string, ...string[]], { message: "Please choose a state" }),
  }),
  deliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Please choose a delivery date"),
  deliveryNotes: z.string().trim().max(300).optional().or(z.literal("")),
  /** With the commerce backend's delivery zones: the delivery option chosen at checkout. */
  deliveryOptionId: z.string().max(40).optional(),
  /** With the commerce backend: a discount code, and a member's points to use. */
  couponCode: z.string().max(60).optional(),
  loyaltyPoints: z.number().int().min(0).max(10_000_000).optional(),
  paymentMethod: z.enum(["fpx", "card", "ewallet"]),
  ageConfirmed: z.boolean(),
  termsAccepted: z.literal(true, { message: "Please accept the terms of sale" }),
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
    .min(1, "Your bag is empty")
    .max(50),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return NextResponse.json({ error: "Please check the highlighted fields.", fieldErrors }, { status: 422 });
  }
  const body = parsed.data;
  const store = await getStore();
  const settings = await store.getSettings();

  if (body.deliveryDate < earliestDeliveryDate(settings.deliveryLeadDays)) {
    return NextResponse.json(
      { error: "Please choose a later delivery date.", fieldErrors: { deliveryDate: "This date is no longer available." } },
      { status: 422 },
    );
  }

  if (isVendureConfigured) {
    try {
      const result = await placeVendureOrder(body, publicOrigin(req));
      if (!result.ok) {
        const { error, fieldErrors, lineProblems, signIn } = result;
        return NextResponse.json({ error, fieldErrors, lineProblems, signIn }, { status: result.status });
      }
      return NextResponse.json({ orderId: result.orderCode, accessToken: "", snapshot: "", redirectUrl: result.redirectUrl });
    } catch (err) {
      console.error("[checkout] backend order failed", err);
      return NextResponse.json({ error: "We couldn't create your order. Please try again in a moment." }, { status: 502 });
    }
  }

  const quote = await quoteLines(store, body.lines, settings);
  if (quote.hasProblems) {
    return NextResponse.json(
      { error: "Some items in your bag need attention before you can pay.", quote },
      { status: 409 },
    );
  }
  if (quote.containsAlcohol && !body.ageConfirmed) {
    return NextResponse.json(
      { error: "Please confirm you are 21 or older to buy alcohol.", fieldErrors: { ageConfirmed: "Required for alcohol" } },
      { status: 422 },
    );
  }

  const provider = getPaymentProvider();
  const now = new Date().toISOString();
  const order: Order = {
    id: newOrderId(),
    status: "pending_payment",
    createdAt: now,
    updatedAt: now,
    customer: body.customer,
    recipient: body.recipient,
    address: { ...body.address, line2: body.address.line2 || undefined },
    deliveryDate: body.deliveryDate,
    deliveryNotes: body.deliveryNotes || undefined,
    items: quote.lines.map((l) => l.item!),
    subtotal: quote.subtotal,
    deliveryFee: quote.deliveryFee,
    total: quote.total,
    payment: { method: body.paymentMethod, provider: provider.id },
    ageConfirmed: quote.containsAlcohol ? body.ageConfirmed : false,
  };

  try {
    await store.createOrder(order);
    const accessToken = orderAccessToken(order.id);
    const { redirectUrl, reference } = await provider.start(order, { origin: new URL(req.url).origin, accessToken });
    if (reference) {
      order.payment.reference = reference;
      await store.saveOrder(order);
    }
    return NextResponse.json({ orderId: order.id, accessToken, redirectUrl, ...publicOrder(order) });
  } catch (err) {
    console.error("[checkout] failed to create order", err);
    return NextResponse.json({ error: "We couldn't create your order. Please try again in a moment." }, { status: 500 });
  }
}
