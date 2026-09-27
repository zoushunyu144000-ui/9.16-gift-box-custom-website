import Link from "next/link";
import { Empty, OrderStatusPill, PageTitle } from "@/components/admin/ui";
import { formatRM, ORDER_STATUS } from "@/lib/catalog";
import { formatDate, formatDateTime } from "@/lib/dates";
import { getStore } from "@/lib/store";
import type { OrderStatus } from "@/lib/types";

export const metadata = { title: "Orders" };

export default async function OrdersPage({ searchParams }: PageProps<"/admin/orders">) {
  const { status, q } = await searchParams;
  const all = await (await getStore()).listOrders();
  const term = typeof q === "string" ? q.trim().toLowerCase() : "";
  const filtered = all.filter(
    (o) =>
      (typeof status !== "string" || o.status === status) &&
      (!term || [o.id, o.customer.name, o.customer.email, o.customer.phone, o.recipient.name].some((v) => v.toLowerCase().includes(term))),
  );
  const tabs: (OrderStatus | "all")[] = ["all", "paid", "preparing", "out_for_delivery", "completed", "pending_payment", "payment_failed", "cancelled"];
  const current = typeof status === "string" ? status : "all";

  return (
    <>
      <PageTitle title="Orders" sub={`${all.length} total`} />
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
          {tabs.map((t) => (
            <Link
              key={t}
              href={t === "all" ? "/admin/orders" : `/admin/orders?status=${t}`}
              className={`flex-none border px-3 py-1.5 text-[12px] ${current === t ? "border-ink bg-ink text-ivory" : "border-line-strong bg-ivory hover:border-ink"}`}
            >
              {t === "all" ? "All" : ORDER_STATUS[t].label} ({t === "all" ? all.length : all.filter((o) => o.status === t).length})
            </Link>
          ))}
        </div>
        <form className="flex gap-2">
          {typeof status === "string" && <input type="hidden" name="status" value={status} />}
          <input name="q" defaultValue={term} placeholder="Search name, phone, order no." className="field !min-h-9 !py-1.5 text-[14px] md:w-64" />
        </form>
      </div>
      {filtered.length === 0 ? (
        <Empty>No orders match this view.</Empty>
      ) : (
        <div className="overflow-x-auto border border-line bg-ivory">
          <table className="w-full min-w-[760px] text-left text-[14px]">
            <thead className="border-b border-line text-[11px] uppercase tracking-[0.12em] text-ink-3">
              <tr>
                <th className="px-4 py-3 font-medium">Order</th>
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Deliver on</th>
                <th className="px-4 py-3 font-medium">Items</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filtered.map((o) => (
                <tr key={o.id} className="hover:bg-cream/50">
                  <td className="px-4 py-3">
                    <Link href={`/admin/orders/${o.id}`} className="font-medium underline-offset-4 hover:underline">{o.id}</Link>
                    <div className="text-[12px] text-ink-3">{formatDateTime(o.createdAt)}</div>
                  </td>
                  <td className="px-4 py-3">
                    {o.customer.name}
                    <div className="text-[12px] text-ink-3">{o.customer.phone}</div>
                  </td>
                  <td className="px-4 py-3">{formatDate(o.deliveryDate, { day: "numeric", month: "short" })}</td>
                  <td className="px-4 py-3">
                    {o.items.reduce((n, i) => n + i.quantity, 0)}
                    {o.items.some((i) => i.personalisation) && <span className="ml-2 text-[11px] text-bronze">Engraving</span>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatRM(o.total, { decimals: true })}</td>
                  <td className="px-4 py-3"><OrderStatusPill status={o.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
