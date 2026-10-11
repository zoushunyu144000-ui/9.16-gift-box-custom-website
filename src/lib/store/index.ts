import "server-only";
import { connection } from "next/server";
import { isVendureConfigured } from "@/lib/vendure/client";
import { demoStore } from "./demo";
import { supabaseStore } from "./supabase";
import { vendureStore } from "./vendure";
import type { Store } from "./types";

export const isSupabaseConfigured = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
export { isVendureConfigured };

/**
 * Returns the active data store: the commerce backend when VENDURE_SHOP_API_URL is set, else the
 * original Supabase store, else the demo store. Calling this opts the current render out of static
 * prerendering so catalogue and order data is always current.
 */
export async function getStore(): Promise<Store> {
  await connection();
  if (isVendureConfigured) return vendureStore;
  return isSupabaseConfigured ? supabaseStore : demoStore;
}

export type { Store };
