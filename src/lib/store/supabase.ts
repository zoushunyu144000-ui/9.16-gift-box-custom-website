import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { seedSettings } from "@/data/seed";
import type { Enquiry, Festival, Order, Product, SiteSettings } from "@/lib/types";
import { normalizeProduct, normalizeSettings } from "./normalize";
import type { Store } from "./types";

/**
 * Supabase store (production).
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (server-side only — never expose
 * the service role key to the browser). Run supabase/schema.sql once to create tables,
 * then `npm run seed:supabase` to load the starter catalogue.
 *
 * Each table keeps the full record in a `data` jsonb column plus a few indexed columns
 * used for filtering and sorting. This keeps the schema small and easy to evolve.
 */

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "product-images";

let client: SupabaseClient | null = null;
function db() {
  if (!client) {
    client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(`[supabase] ${res.error.message}`);
  return res.data;
}

type Row<T> = { data: T };

export const supabaseStore: Store = {
  kind: "supabase",

  async listProducts() {
    const rows = check(await db().from("products").select("data").order("sort", { ascending: true })) as Row<Product>[];
    return rows.map((r) => normalizeProduct(r.data));
  },
  async getProductBySlug(slug) {
    const row = check(await db().from("products").select("data").eq("slug", slug).maybeSingle()) as Row<Product> | null;
    return row ? normalizeProduct(row.data) : null;
  },
  async getProductById(id) {
    const row = check(await db().from("products").select("data").eq("id", id).maybeSingle()) as Row<Product> | null;
    return row ? normalizeProduct(row.data) : null;
  },
  async saveProduct(product) {
    check(
      await db().from("products").upsert({
        id: product.id,
        slug: product.slug,
        category: product.category,
        status: product.status,
        festival_id: product.festivalId ?? null,
        stock: typeof product.stock === "number" ? product.stock : null,
        featured: product.featured,
        sort: product.sort,
        data: product,
        updated_at: product.updatedAt,
      }),
    );
    return product;
  },
  async deleteProduct(id) {
    check(await db().from("products").delete().eq("id", id));
  },
  async adjustStock(productId, delta) {
    // Atomic in the database (see adjust_product_stock in supabase/schema.sql).
    check(await db().rpc("adjust_product_stock", { p_id: productId, p_delta: Math.trunc(delta) }));
  },

  async listFestivals() {
    const rows = check(await db().from("festivals").select("data").order("sort", { ascending: true })) as Row<Festival>[];
    return rows.map((r) => r.data);
  },
  async saveFestival(festival) {
    check(
      await db().from("festivals").upsert({
        id: festival.id,
        slug: festival.slug,
        name: festival.name,
        active: festival.active,
        sort: festival.sort,
        data: festival,
        updated_at: festival.updatedAt ?? new Date().toISOString(),
      }),
    );
    return festival;
  },
  async deleteFestival(id) {
    check(await db().from("festivals").delete().eq("id", id));
  },

  async getSettings() {
    const row = check(await db().from("settings").select("data").eq("key", "site").maybeSingle()) as Row<SiteSettings> | null;
    return { ...seedSettings, ...normalizeSettings(row?.data ?? {}) };
  },
  async saveSettings(settings) {
    check(await db().from("settings").upsert({ key: "site", data: settings, updated_at: new Date().toISOString() }));
    return settings;
  },

  async createOrder(order) {
    check(
      await db().from("orders").insert({
        id: order.id,
        status: order.status,
        email: order.customer.email,
        total: order.total,
        data: order,
        created_at: order.createdAt,
        updated_at: order.updatedAt,
      }),
    );
    return order;
  },
  async getOrder(id) {
    const row = check(await db().from("orders").select("data").eq("id", id).maybeSingle()) as Row<Order> | null;
    return row?.data ?? null;
  },
  async saveOrder(order) {
    check(
      await db()
        .from("orders")
        .update({ status: order.status, total: order.total, data: order, updated_at: order.updatedAt })
        .eq("id", order.id),
    );
    return order;
  },
  async listOrders() {
    const rows = check(await db().from("orders").select("data").order("created_at", { ascending: false }).limit(500)) as Row<Order>[];
    return rows.map((r) => r.data);
  },

  async createEnquiry(enquiry) {
    check(
      await db().from("enquiries").insert({
        id: enquiry.id,
        type: enquiry.type,
        status: enquiry.status,
        data: enquiry,
        created_at: enquiry.createdAt,
        updated_at: enquiry.updatedAt,
      }),
    );
    return enquiry;
  },
  async getEnquiry(id) {
    const row = check(await db().from("enquiries").select("data").eq("id", id).maybeSingle()) as Row<Enquiry> | null;
    return row?.data ?? null;
  },
  async saveEnquiry(enquiry) {
    check(
      await db()
        .from("enquiries")
        .update({ status: enquiry.status, data: enquiry, updated_at: enquiry.updatedAt })
        .eq("id", enquiry.id),
    );
    return enquiry;
  },
  async listEnquiries() {
    const rows = check(await db().from("enquiries").select("data").order("created_at", { ascending: false }).limit(500)) as Row<Enquiry>[];
    return rows.map((r) => r.data);
  },

  async saveUpload(fileName, data, contentType) {
    const path = `products/${fileName}`;
    const { error } = await db().storage.from(BUCKET).upload(path, data, { contentType, upsert: false, cacheControl: "31536000" });
    if (error) throw new Error(`[supabase-storage] ${error.message}`);
    return db().storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  },
};
