"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { slugify } from "../catalog";
import { getStore } from "../store";
import type { Enquiry, EnquiryStatus, Order, OrderStatus, Product, SiteSettings } from "../types";
import { checkPassword, createSession, destroySession, requireAdmin } from "./auth";

// ───────── Auth ─────────
export async function loginAction(_prev: { error?: string } | undefined, form: FormData) {
  const pw = String(form.get("password") ?? "");
  // Small constant delay to slow down guessing
  await new Promise((r) => setTimeout(r, 400));
  if (!checkPassword(pw)) return { error: "Incorrect password." };
  await createSession();
  redirect("/admin");
}

export async function logoutAction() {
  await destroySession();
  redirect("/admin/login");
}

// ───────── Products ─────────
const ProductInput = z.object({
  id: z.string().max(80).optional(),
  name: z.string().trim().min(2, "Name is required").max(120),
  slug: z.string().trim().max(120).optional(),
  category: z.enum(["festive", "fixed-gifts", "wine-spirits"]),
  occasion: z.enum(["chinese-new-year", "mid-autumn", "dragon-boat", "hari-raya"]).nullable().optional(),
  status: z.enum(["active", "sold_out", "hidden"]),
  availabilityNote: z.string().trim().max(60).optional(),
  price: z.number().min(0).max(1_000_000),
  summary: z.string().trim().max(200),
  description: z.string().trim().max(3000),
  contents: z.array(z.string().trim().max(200)).max(40),
  specs: z.array(z.object({ label: z.string().trim().max(60), value: z.string().trim().max(200) })).max(30),
  allergens: z.string().trim().max(500).optional(),
  storage: z.string().trim().max(500).optional(),
  images: z
    .array(z.object({ src: z.string().trim().min(1).max(1000), alt: z.string().trim().max(200), credit: z.string().max(200).optional(), width: z.number().optional(), height: z.number().optional() }))
    .max(20),
  variants: z
    .array(z.object({ id: z.string().trim().max(60), name: z.string().trim().min(1).max(80), price: z.number().min(0).max(1_000_000), note: z.string().trim().max(160).optional(), containsAlcohol: z.boolean().optional() }))
    .max(12),
  personalisation: z
    .object({ enabled: z.boolean(), label: z.string().trim().max(60), helper: z.string().trim().max(160).optional(), maxLength: z.number().int().min(1).max(60), fee: z.number().min(0).max(10000) })
    .nullable(),
  containsAlcohol: z.boolean(),
  featured: z.boolean(),
  sort: z.number().int().min(0).max(100000),
});

export type ProductInputType = z.infer<typeof ProductInput>;

export async function saveProductAction(input: ProductInputType): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  await requireAdmin();
  const parsed = ProductInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid product" };
  const data = parsed.data;
  const store = await getStore();
  const all = await store.listProducts();
  const existing = data.id ? all.find((p) => p.id === data.id) : undefined;
  const slug = slugify(data.slug || data.name);
  if (!slug) return { ok: false, error: "Please enter a URL name (slug)." };
  if (all.some((p) => p.slug === slug && p.id !== existing?.id)) return { ok: false, error: `Another product already uses the URL “${slug}”.` };
  const variants = data.variants.map((v, i) => ({ ...v, id: v.id || slugify(v.name) || `option-${i + 1}` }));
  if (new Set(variants.map((v) => v.id)).size !== variants.length) return { ok: false, error: "Each option needs a different name." };

  const now = new Date().toISOString();
  const product: Product = {
    ...(existing ?? {}),
    id: existing?.id ?? `p_${Date.now().toString(36)}`,
    slug,
    name: data.name,
    category: data.category,
    occasion: data.category === "festive" ? (data.occasion ?? null) : null,
    status: data.status,
    availabilityNote: data.availabilityNote || undefined,
    price: variants.length ? variants[0].price : data.price,
    summary: data.summary,
    description: data.description,
    contents: data.contents.filter(Boolean),
    specs: data.specs.filter((s) => s.label && s.value),
    allergens: data.allergens || undefined,
    storage: data.storage || undefined,
    images: data.images,
    variants,
    personalisation: data.personalisation?.enabled ? data.personalisation : null,
    containsAlcohol: data.containsAlcohol,
    featured: data.featured,
    sort: data.sort,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await store.saveProduct(product);
  revalidatePath("/", "layout");
  return { ok: true, id: product.id };
}

export async function deleteProductAction(id: string) {
  await requireAdmin();
  await (await getStore()).deleteProduct(id);
  revalidatePath("/", "layout");
  redirect("/admin/products");
}

export async function setProductStatusAction(id: string, status: Product["status"]) {
  await requireAdmin();
  const store = await getStore();
  const p = await store.getProductById(id);
  if (!p || !["active", "sold_out", "hidden"].includes(status)) return;
  await store.saveProduct({ ...p, status, updatedAt: new Date().toISOString() });
  revalidatePath("/", "layout");
}

// ───────── Orders ─────────
const ORDER_STATUSES: OrderStatus[] = ["pending_payment", "payment_failed", "paid", "preparing", "out_for_delivery", "completed", "cancelled"];

export async function updateOrderAction(id: string, patch: { status?: OrderStatus; internalNotes?: string }) {
  await requireAdmin();
  const store = await getStore();
  const order = await store.getOrder(id);
  if (!order) return { ok: false as const };
  const next: Order = {
    ...order,
    status: patch.status && ORDER_STATUSES.includes(patch.status) ? patch.status : order.status,
    internalNotes: patch.internalNotes !== undefined ? patch.internalNotes.slice(0, 2000) : order.internalNotes,
    updatedAt: new Date().toISOString(),
  };
  await store.saveOrder(next);
  revalidatePath(`/admin/orders/${id}`);
  revalidatePath("/admin/orders");
  return { ok: true as const };
}

// ───────── Enquiries ─────────
const ENQ_STATUSES: EnquiryStatus[] = ["new", "in_progress", "quoted", "confirmed", "closed"];

export async function updateEnquiryAction(id: string, patch: { status?: EnquiryStatus; internalNotes?: string }) {
  await requireAdmin();
  const store = await getStore();
  const e = await store.getEnquiry(id);
  if (!e) return { ok: false as const };
  const next: Enquiry = {
    ...e,
    status: patch.status && ENQ_STATUSES.includes(patch.status) ? patch.status : e.status,
    internalNotes: patch.internalNotes !== undefined ? patch.internalNotes.slice(0, 2000) : e.internalNotes,
    updatedAt: new Date().toISOString(),
  };
  await store.saveEnquiry(next);
  revalidatePath(`/admin/enquiries/${id}`);
  revalidatePath("/admin/enquiries");
  return { ok: true as const };
}

// ───────── Settings ─────────
const SettingsInput = z.object({
  activeOccasion: z.enum(["chinese-new-year", "mid-autumn", "dragon-boat", "hari-raya"]),
  festiveTitle: z.string().trim().min(2).max(80),
  festiveIntro: z.string().trim().max(300),
  heroEyebrow: z.string().trim().max(60),
  heroTitle: z.string().trim().min(2).max(80),
  heroText: z.string().trim().max(300),
  deliveryFee: z.number().min(0).max(10000),
  freeDeliveryThreshold: z.number().min(0).max(1_000_000).nullable(),
  deliveryLeadDays: z.number().int().min(0).max(60),
  deliveryNote: z.string().trim().max(300),
  whatsappNumber: z.string().trim().regex(/^\d{8,15}$/, "WhatsApp number: digits only, with country code (e.g. 60123456789)"),
  contactEmail: z.string().trim().email().max(120).or(z.literal("")),
  businessHours: z.string().trim().max(80),
  showPreviewNotice: z.boolean(),
});

export async function saveSettingsAction(input: SiteSettings): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const parsed = SettingsInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid settings" };
  await (await getStore()).saveSettings(parsed.data);
  revalidatePath("/", "layout");
  return { ok: true };
}
