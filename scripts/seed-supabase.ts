/**
 * Loads the starter catalogue and settings into Supabase.
 * Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run seed:supabase
 * Safe to re-run: existing products with the same id are overwritten, orders are untouched.
 */
import { createClient } from "@supabase/supabase-js";
import { seedFestivals, seedProducts, seedSettings } from "../src/data/seed";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

// Festivals first (products reference them). Existing festivals are left as the client edited them.
const festivalRows = seedFestivals.map((f) => ({ id: f.id, slug: f.slug, name: f.name, active: f.active, sort: f.sort, data: f }));
const { error: e0 } = await db.from("festivals").upsert(festivalRows, { onConflict: "id", ignoreDuplicates: true });
if (e0) throw e0;

const rows = seedProducts.map((p) => ({
  id: p.id,
  slug: p.slug,
  category: p.category,
  status: p.status,
  festival_id: p.festivalId ?? null,
  stock: typeof p.stock === "number" ? p.stock : null,
  featured: p.featured,
  sort: p.sort,
  data: p,
  updated_at: p.updatedAt,
}));
const { error: e1 } = await db.from("products").upsert(rows);
if (e1) throw e1;
const { error: e2 } = await db.from("settings").upsert({ key: "site", data: seedSettings });
if (e2) throw e2;
console.log(`Seeded ${festivalRows.length} festivals, ${rows.length} products and site settings.`);
