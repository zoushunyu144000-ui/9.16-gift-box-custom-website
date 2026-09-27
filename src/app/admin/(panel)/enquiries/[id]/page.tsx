import Link from "next/link";
import { notFound } from "next/navigation";
import { EnquiryEditor } from "@/components/admin/record-editor";
import { Card, ENQUIRY_STATUS, PageTitle, Pill } from "@/components/admin/ui";
import { formatRM } from "@/lib/catalog";
import { formatDate, formatDateTime } from "@/lib/dates";
import { getStore } from "@/lib/store";

export default async function EnquiryDetail({ params }: PageProps<"/admin/enquiries/[id]">) {
  const { id } = await params;
  const e = await (await getStore()).getEnquiry(id);
  if (!e) notFound();
  const indicative = e.items?.reduce((n, i) => n + i.unitPrice * i.quantity, 0) ?? 0;
  const rows: [string, React.ReactNode][] = [
    ["Needed by", formatDate(e.deliveryDate, { weekday: "short", day: "numeric", month: "long", year: "numeric" })],
    ["Delivery", <span key="a" className="whitespace-pre-line">{e.deliveryAddress}{e.multipleAddresses ? "\n(multiple addresses)" : ""}</span>],
  ];
  if (e.type === "bespoke") {
    rows.unshift(["Style", e.style], ["Quantity", String(e.quantity)]);
    if (e.budgetPerGift) rows.push(["Budget per gift", e.budgetPerGift]);
  }
  return (
    <>
      <Link href="/admin/enquiries" className="text-[13px] text-ink-2 hover:text-ink">← Enquiries</Link>
      <PageTitle title={e.contact.company || e.contact.name} sub={`${e.type === "bespoke" ? "Fully customised" : "Semi-curated"} · ${e.id} · ${formatDateTime(e.createdAt)}`}>
        <Pill tone={ENQUIRY_STATUS[e.status].tone}>{ENQUIRY_STATUS[e.status].label}</Pill>
      </PageTitle>
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          {e.items && (
            <Card title="Selected gifts">
              <ul className="-my-2 divide-y divide-line text-[14px]">
                {e.items.map((i) => (
                  <li key={i.productId} className="flex justify-between gap-4 py-2.5">
                    <span>{i.quantity} × {i.name}</span>
                    <span className="tabular-nums text-ink-2">{formatRM(i.unitPrice)} each</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 border-t border-line pt-3 text-[14px]">Indicative value at standard prices: <strong className="font-medium">{formatRM(indicative)}</strong></p>
            </Card>
          )}
          {e.customisation && (
            <Card title="Customisation requested">
              <dl className="grid grid-cols-[10rem_1fr] gap-y-2 text-[14px]">
                <dt className="text-ink-2">Name on card</dt><dd>{e.customisation.companyNameOnCard || "—"}</dd>
                <dt className="text-ink-2">Logo on packaging</dt><dd>{e.customisation.logoOnPackaging ? "Yes — request artwork" : "No"}</dd>
                <dt className="text-ink-2">Card message</dt><dd className="whitespace-pre-line">{e.customisation.cardMessage || "—"}</dd>
                <dt className="text-ink-2">Notes</dt><dd className="whitespace-pre-line">{e.customisation.notes || "—"}</dd>
              </dl>
            </Card>
          )}
          <Card title="Details">
            <dl className="grid grid-cols-[10rem_1fr] gap-y-2 text-[14px]">
              {rows.map(([k, v]) => (
                <div key={k} className="contents"><dt className="text-ink-2">{k}</dt><dd>{v}</dd></div>
              ))}
            </dl>
          </Card>
          <Card title="Contact">
            <p className="text-[14px] leading-relaxed">
              {e.contact.name}{e.contact.company ? ` · ${e.contact.company}` : ""}<br />
              {e.contact.email && <><a href={`mailto:${e.contact.email}`} className="underline underline-offset-4">{e.contact.email}</a><br /></>}
              <a href={`https://wa.me/${e.contact.phone.replace(/\D/g, "").replace(/^0/, "60")}`} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">{e.contact.phone} (WhatsApp)</a>
            </p>
          </Card>
        </div>
        <Card title="Manage">
          <EnquiryEditor id={e.id} status={e.status} notes={e.internalNotes ?? ""} options={Object.entries(ENQUIRY_STATUS).map(([value, s]) => ({ value, label: s.label }))} />
        </Card>
      </div>
    </>
  );
}
