"use client";

import Link from "next/link";
import { formatRM } from "@/lib/catalog";
import { useCart } from "./cart-context";
import { CartLineRow } from "./cart-line";
import { useQuote } from "./use-quote";

export function CartPageClient() {
  const { lines, ready, count } = useCart();
  const { quote, error } = useQuote(lines, ready);
  const problems = new Map(quote?.lines.filter((l) => !l.ok).map((l) => [l.key, l.problem]) ?? []);

  return (
    <div className="shell pt-8 md:pt-14">
      <h1 className="display text-[2.5rem] leading-none md:text-[3.5rem]">Your bag</h1>

      {!ready ? (
        <div className="mt-10 space-y-4">
          <div className="skeleton h-32 w-full" />
          <div className="skeleton h-32 w-full" />
        </div>
      ) : lines.length === 0 ? (
        <div className="mt-10 border border-line px-6 py-20 text-center">
          <p className="display text-2xl">Your bag is empty</p>
          <p className="mx-auto mt-2 max-w-[36ch] text-ink-2">Gifts you add will appear here.</p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/festive" className="btn btn-primary">
              Shop Festive
            </Link>
            <Link href="/fixed-gifts" className="btn btn-outline">
              Fixed Gift Collection
            </Link>
          </div>
        </div>
      ) : (
        <div className="mt-8 grid gap-10 md:mt-12 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-8">
            <p className="label border-b border-line pb-4">
              {count} {count === 1 ? "item" : "items"}
            </p>
            <ul>
              {lines.map((l) => (
                <CartLineRow key={l.key} line={l} problem={problems.get(l.key)} />
              ))}
            </ul>
            <Link href="/" className="link-line mt-6">
              Continue shopping
            </Link>
          </div>
          <aside className="lg:col-span-4">
            <div className="border border-line bg-cream/50 p-6 lg:sticky lg:top-28 md:p-8">
              <h2 className="label">Order summary</h2>
              <dl className="mt-6 space-y-3 text-[15px]">
                <div className="flex justify-between">
                  <dt className="text-ink-2">Subtotal</dt>
                  <dd className="tabular-nums">{quote ? formatRM(quote.subtotal, { decimals: true }) : "—"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-2">Delivery</dt>
                  <dd className="tabular-nums">
                    {!quote ? "—" : quote.delivery ? <span className="text-ink-2">At checkout</span> : quote.deliveryFee ? formatRM(quote.deliveryFee, { decimals: true }) : "Free"}
                  </dd>
                </div>
                <div className="flex justify-between border-t border-line pt-4 text-[17px]">
                  <dt>{quote?.delivery ? "Total before delivery" : "Total"}</dt>
                  <dd className="tabular-nums">{quote ? formatRM(quote.total, { decimals: true }) : "—"}</dd>
                </div>
              </dl>
              {quote?.hasProblems && (
                <p className="mt-5 text-[13px] text-danger">Some items need attention before checkout. Please update or remove them.</p>
              )}
              {error && <p className="mt-5 text-[13px] text-danger">We couldn’t refresh prices. Check your connection and try again.</p>}
              {quote?.hasProblems || !quote ? (
                <button type="button" disabled className="btn btn-primary mt-6 w-full">
                  {quote ? "Checkout" : "Checking prices…"}
                </button>
              ) : (
                <Link href="/checkout" className="btn btn-primary mt-6 w-full">
                  Checkout
                </Link>
              )}
              <p className="mt-4 text-center text-[12px] text-ink-3">Pay securely by FPX, card or e-wallet</p>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
