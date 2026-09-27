import Link from "next/link";
import { Card, Empty, OrderStatusPill, PageTitle, Pill, ENQUIRY_STATUS } from "@/components/admin/ui";
import { formatRM } from "@/lib/catalog";
import { formatDateTime } from "@/lib/dates";
import { getStore } from "@/lib/store";

export default async function AdminHome() {
  const store = await getStore();
  const [orders, enquiries, products, settings] = await Promise.all([store.listOrders(), store.listEnquiries(), store.listProducts(), store.getSettings()]);
  const paid = orders.filter((o) => !["pending_payment", "payment_failed", "cancelled"].includes(o.status));
  const toFulfil = orders.filter((o) => o.status === "paid" || o.status === "preparing");
  const revenue = paid.reduce((n, o) => n + o.total, 0);
  const newEnq = enquiries.filter((e) => e.status === "new");

  const stats = [
    { label: "Orders to fulfil", value: String(toFulfil.length), href: "/admin/orders?status=paid" },
    { label: "Paid orders", value: String(paid.length), href: "/admin/orders" },
    { label: "Paid revenue", value: formatRM(revenue), href: "/admin/orders" },
    { label: "New enquiries", value: String(newEnq.length), href: "/admin/enquiries" },
  ];

  return (
    <>
      <PageTitle title="Overview" sub={`Homepage season: ${settings.festiveTitle} · ${products.filter((p) => p.status === "active").length} products on sale`}>
        <Link href="/admin/products/new" className="btn btn-primary">Add product</Link>
      </PageTitle>
      <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="border border-line bg-ivory p-5 transition-colors hover:border-champagne">
            <p className="text-[12px] text-ink-2">{s.label}</p>
            <p className="mt-2 text-[1.6rem] tabular-nums">{s.value}</p>
          </Link>
        ))}
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card title="Latest orders" action={<Link href="/admin/orders" className="text-[12px] underline underline-offset-4">All orders</Link>}>
          {orders.length === 0 ? (
            <Empty>No orders yet. Orders placed on the website appear here.</Empty>
          ) : (
            <ul className="-my-2 divide-y divide-line">
              {orders.slice(0, 6).map((o) => (
                <li key={o.id}>
                  <Link href={`/admin/orders/${o.id}`} className="flex items-center justify-between gap-4 py-3 hover:text-bronze">
                    <span className="min-w-0">
                      <span className="block text-[14px]">{o.id} · {o.customer.name}</span>
                      <span className="block text-[12px] text-ink-3">{formatDateTime(o.createdAt)}</span>
                    </span>
                    <span className="flex flex-none items-center gap-3">
                      <span className="text-[14px] tabular-nums">{formatRM(o.total)}</span>
                      <OrderStatusPill status={o.status} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Corporate enquiries" action={<Link href="/admin/enquiries" className="text-[12px] underline underline-offset-4">All enquiries</Link>}>
          {enquiries.length === 0 ? (
            <Empty>No enquiries yet.</Empty>
          ) : (
            <ul className="-my-2 divide-y divide-line">
              {enquiries.slice(0, 6).map((e) => (
                <li key={e.id}>
                  <Link href={`/admin/enquiries/${e.id}`} className="flex items-center justify-between gap-4 py-3 hover:text-bronze">
                    <span className="min-w-0">
                      <span className="block text-[14px]">{e.contact.company || e.contact.name}</span>
                      <span className="block text-[12px] text-ink-3">{e.type === "bespoke" ? "Fully customised" : "Semi-curated"} · {formatDateTime(e.createdAt)}</span>
                    </span>
                    <Pill tone={ENQUIRY_STATUS[e.status].tone}>{ENQUIRY_STATUS[e.status].label}</Pill>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
