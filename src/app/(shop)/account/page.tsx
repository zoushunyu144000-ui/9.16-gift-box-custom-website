import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { EmailForm, PasswordForm, ProfileForm } from "@/components/account/account-forms";
import { ProductImage } from "@/components/product-image";
import { formatRM, ORDER_STATUS } from "@/lib/catalog";
import { formatDate } from "@/lib/dates";
import { isVendureConfigured } from "@/lib/store";
import { getMember, getMemberLoyalty, getMemberOrders } from "@/lib/vendure/account";
import { signOut } from "@/lib/vendure/account-actions";

export const metadata: Metadata = { title: "My account", robots: { index: false } };

const TONE = { neutral: "text-ink-2", good: "text-success", warn: "text-warn", bad: "text-danger" } as const;

export default async function AccountPage() {
  if (!isVendureConfigured) notFound();
  const member = await getMember();
  if (!member) redirect("/account/sign-in");
  const [orders, loyalty] = await Promise.all([getMemberOrders().catch(() => null), member.loyaltyPoints !== null ? getMemberLoyalty() : null]);

  return (
    <div className="shell max-w-4xl pt-12 md:pt-20">
      <header className="flex flex-col gap-6 border-b border-line pb-10 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">My account</p>
          <h1 className="display mt-4 text-[2.4rem] leading-[1.05] md:text-[3rem]">Hello, {member.firstName}.</h1>
          <p className="mt-3 text-[15px] text-ink-2">{member.email}</p>
        </div>
        <form action={signOut}>
          <button className="btn btn-outline">Sign out</button>
        </form>
      </header>

      {member.loyaltyPoints !== null && (
        <section className="border-b border-line py-10" aria-labelledby="points-heading">
          <h2 id="points-heading" className="label">
            Points
          </h2>
          <p className="display mt-4 text-[2.6rem] leading-none tabular-nums">{member.loyaltyPoints.toLocaleString("en-MY")}</p>
          {loyalty && (
            <>
              <p className="mt-3 max-w-[60ch] text-[14px] leading-relaxed text-ink-2">
                Worth {formatRM((member.loyaltyPoints * loyalty.settings.pointValueSen) / 100, { decimals: true })}. You earn {loyalty.settings.pointsPerRinggit}{" "}
                {loyalty.settings.pointsPerRinggit === 1 ? "point" : "points"} for every RM 1 you spend on gifts, and can use them at checkout from{" "}
                {loyalty.settings.minRedeemPoints.toLocaleString("en-MY")} points.
              </p>
              {loyalty.history.length > 0 && (
                <ul className="mt-6 divide-y divide-line border-y border-line text-[14px]">
                  {loyalty.history.map((e) => (
                    <li key={e.id} className="flex items-baseline justify-between gap-4 py-3">
                      <span>
                        {e.note || e.reason}
                        {e.orderCode && <span className="text-ink-3"> · {e.orderCode}</span>}
                        <span className="block text-[12px] text-ink-3">{formatDate(e.createdAt, { day: "numeric", month: "short", year: "numeric" })}</span>
                      </span>
                      <span className={`tabular-nums ${e.points < 0 ? "text-ink-2" : ""}`}>
                        {e.points > 0 ? "+" : ""}
                        {e.points.toLocaleString("en-MY")}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      )}

      <section className="border-b border-line py-10" aria-labelledby="orders-heading">
        <h2 id="orders-heading" className="label">
          Orders
        </h2>
        {orders === null ? (
          <p className="mt-4 text-[15px] text-ink-2">We couldn’t load your orders just now. Please refresh the page in a moment.</p>
        ) : orders.length === 0 ? (
          <div className="mt-4">
            <p className="text-[15px] text-ink-2">You haven’t placed an order yet.</p>
            <Link href="/festive" className="btn btn-primary mt-6">
              Shop Festive
            </Link>
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-line">
            {orders.map((o) => (
              <li key={o.code}>
                <Link href={`/order/${o.code}`} className="group flex items-center gap-4 py-5">
                  <div className="w-14 flex-none">{o.items[0]?.image && <ProductImage src={o.items[0].image} alt="" ratio={1.25} sizes="56px" />}</div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] group-hover:underline group-hover:underline-offset-4">
                      {o.items.map((i) => (i.quantity > 1 ? `${i.name} × ${i.quantity}` : i.name)).join(", ")}
                    </p>
                    <p className="mt-1 text-[13px] text-ink-3">
                      {o.code} · {formatDate(o.placedAt, { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[15px] tabular-nums">{formatRM(o.total, { decimals: true })}</p>
                    <p className={`mt-1 text-[13px] ${TONE[ORDER_STATUS[o.status].tone]}`}>{ORDER_STATUS[o.status].label}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-10 py-10 md:grid-cols-2 md:gap-14" aria-labelledby="details-heading">
        <div>
          <h2 id="details-heading" className="label mb-6">
            Your details
          </h2>
          <ProfileForm member={member} />
        </div>
        <div className="space-y-4">
          <details className="group border-b border-line pb-4">
            <summary className="label flex cursor-pointer list-none items-center justify-between gap-4 py-1 [&::-webkit-details-marker]:hidden">
              Change email
              <ArrowRight className="h-4 w-4 flex-none text-bronze transition-transform duration-300 group-open:rotate-90" strokeWidth={1.25} aria-hidden="true" />
            </summary>
            <div className="pt-5">
              <EmailForm />
            </div>
          </details>
          <details className="group border-b border-line pb-4">
            <summary className="label flex cursor-pointer list-none items-center justify-between gap-4 py-1 [&::-webkit-details-marker]:hidden">
              Change password
              <ArrowRight className="h-4 w-4 flex-none text-bronze transition-transform duration-300 group-open:rotate-90" strokeWidth={1.25} aria-hidden="true" />
            </summary>
            <div className="pt-5">
              <PasswordForm />
            </div>
          </details>
        </div>
      </section>
    </div>
  );
}
