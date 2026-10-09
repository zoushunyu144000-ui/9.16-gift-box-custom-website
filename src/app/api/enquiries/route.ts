import { NextResponse } from "next/server";
import { z } from "zod";
import { newOrderId } from "@/lib/security";
import { getStore, isVendureConfigured } from "@/lib/store";
import type { Enquiry } from "@/lib/types";
import { submitVendureEnquiry } from "@/lib/vendure/enquiries";

const contact = z.object({
  name: z.string().trim().min(2, "Please enter your name").max(80),
  company: z.string().trim().max(120).optional().or(z.literal("")),
  email: z.string().trim().email("Please enter a valid email").max(120).optional().or(z.literal("")),
  phone: z.string().trim().regex(/^[+0-9 ()-]{8,20}$/, "Please enter a valid phone number"),
});

const Semi = z.object({
  type: z.literal("semi-curated"),
  contact: contact.extend({ email: z.string().trim().email("Please enter a valid email").max(120) }),
  items: z.array(z.object({ productId: z.string().max(80), quantity: z.number().int().min(1).max(10000) })).min(1, "Please choose at least one gift").max(30),
  customisation: z.object({
    companyNameOnCard: z.string().trim().max(80).optional(),
    cardMessage: z.string().trim().max(300).optional(),
    logoOnPackaging: z.boolean().optional(),
    notes: z.string().trim().max(1000).optional(),
  }),
  deliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Please choose a date"),
  deliveryAddress: z.string().trim().min(5, "Please enter the delivery address").max(500),
  multipleAddresses: z.boolean(),
});

const Bespoke = z.object({
  type: z.literal("bespoke"),
  contact,
  style: z.string().trim().min(2, "Please describe the style").max(300),
  quantity: z.number().int().min(1, "Please enter a quantity").max(100000),
  budgetPerGift: z.string().trim().max(60).optional(),
  deliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Please choose a date"),
  deliveryAddress: z.string().trim().min(3, "Please enter the delivery area or address").max(500),
  multipleAddresses: z.boolean(),
  notes: z.string().trim().max(1000).optional(),
});

const Body = z.discriminatedUnion("type", [Semi, Bespoke]);

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[i.path.join(".")] ??= i.message;
    return NextResponse.json({ error: "Please check the highlighted fields.", fieldErrors }, { status: 422 });
  }
  const body = parsed.data;
  if (isVendureConfigured) {
    try {
      const result = await submitVendureEnquiry(body);
      return result.ok ? NextResponse.json({ id: result.code }) : NextResponse.json({ error: result.error }, { status: result.status });
    } catch (err) {
      console.error("[enquiries] backend submit failed", err);
      return NextResponse.json({ error: "We couldn't send your request. Please try again or contact us on WhatsApp." }, { status: 502 });
    }
  }
  const store = await getStore();
  const now = new Date().toISOString();
  const base = {
    id: newOrderId(body.type === "bespoke" ? "MCB" : "MCQ"),
    status: "new" as const,
    createdAt: now,
    updatedAt: now,
    contact: { ...body.contact, company: body.contact.company || undefined, email: body.contact.email || "" },
    deliveryDate: body.deliveryDate,
    deliveryAddress: body.deliveryAddress,
    multipleAddresses: body.multipleAddresses,
  };

  let enquiry: Enquiry;
  if (body.type === "semi-curated") {
    const products = await store.listProducts();
    const items = body.items.map((i) => {
      const p = products.find((x) => x.id === i.productId && x.status !== "hidden");
      return p ? { productId: p.id, name: p.name, unitPrice: p.price, quantity: i.quantity } : null;
    });
    if (items.some((i) => !i)) return NextResponse.json({ error: "One of the selected gifts is no longer available." }, { status: 409 });
    enquiry = { ...base, type: "semi-curated", items: items as NonNullable<(typeof items)[number]>[], customisation: body.customisation };
  } else {
    enquiry = {
      ...base,
      type: "bespoke",
      style: body.style,
      quantity: body.quantity,
      budgetPerGift: body.budgetPerGift || undefined,
      notes: body.notes || undefined,
    };
  }

  try {
    await store.createEnquiry(enquiry);
  } catch (err) {
    console.error("[enquiries] save failed", err);
    return NextResponse.json({ error: "We couldn't send your request. Please try again or contact us on WhatsApp." }, { status: 500 });
  }
  return NextResponse.json({ id: enquiry.id });
}
