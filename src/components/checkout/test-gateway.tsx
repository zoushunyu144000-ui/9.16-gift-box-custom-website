"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Lock } from "lucide-react";
import { formatRM, paymentMethodName } from "@/lib/catalog";
import { recallOrder, rememberOrder } from "../cart/use-quote";
import { Logo } from "../logo";
import { useOrder } from "./use-order";

/**
 * Stand-in for the payment gateway's hosted page (FPX / card / e-wallet), used until the
 * client chooses a provider. It is deliberately labelled as a test so no one mistakes it
 * for a real payment screen.
 */
export function TestGateway({ orderId, token }: { orderId: string; token: string }) {
  const router = useRouter();
  const { order, state, token: t } = useOrder(orderId, token);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function complete(outcome: "success" | "failure" | "cancel") {
    setBusy(outcome);
    setError(null);
    try {
      const res = await fetch("/api/payments/mock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderId, token: t, outcome, snapshot: recallOrder(orderId)?.snapshot }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      rememberOrder(orderId, t, data.snapshot);
      router.replace(`/order/${orderId}?t=${t}`);
    } catch {
      setError("Something went wrong. Please try again.");
      setBusy(null);
    }
  }

  return (
    <div className="min-h-dvh bg-[#f1efeb] px-4 py-10 md:py-16">
      <div className="mx-auto max-w-[440px]">
        <div className="mb-4 flex items-center justify-between text-[12px] text-ink-3">
          <span className="flex items-center gap-1.5">
            <Lock className="h-3.5 w-3.5" strokeWidth={1.5} /> Secure payment
          </span>
          <span className="border border-warn/40 bg-[#fbf3e4] px-2 py-0.5 font-medium uppercase tracking-[0.12em] text-warn">Test mode</span>
        </div>
        <div className="border border-line bg-white">
          <div className="flex items-center gap-3 border-b border-line px-6 py-5">
            <Logo compact />
            <div>
              <p className="text-[12px] text-ink-3">Order {orderId}</p>
            </div>
          </div>

          {state === "loading" && (
            <div className="space-y-3 px-6 py-8">
              <div className="skeleton h-8 w-1/2" />
              <div className="skeleton h-4 w-full" />
              <div className="skeleton h-12 w-full" />
            </div>
          )}

          {(state === "notfound" || state === "error") && (
            <div className="px-6 py-10 text-center">
              <p className="text-[15px]">{state === "notfound" ? "We couldn’t find this payment request." : "We couldn’t load this payment."}</p>
              <Link href="/cart" className="btn btn-outline mt-6">
                Return to bag
              </Link>
            </div>
          )}

          {state === "ready" && order && (
            <div className="px-6 py-7">
              <p className="text-[12px] uppercase tracking-[0.14em] text-ink-3">Amount due</p>
              <p className="mt-1 text-[2rem] tabular-nums">{formatRM(order.total, { decimals: true })}</p>
              <p className="mt-1 text-[13px] text-ink-2">
                {paymentMethodName(order.payment.method)} · {order.items.reduce((n, i) => n + i.quantity, 0)} item(s)
              </p>

              {order.status === "paid" ? (
                <div className="mt-6">
                  <p className="text-[14px] text-success">This order has already been paid.</p>
                  <Link href={`/order/${orderId}?t=${t}`} className="btn btn-primary mt-4 w-full">
                    View order
                  </Link>
                </div>
              ) : (
                <>
                  <p className="mt-6 border border-dashed border-line-strong bg-[#faf9f7] px-4 py-3 text-[13px] leading-relaxed text-ink-2">
                    This simulates the payment gateway for the website preview. Choose an outcome to test the flow — no money is taken. It will be
                    replaced by the real FPX / card / e-wallet page once a gateway is connected.
                  </p>
                  <div className="mt-6 space-y-3">
                    <button type="button" disabled={!!busy} onClick={() => complete("success")} className="btn btn-primary w-full">
                      {busy === "success" ? "Processing…" : "Simulate successful payment"}
                    </button>
                    <button type="button" disabled={!!busy} onClick={() => complete("failure")} className="btn btn-outline w-full">
                      {busy === "failure" ? "Processing…" : "Simulate failed payment"}
                    </button>
                    <button type="button" disabled={!!busy} onClick={() => complete("cancel")} className="w-full py-3 text-[13px] text-ink-2 underline-offset-4 hover:underline">
                      Cancel and return to shop
                    </button>
                  </div>
                  {error && <p className="mt-4 text-[13px] text-danger">{error}</p>}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
