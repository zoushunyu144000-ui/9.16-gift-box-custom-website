"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { formatRM } from "@/lib/catalog";
import { useCart } from "./cart-context";
import { CartLineRow } from "./cart-line";

export function CartDrawer({ deliveryNote }: { deliveryNote?: string }) {
  const { lines, drawerOpen, closeDrawer, subtotal, count, ready } = useCart();

  return (
    <div className={`fixed inset-0 z-[60] ${drawerOpen ? "" : "pointer-events-none"}`} aria-hidden={!drawerOpen}>
      <div
        className={`absolute inset-0 bg-ink/20 transition-opacity duration-500 ${drawerOpen ? "opacity-100" : "opacity-0"}`}
        onClick={closeDrawer}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Shopping bag"
        className={`absolute inset-y-0 right-0 flex w-full max-w-[460px] flex-col border-l border-line bg-ivory transition-transform duration-500 ease-out-soft ${
          drawerOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex h-16 flex-none items-center justify-between border-b border-line px-5 md:h-[76px] md:px-7">
          <p className="text-[12px] font-medium uppercase tracking-[0.16em]">
            Your bag <span className="text-ink-3">({ready ? count : 0})</span>
          </p>
          <button type="button" onClick={closeDrawer} className="-mr-2 grid h-11 w-11 place-items-center" aria-label="Close bag">
            <X className="h-5 w-5" strokeWidth={1.25} />
          </button>
        </div>

        {ready && lines.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
            <p className="display text-2xl">Your bag is empty</p>
            <p className="mt-2 max-w-[28ch] text-ink-2">Browse the collections to find a gift.</p>
            <div className="mt-8 flex w-full max-w-[280px] flex-col gap-3">
              <Link href="/festive" onClick={closeDrawer} className="btn btn-primary">
                Shop Festive
              </Link>
              <Link href="/fixed-gifts" onClick={closeDrawer} className="btn btn-outline">
                Fixed Gift Collection
              </Link>
            </div>
          </div>
        ) : (
          <>
            <ul className="flex-1 overflow-y-auto px-5 md:px-7">
              {lines.map((l) => (
                <CartLineRow key={l.key} line={l} compact onNavigate={closeDrawer} />
              ))}
            </ul>
            <div className="flex-none border-t border-line bg-cream/60 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 md:px-7">
              <div className="flex items-baseline justify-between">
                <span className="text-[12px] font-medium uppercase tracking-[0.16em]">Subtotal</span>
                <span className="text-lg tabular-nums">{formatRM(subtotal, { decimals: true })}</span>
              </div>
              <p className="mt-1 text-[13px] text-ink-2">{deliveryNote ?? "Delivery is calculated at checkout."}</p>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <Link href="/cart" onClick={closeDrawer} className="btn btn-outline !px-3">
                  View bag
                </Link>
                <Link href="/checkout" onClick={closeDrawer} className="btn btn-primary !px-3">
                  Checkout
                </Link>
              </div>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
