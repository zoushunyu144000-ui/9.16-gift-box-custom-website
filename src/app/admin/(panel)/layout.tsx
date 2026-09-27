import type { Metadata } from "next";
import Link from "next/link";
import { AdminNav } from "@/components/admin/admin-nav";
import { Monogram } from "@/components/logo";
import { logoutAction } from "@/lib/admin/actions";
import { requireAdmin } from "@/lib/admin/auth";
import { getStore, isSupabaseConfigured } from "@/lib/store";

export const metadata: Metadata = { title: { default: "Admin", template: "%s · Admin · Moire Co." }, robots: { index: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  const store = await getStore();
  const [orders, enquiries] = await Promise.all([store.listOrders(), store.listEnquiries()]);
  const counts = {
    orders: orders.filter((o) => o.status === "paid").length,
    enquiries: enquiries.filter((e) => e.status === "new").length,
  };

  return (
    <div className="min-h-dvh bg-[#f6f3ee] lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="border-b border-line bg-ivory lg:sticky lg:top-0 lg:h-dvh lg:border-b-0 lg:border-r">
        <div className="flex h-14 items-center justify-between px-5 lg:h-20">
          <Link href="/admin" className="flex items-center gap-2.5">
            <Monogram className="h-7 w-auto text-champagne" />
            <span className="text-[12px] tracking-[0.28em]">ADMIN</span>
          </Link>
          <Link href="/" target="_blank" className="text-[12px] text-ink-2 underline-offset-4 hover:underline lg:hidden">
            View store ↗
          </Link>
        </div>
        <AdminNav counts={counts} />
        <div className="hidden px-5 pb-6 lg:absolute lg:bottom-0 lg:block lg:w-full">
          <Link href="/" target="_blank" className="block py-2 text-[13px] text-ink-2 hover:text-ink">
            View store ↗
          </Link>
          <form action={logoutAction}>
            <button className="py-2 text-[13px] text-ink-2 hover:text-ink">Sign out</button>
          </form>
        </div>
      </aside>
      <div className="min-w-0">
        {!isSupabaseConfigured && (
          <div className="border-b border-warn/20 bg-[#fbf3e4] px-5 py-2.5 text-[12px] text-warn md:px-10">
            Demo mode — no database connected. Changes are saved temporarily for this preview and may reset. Connect Supabase before launch.
          </div>
        )}
        <div className="px-5 py-8 md:px-10 md:py-10">{children}</div>
        <form action={logoutAction} className="px-5 pb-8 lg:hidden">
          <button className="text-[13px] text-ink-2 underline underline-offset-4">Sign out</button>
        </form>
      </div>
    </div>
  );
}
