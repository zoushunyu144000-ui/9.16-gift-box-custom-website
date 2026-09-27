"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { formatRM, ORDER_STATUS, PAYMENT_METHODS, whatsappLink } from "@/lib/catalog";
import { formatDate } from "@/lib/dates";
import { useCart } from "../cart/cart-context";
import { Star } from "../logo";
import { ProductImage } from "../product-image";
import { useOrder } from "./use-order";

export function OrderView({ orderId, token, whatsappNumber }: { orderId: string; token: string; whatsappNumber: string }) {
  const { order, state, token: t } = useOrder(orderId, token);
  const { clear } = useCart();
  const cleared = useRef(false);

  // Empty the bag once payment is confirmed (not before — a failed payment keeps the bag).
  useEffect(() => {
    if (order?.status === "paid" && !cleared.current) {
      cleared.current = true;
      clear();
      try {
        sessionStorage.removeItem("moire.checkout.draft.v1");
      } catch {
        /* ignore */
      }
    }
  }, [order?.status, clear]);

  if (state === "loading") {
    return (
      <div className="shell max-w-3xl py-16">
        <div className="skeleton h-10 w-2/3" />
        <div className="skeleton mt-4 h-5 w-1/2" />
        <div className="skeleton mt-10 h-48 w-full" />
      </div>
    );
  }

  if (state !== "ready" || !order) {
    return (
      <div className="shell max-w-2xl py-24 text-center">
        <p className="display text-3xl">We couldn’t open this order</p>
        <p className="mx-auto mt-3 max-w-[44ch] text-ink-2">
          The link may be incomplete. Please use the link from your confirmation, or contact us with your order number <strong>{orderId}</strong>.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <a href={whatsappLink(whatsappNumber, `Hello Moire Co., I need help with order ${orderId}.`)} target="_blank" rel="noopener noreferrer" className="btn btn-primary">
            Contact us on WhatsApp
          </a>
          <Link href="/" className="btn btn-outline">
            Back to home
          </Link>
        </div>
      </div>
    );
  }

  const paid = !["pending_payment", "payment_failed", "cancelled"].includes(order.status);
  const failed = order.status === "payment_failed";
  const pending = order.status === "pending_payment";

  return (
    <div className="shell max-w-4xl pt-10 md:pt-16">
      <header className="border-b border-line pb-10 text-center">
        {paid && <Star className="mx-auto h-5 w-5 text-champagne animate-twinkle [animation-delay:200ms]" />}
        <p className="eyebrow mt-5">Order {order.id}</p>
        <h1 className="display mt-4 text-[2.4rem] leading-[1.05] md:text-[3.4rem]">
          {paid ? `Thank you, ${order.customer.name}.` : failed ? "Payment unsuccessful" : pending ? "Awaiting payment" : "Order cancelled"}
        </h1>
        <p className="mx-auto mt-4 max-w-[52ch] text-[15px] leading-relaxed text-ink-2">
          {paid &&
            `Your payment was received and your order is confirmed. We’ll contact you at ${order.customer.phone} or ${order.customer.email} about delivery. Please keep your order number for reference.`}
          {failed && `${order.payment.failureReason ?? "Your payment didn’t go through"}. Your bag has been kept — you can try again or choose another payment method.`}
          {pending && "We haven’t received confirmation of your payment yet. If you’ve just paid, this page will update shortly."}
          {order.status === "cancelled" && "This order has been cancelled. Please contact us if you have questions."}
        </p>
        {(failed || pending) && (
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href={`/pay/${order.id}?t=${t}`} className="btn btn-primary">
              Try payment again
            </Link>
            <Link href="/checkout" className="btn btn-outline">
              Change payment method
            </Link>
          </div>
        )}
      </header>

      <div className="grid gap-10 py-10 md:grid-cols-2 md:gap-14">
        <div>
          <h2 className="label mb-4">Delivery</h2>
          <address className="not-italic text-[15px] leading-relaxed">
            {order.recipient.name}
            <br />
            {order.address.line1}
            {order.address.line2 && (
              <>
                <br />
                {order.address.line2}
              </>
            )}
            <br />
            {order.address.postcode} {order.address.city}, {order.address.state}
            <br />
            <span className="text-ink-2">{order.recipient.phone}</span>
          </address>
          {order.deliveryDate && <p className="mt-4 text-[15px]">Preferred date: {formatDate(order.deliveryDate, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>}
          {order.deliveryNotes && <p className="mt-2 text-[14px] text-ink-2">Notes: {order.deliveryNotes}</p>}
        </div>
        <div>
          <h2 className="label mb-4">Payment</h2>
          <dl className="space-y-2 text-[15px]">
            <div className="flex justify-between gap-4">
              <dt className="text-ink-2">Status</dt>
              <dd>{ORDER_STATUS[order.status].label}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-2">Method</dt>
              <dd>{PAYMENT_METHODS[order.payment.method].name}</dd>
            </div>
            {order.payment.reference && paid && (
              <div className="flex justify-between gap-4">
                <dt className="text-ink-2">Reference</dt>
                <dd className="text-[13px] tabular-nums">{order.payment.reference}</dd>
              </div>
            )}
            <div className="flex justify-between gap-4">
              <dt className="text-ink-2">Placed</dt>
              <dd>{formatDate(order.createdAt)}</dd>
            </div>
          </dl>
        </div>
      </div>

      <section className="border-t border-line pt-8" aria-label="Items">
        <ul className="divide-y divide-line">
          {order.items.map((i, idx) => (
            <li key={idx} className="flex gap-4 py-5 md:gap-6">
              <Link href={`/products/${i.slug}`} className="w-20 flex-none md:w-24">
                <ProductImage src={i.image} alt={i.name} ratio={1.25} sizes="96px" />
              </Link>
              <div className="min-w-0 flex-1">
                <p className="display text-[1.15rem]">{i.name}</p>
                <p className="text-[13px] text-ink-2">
                  {i.variantName ? `${i.variantName} · ` : ""}Qty {i.quantity}
                </p>
                {i.personalisation && (
                  <p className="mt-1 text-[13px] text-ink-2">
                    {i.personalisationLabel}: “{i.personalisation}”
                  </p>
                )}
                {i.giftMessage && <p className="mt-1 text-[13px] italic text-ink-2">Gift message: “{i.giftMessage}”</p>}
              </div>
              <p className="text-[15px] tabular-nums">{formatRM(i.lineTotal, { decimals: true })}</p>
            </li>
          ))}
        </ul>
        <dl className="ml-auto mt-4 max-w-xs space-y-2 border-t border-line pt-4 text-[15px]">
          <div className="flex justify-between">
            <dt className="text-ink-2">Subtotal</dt>
            <dd className="tabular-nums">{formatRM(order.subtotal, { decimals: true })}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-2">Delivery</dt>
            <dd className="tabular-nums">{order.deliveryFee ? formatRM(order.deliveryFee, { decimals: true }) : "Free"}</dd>
          </div>
          <div className="flex justify-between border-t border-line pt-3 text-[17px]">
            <dt>{paid ? "Total paid" : "Total"}</dt>
            <dd className="tabular-nums">{formatRM(order.total, { decimals: true })}</dd>
          </div>
        </dl>
      </section>

      <div className="mt-14 flex flex-col items-center gap-4 border-t border-line pt-10 text-center">
        <p className="text-[14px] text-ink-2">Questions about your order? Message us with your order number.</p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <a href={whatsappLink(whatsappNumber, `Hello Moire Co., I have a question about order ${order.id}.`)} target="_blank" rel="noopener noreferrer" className="btn btn-outline">
            WhatsApp us
          </a>
          <Link href="/" className="btn btn-primary">
            Continue shopping
          </Link>
        </div>
      </div>
    </div>
  );
}
