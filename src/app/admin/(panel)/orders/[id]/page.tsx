import Link from "next/link";
import { notFound } from "next/navigation";
import { OrderEditor } from "@/components/admin/record-editor";
import { Card, OrderStatusPill, PageTitle } from "@/components/admin/ui";
import { formatRM, ORDER_STATUS, paymentMethodName, personalisationHeading } from "@/lib/catalog";
import { formatDate, formatDateTime } from "@/lib/dates";
import { getStore } from "@/lib/store";

export default async function OrderDetail({ params }: PageProps<"/admin/orders/[id]">) {
  const { id } = await params;
  const order = await (await getStore()).getOrder(id);
  if (!order) notFound();
  return (
    <>
      <Link href="/admin/orders" className="text-[13px] text-ink-2 hover:text-ink">← Orders</Link>
      <PageTitle title={`Order ${order.id}`} sub={`Placed ${formatDateTime(order.createdAt)}`}>
        <OrderStatusPill status={order.status} />
      </PageTitle>
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card title="Items">
            <ul className="-my-3 divide-y divide-line">
              {order.items.map((i, idx) => (
                <li key={idx} className="py-3">
                  <div className="flex justify-between gap-4 text-[15px]">
                    <span>{i.quantity} × {i.name}{i.variantName ? ` — ${i.variantName}` : ""}</span>
                    <span className="tabular-nums">{formatRM(i.lineTotal, { decimals: true })}</span>
                  </div>
                  {i.personalisation && (
                    <p className="mt-2 inline-block whitespace-pre-line bg-[#fbf0dc] px-2 py-1 text-[13px]">
                      <span className="text-ink-2">
                        {personalisationHeading(i.personalisationLabel, i.personalisationCount)}
                        {i.personalisationFee > 0 ? ` · ${formatRM(i.personalisationFee * (i.personalisationCount ?? 1))}` : ""}:
                      </span> <strong className="font-medium">{i.personalisation}</strong>
                    </p>
                  )}
                  {i.giftMessage && <p className="mt-2 border-l-2 border-champagne pl-3 text-[13px] italic text-ink-2">Card: “{i.giftMessage}”</p>}
                  {i.containsAlcohol && <p className="mt-1 text-[12px] text-ink-3">Contains alcohol</p>}
                </li>
              ))}
            </ul>
            <dl className="mt-4 space-y-1 border-t border-line pt-3 text-[14px]">
              <div className="flex justify-between"><dt className="text-ink-2">Subtotal</dt><dd className="tabular-nums">{formatRM(order.subtotal, { decimals: true })}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-2">Delivery</dt><dd className="tabular-nums">{formatRM(order.deliveryFee, { decimals: true })}</dd></div>
              <div className="flex justify-between text-[16px]"><dt>Total</dt><dd className="tabular-nums">{formatRM(order.total, { decimals: true })}</dd></div>
            </dl>
          </Card>
          <div className="grid gap-6 md:grid-cols-2">
            <Card title="Delivery">
              <p className="text-[14px] leading-relaxed">
                <strong className="font-medium">{order.recipient.name}</strong> · {order.recipient.phone}<br />
                {order.address.line1}{order.address.line2 ? <><br />{order.address.line2}</> : null}<br />
                {order.address.postcode} {order.address.city}, {order.address.state}
              </p>
              <p className="mt-3 text-[14px]">Preferred date: <strong className="font-medium">{formatDate(order.deliveryDate, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</strong></p>
              {order.deliveryNotes && <p className="mt-2 text-[13px] text-ink-2">Notes: {order.deliveryNotes}</p>}
            </Card>
            <Card title="Customer & payment">
              <p className="text-[14px] leading-relaxed">
                {order.customer.name}<br />
                <a href={`mailto:${order.customer.email}`} className="underline underline-offset-4">{order.customer.email}</a><br />
                <a href={`https://wa.me/${order.customer.phone.replace(/\D/g, "").replace(/^0/, "60")}`} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">{order.customer.phone}</a>
              </p>
              <p className="mt-3 text-[14px] text-ink-2">
                {paymentMethodName(order.payment.method)} · {order.payment.provider === "test" ? "Test mode" : order.payment.provider}
                {order.payment.reference && <><br />Ref {order.payment.reference}</>}
                {order.payment.paidAt && <><br />Paid {formatDateTime(order.payment.paidAt)}</>}
                {order.payment.failureReason && <><br /><span className="text-danger">{order.payment.failureReason}</span></>}
              </p>
              {order.ageConfirmed && <p className="mt-2 text-[12px] text-ink-3">Customer confirmed age 21+.</p>}
            </Card>
          </div>
        </div>
        <Card title="Manage">
          <OrderEditor
            id={order.id}
            status={order.status}
            notes={order.internalNotes ?? ""}
            options={Object.entries(ORDER_STATUS).map(([value, s]) => ({ value, label: s.label }))}
          />
        </Card>
      </div>
    </>
  );
}
