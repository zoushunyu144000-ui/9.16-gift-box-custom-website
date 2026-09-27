import "server-only";
import { connection } from "next/server";
import { demoStore } from "./demo";
import { supabaseStore } from "./supabase";
import type { Store } from "./types";

export const isSupabaseConfigured = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

/**
 * Returns the active data store. Calling this opts the current render out of
 * static prerendering so catalogue and order data is always current.
 */
export async function getStore(): Promise<Store> {
  await connection();
  return isSupabaseConfigured ? supabaseStore : demoStore;
}

export type { Store };
