/**
 * Loads the starter catalogue and settings into Supabase.
 * Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run seed:supabase
 * Safe to re-run: existing products with the same id are overwritten, orders are untouched.
 */
import { createClient } from "@supabase/supabase-js";
import { seedProducts, seedSettings } from "../src/data/seed";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

const rows = seedProducts.map((p) => ({ id: p.id, slug: p.slug, category: p.category, status: p.status, featured: p.featured, sort: p.sort, data: p, updated_at: p.updatedAt }));
const { error: e1 } = await db.from("products").upsert(rows);
if (e1) throw e1;
const { error: e2 } = await db.from("settings").upsert({ key: "site", data: seedSettings });
if (e2) throw e2;
console.log(`Seeded ${rows.length} products and site settings.`);
