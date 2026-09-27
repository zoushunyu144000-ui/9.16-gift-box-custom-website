import Link from "next/link";
import { Empty, ENQUIRY_STATUS, PageTitle, Pill } from "@/components/admin/ui";
import { formatDate, formatDateTime } from "@/lib/dates";
import { getStore } from "@/lib/store";

export const metadata = { title: "Corporate enquiries" };

export default async function EnquiriesPage() {
  const list = await (await getStore()).listEnquiries();
  return (
    <>
      <PageTitle title="Corporate enquiries" sub="Semi-curated requests and fully customised enquiries" />
      {list.length === 0 ? (
        <Empty>No enquiries yet. Requests from the Corporate Orders pages appear here.</Empty>
      ) : (
        <div className="overflow-x-auto border border-line bg-ivory">
          <table className="w-full min-w-[720px] text-left text-[14px]">
            <thead className="border-b border-line text-[11px] uppercase tracking-[0.12em] text-ink-3">
              <tr>
                <th className="px-4 py-3 font-medium">Reference</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Contact</th>
                <th className="px-4 py-3 font-medium">Quantity</th>
                <th className="px-4 py-3 font-medium">Needed by</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {list.map((e) => (
                <tr key={e.id} className="hover:bg-cream/50">
                  <td className="px-4 py-3">
                    <Link href={`/admin/enquiries/${e.id}`} className="font-medium underline-offset-4 hover:underline">{e.id}</Link>
                    <div className="text-[12px] text-ink-3">{formatDateTime(e.createdAt)}</div>
                  </td>
                  <td className="px-4 py-3">{e.type === "bespoke" ? "Fully customised" : "Semi-curated"}</td>
                  <td className="px-4 py-3">
                    {e.contact.name}
                    <div className="text-[12px] text-ink-3">{e.contact.company || e.contact.phone}</div>
                  </td>
                  <td className="px-4 py-3 tabular-nums">{e.type === "bespoke" ? e.quantity : e.items?.reduce((n, i) => n + i.quantity, 0)}</td>
                  <td className="px-4 py-3">{formatDate(e.deliveryDate, { day: "numeric", month: "short", year: "numeric" })}</td>
                  <td className="px-4 py-3"><Pill tone={ENQUIRY_STATUS[e.status].tone}>{ENQUIRY_STATUS[e.status].label}</Pill></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
