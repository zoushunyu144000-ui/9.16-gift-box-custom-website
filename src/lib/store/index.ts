import "server-only";
import { connection } from "next/server";
import { isVendureConfigured } from "@/lib/vendure/client";
import { demoStore } from "./demo";
import { supabaseStore } from "./supabase";
import { vendureStore } from "./vendure";
import type { Store } from "./types";
import { ALCOHOL_ON_SALE, withoutAlcohol } from "@/lib/alcohol";
import type { Product } from "@/lib/types";

export const isSupabaseConfigured = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
export { isVendureConfigured };

/**
 * Returns the active data store: the commerce backend when VENDURE_SHOP_API_URL is set, else the
 * original Supabase store, else the demo store. Calling this opts the current render out of static
 * prerendering so catalogue and order data is always current.
 */
export async function getStore(): Promise<Store> {
  await connection();
  return withAlcoholHidden(isVendureConfigured ? vendureStore : isSupabaseConfigured ? supabaseStore : demoStore);
}

/** Every page reads products through here, so wine gift boxes disappear everywhere at once (see lib/alcohol). */
function withAlcoholHidden(store: Store): Store {
  if (ALCOHOL_ON_SALE) return store;
  const visible = async (p: Product | null) => (p && withoutAlcohol([p])[0]) ?? null;
  return {
    ...store,
    listProducts: async () => withoutAlcohol(await store.listProducts()),
    getProductBySlug: async (slug) => visible(await store.getProductBySlug(slug)),
    getProductById: async (id) => visible(await store.getProductById(id)),
  };
}

export type { Store };
