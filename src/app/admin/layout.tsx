import { redirect } from "next/navigation";
import { isVendureConfigured } from "@/lib/store";
import { dashboardUrl } from "@/lib/vendure/client";

/** With the commerce backend, staff work in its dashboard; this admin serves the Supabase and demo setups. */
export default function AdminRoot({ children }: { children: React.ReactNode }) {
  if (isVendureConfigured) redirect(dashboardUrl());
  return children;
}
