"use client";

import { DateSelect } from "../date-select";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Lock } from "lucide-react";
import { formatRM, MALAYSIAN_STATES, PAYMENT_METHODS } from "@/lib/catalog";
import type { PaymentMethod } from "@/lib/types";
import { useCart } from "../cart/cart-context";
import { rememberOrder, useQuote } from "../cart/use-quote";
import { ProductImage } from "../product-image";
import { Monogram } from "../logo";

type Errors = Record<string, string>;

const DRAFT_KEY = "moire.checkout.draft.v1";

interface Draft {
  name: string;
  email: string;
  phone: string;
  sendToSomeoneElse: boolean;
  recipientName: string;
  recipientPhone: string;
  line1: string;
  line2: string;
  postcode: string;
  city: string;
  state: string;
  deliveryDate: string;
  deliveryNotes: string;
  paymentMethod: PaymentMethod;
}

const EMPTY: Draft = {
  name: "",
  email: "",
  phone: "",
  sendToSomeoneElse: false,
  recipientName: "",
  recipientPhone: "",
  line1: "",
  line2: "",
  postcode: "",
  city: "",
  state: "",
  deliveryDate: "",
  deliveryNotes: "",
  paymentMethod: "fpx",
};

export function CheckoutForm({ earliestDate, deliveryNote, testMode }: { earliestDate: string; deliveryNote: string; testMode: boolean }) {
  const router = useRouter();
  const { lines, ready } = useCart();
  const { quote, error: quoteError } = useQuote(lines, ready);
  const [d, setD] = useState<Draft>(EMPTY);
  const [age, setAge] = useState(false);
  const [terms, setTerms] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);

  // Restore a draft so a refresh or failed payment doesn't lose the address.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore from sessionStorage after mount
      if (raw) setD({ ...EMPTY, ...JSON.parse(raw) });
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    } catch {
      /* ignore */
    }
  }, [d]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    setD((prev) => ({ ...prev, [k]: v }));
    setErrors((prev) => {
      if (!prev[k as string]) return prev;
      const next = { ...prev };
      delete next[k as string];
      return next;
    });
  };

  const items = useMemo(() => quote?.lines.filter((l) => l.ok && l.item).map((l) => ({ key: l.key, ...l.item! })) ?? [], [quote]);

  function validate(): Errors {
    const e: Errors = {};
    if (d.name.trim().length < 2) e.name = "Please enter your name";
    if (!/^\S+@\S+\.\S+$/.test(d.email.trim())) e.email = "Please enter a valid email";
    if (!/^[+0-9 ()-]{8,20}$/.test(d.phone.trim())) e.phone = "Please enter a valid phone number";
    if (d.sendToSomeoneElse) {
      if (d.recipientName.trim().length < 2) e.recipientName = "Please enter the recipient's name";
      if (!/^[+0-9 ()-]{8,20}$/.test(d.recipientPhone.trim())) e.recipientPhone = "Please enter a valid phone number";
    }
    if (d.line1.trim().length < 3) e.line1 = "Please enter the street address";
    if (!/^\d{5}$/.test(d.postcode.trim())) e.postcode = "Postcode must be 5 digits";
    if (d.city.trim().length < 2) e.city = "Please enter the city";
    if (!d.state) e.state = "Please choose a state";
    if (!d.deliveryDate) e.deliveryDate = "Please choose a delivery date";
    else if (d.deliveryDate < earliestDate) e.deliveryDate = "Please choose a later date";
    if (quote?.containsAlcohol && !age) e.ageConfirmed = "Please confirm you are 21 or older";
    if (!terms) e.termsAccepted = "Please accept the terms of sale";
    return e;
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setFormError(null);
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) {
      setFormError("Please check the highlighted fields.");
      const first = document.querySelector<HTMLElement>(`[data-field="${Object.keys(e)[0]}"]`);
      first?.scrollIntoView({ behavior: "smooth", block: "center" });
      first?.querySelector<HTMLElement>("input,select,textarea")?.focus({ preventScroll: true });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          customer: { name: d.name, email: d.email, phone: d.phone },
          recipient: d.sendToSomeoneElse ? { name: d.recipientName, phone: d.recipientPhone } : { name: d.name, phone: d.phone },
          address: { line1: d.line1, line2: d.line2, postcode: d.postcode, city: d.city, state: d.state },
          deliveryDate: d.deliveryDate,
          deliveryNotes: d.deliveryNotes,
          paymentMethod: d.paymentMethod,
          ageConfirmed: age,
          termsAccepted: terms,
          lines: lines.map(({ key, productId, variantId, quantity, personalisation, personalisationOption, giftMessage }) => ({
            key,
            productId,
            variantId,
            quantity,
            personalisation,
            personalisationOption,
            giftMessage,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const map: Errors = {};
        for (const [k, v] of Object.entries((data.fieldErrors ?? {}) as Record<string, string>)) {
          map[k.replace(/^(customer|address)\./, "").replace("recipient.name", "recipientName").replace("recipient.phone", "recipientPhone")] = v;
        }
        setErrors(map);
        setFormError(data.error ?? "Something went wrong. Please try again.");
        setSubmitting(false);
        return;
      }
      rememberOrder(data.orderId, data.accessToken, data.snapshot);
      router.push(data.redirectUrl);
    } catch {
      setFormError("We couldn’t reach the server. Check your connection and try again.");
      setSubmitting(false);
    }
  }

  if (ready && lines.length === 0) {
    return (
      <div className="shell py-24 text-center">
        <p className="display text-3xl">Your bag is empty</p>
        <p className="mt-2 text-ink-2">Add a gift before checking out.</p>
        <Link href="/festive" className="btn btn-primary mt-8">
          Shop Festive
        </Link>
      </div>
    );
  }

  const summary = (
    <div>
      <ul className="divide-y divide-line">
        {(items.length ? items : []).map((i) => (
          <li key={i.key} className="flex gap-4 py-4">
            <div className="relative w-16 flex-none">
              <ProductImage src={i.image} alt={i.name} ratio={1.25} sizes="64px" />
              <span className="absolute -right-2 -top-2 grid h-5 min-w-5 place-items-center rounded-full bg-ink px-1 text-[11px] text-ivory">{i.quantity}</span>
            </div>
            <div className="min-w-0 flex-1 text-[14px]">
              <p className="leading-snug">{i.name}</p>
              {i.variantName && <p className="text-[12px] text-ink-2">{i.variantName}</p>}
              {i.personalisation && (
                <p className="text-[12px] text-ink-2">
                  {i.personalisationLabel}
                  {i.personalisationOption ? ` (${i.personalisationOption})` : ""}: “{i.personalisation}”
                </p>
              )}
              {i.giftMessage && <p className="line-clamp-1 text-[12px] italic text-ink-2">Message: “{i.giftMessage}”</p>}
            </div>
            <p className="text-[14px] tabular-nums">{formatRM(i.lineTotal, { decimals: true })}</p>
          </li>
        ))}
        {!quote && (
          <li className="space-y-3 py-4">
            <div className="skeleton h-16 w-full" />
            <div className="skeleton h-16 w-full" />
          </li>
        )}
      </ul>
      <dl className="mt-2 space-y-2.5 border-t border-line pt-4 text-[14px]">
        <div className="flex justify-between">
          <dt className="text-ink-2">Subtotal</dt>
          <dd className="tabular-nums">{quote ? formatRM(quote.subtotal, { decimals: true }) : "—"}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink-2">Delivery</dt>
          <dd className="tabular-nums">{quote ? (quote.deliveryFee ? formatRM(quote.deliveryFee, { decimals: true }) : "Free") : "—"}</dd>
        </div>
        <div className="flex justify-between border-t border-line pt-3 text-[17px]">
          <dt>Total</dt>
          <dd className="tabular-nums">{quote ? formatRM(quote.total, { decimals: true }) : "—"}</dd>
        </div>
      </dl>
      {quote?.hasProblems && (
        <p className="mt-4 text-[13px] text-danger">
          Some items are no longer available or need changes.{" "}
          <Link href="/cart" className="underline">
            Review your bag
          </Link>
        </p>
      )}
    </div>
  );

  return (
    <div className="pb-10">
      {/* Mobile summary toggle */}
      <div className="border-b border-line bg-cream/60 lg:hidden">
        <button type="button" onClick={() => setSummaryOpen((o) => !o)} className="shell flex h-14 items-center justify-between" aria-expanded={summaryOpen}>
          <span className="flex items-center gap-2 text-[13px]">
            {summaryOpen ? "Hide" : "Show"} order summary <ChevronDown className={`h-4 w-4 transition-transform ${summaryOpen ? "rotate-180" : ""}`} strokeWidth={1.25} />
          </span>
          <span className="text-[16px] tabular-nums">{quote ? formatRM(quote.total, { decimals: true }) : "—"}</span>
        </button>
        {summaryOpen && <div className="shell pb-6">{summary}</div>}
      </div>

      <div className="shell grid gap-12 pt-8 md:pt-12 lg:grid-cols-12 lg:gap-16">
        <form onSubmit={submit} noValidate className="lg:col-span-7">
          <h1 className="display text-[2.4rem] leading-none md:text-[3rem]">Checkout</h1>
          <p className="mt-3 text-[14px] text-ink-2">
            Guest checkout — no account needed. <Link href="/cart" className="underline underline-offset-4">Back to bag</Link>
          </p>

          <Section n={1} title="Your details">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="name" label="Full name" error={errors.name} className="sm:col-span-2">
                <input id="name" className="field" autoComplete="name" value={d.name} onChange={(e) => set("name", e.target.value)} aria-invalid={!!errors.name} />
              </Field>
              <Field id="email" label="Email" error={errors.email} hint="For your order confirmation">
                <input id="email" type="email" inputMode="email" className="field" autoComplete="email" value={d.email} onChange={(e) => set("email", e.target.value)} aria-invalid={!!errors.email} />
              </Field>
              <Field id="phone" label="Mobile number" error={errors.phone}>
                <input id="phone" type="tel" inputMode="tel" className="field" autoComplete="tel" placeholder="012 345 6789" value={d.phone} onChange={(e) => set("phone", e.target.value)} aria-invalid={!!errors.phone} />
              </Field>
            </div>
          </Section>

          <Section n={2} title="Delivery">
            <label className="mb-5 flex items-start gap-3 text-[15px]">
              <input type="checkbox" className="check" checked={d.sendToSomeoneElse} onChange={(e) => set("sendToSomeoneElse", e.target.checked)} />
              <span>
                This is a gift for someone else
                <span className="block text-[13px] text-ink-2">We’ll deliver to them and contact them for delivery</span>
              </span>
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              {d.sendToSomeoneElse && (
                <>
                  <Field id="recipientName" label="Recipient’s name" error={errors.recipientName}>
                    <input id="recipientName" className="field" value={d.recipientName} onChange={(e) => set("recipientName", e.target.value)} aria-invalid={!!errors.recipientName} />
                  </Field>
                  <Field id="recipientPhone" label="Recipient’s mobile" error={errors.recipientPhone}>
                    <input id="recipientPhone" type="tel" inputMode="tel" className="field" value={d.recipientPhone} onChange={(e) => set("recipientPhone", e.target.value)} aria-invalid={!!errors.recipientPhone} />
                  </Field>
                </>
              )}
              <Field id="line1" label="Address" error={errors.line1} className="sm:col-span-2">
                <input id="line1" className="field" autoComplete="address-line1" placeholder="Unit, building, street" value={d.line1} onChange={(e) => set("line1", e.target.value)} aria-invalid={!!errors.line1} />
              </Field>
              <Field id="line2" label="Address line 2 (optional)" className="sm:col-span-2">
                <input id="line2" className="field" autoComplete="address-line2" placeholder="Area, company name" value={d.line2} onChange={(e) => set("line2", e.target.value)} />
              </Field>
              <Field id="postcode" label="Postcode" error={errors.postcode}>
                <input id="postcode" inputMode="numeric" maxLength={5} className="field" autoComplete="postal-code" value={d.postcode} onChange={(e) => set("postcode", e.target.value.replace(/\D/g, ""))} aria-invalid={!!errors.postcode} />
              </Field>
              <Field id="city" label="City" error={errors.city}>
                <input id="city" className="field" autoComplete="address-level2" value={d.city} onChange={(e) => set("city", e.target.value)} aria-invalid={!!errors.city} />
              </Field>
              <Field id="state" label="State" error={errors.state} className="sm:col-span-2">
                <select id="state" className="field" autoComplete="address-level1" value={d.state} onChange={(e) => set("state", e.target.value)} aria-invalid={!!errors.state}>
                  <option value="">Select state</option>
                  {MALAYSIAN_STATES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </Field>
              <Field id="deliveryDate" label="Preferred delivery date" error={errors.deliveryDate} hint={`Earliest available: ${new Date(`${earliestDate}T00:00:00+08:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`}>
                <DateSelect id="deliveryDate" min={earliestDate} value={d.deliveryDate} onChange={(v) => set("deliveryDate", v)} invalid={!!errors.deliveryDate} />
              </Field>
              <Field id="deliveryNotes" label="Delivery notes (optional)" className="sm:col-span-2">
                <textarea id="deliveryNotes" className="field !min-h-[4.5rem]" maxLength={300} placeholder="Gate code, leave with guard, preferred time…" value={d.deliveryNotes} onChange={(e) => set("deliveryNotes", e.target.value)} />
              </Field>
            </div>
            <p className="mt-4 text-[13px] text-ink-2">{deliveryNote}</p>
          </Section>

          <Section n={3} title="Payment">
            <fieldset>
              <legend className="sr-only">Payment method</legend>
              <div className="divide-y divide-line border border-line-strong">
                {(Object.keys(PAYMENT_METHODS) as PaymentMethod[]).map((m) => (
                  <label key={m} className={`flex items-start gap-3 px-4 py-4 transition-colors ${d.paymentMethod === m ? "bg-cream/70" : "hover:bg-cream/40"}`}>
                    <input type="radio" name="payment" className="check" checked={d.paymentMethod === m} onChange={() => set("paymentMethod", m)} />
                    <span>
                      <span className="block text-[15px]">{PAYMENT_METHODS[m].name}</span>
                      <span className="block text-[13px] text-ink-2">{PAYMENT_METHODS[m].detail}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <p className="mt-3 flex items-center gap-2 text-[12px] text-ink-3">
              <Lock className="h-3.5 w-3.5" strokeWidth={1.25} /> You’ll complete payment on the secure payment page.
            </p>
            {testMode && (
              <p className="mt-3 border border-dashed border-warn/40 bg-[#fbf3e4] px-4 py-3 text-[13px] text-warn">
                Test mode: the payment page is a simulation for this preview. No money will be taken.
              </p>
            )}
          </Section>

          <div className="mt-10 space-y-4 border-t border-line pt-8">
            {quote?.containsAlcohol && (
              <div data-field="ageConfirmed">
                <label className="flex items-start gap-3 text-[14px]">
                  <input type="checkbox" className="check" checked={age} onChange={(e) => { setAge(e.target.checked); setErrors((p) => ({ ...p, ageConfirmed: "" })); }} aria-invalid={!!errors.ageConfirmed} />
                  <span>I confirm I am 21 years of age or older. Your order contains alcohol, and the recipient may be asked for ID on delivery.</span>
                </label>
                {errors.ageConfirmed && <p className="field-error pl-7">{errors.ageConfirmed}</p>}
              </div>
            )}
            <div data-field="termsAccepted">
              <label className="flex items-start gap-3 text-[14px]">
                <input type="checkbox" className="check" checked={terms} onChange={(e) => { setTerms(e.target.checked); setErrors((p) => ({ ...p, termsAccepted: "" })); }} aria-invalid={!!errors.termsAccepted} />
                <span>
                  I agree to the{" "}
                  <Link href="/terms" target="_blank" className="underline underline-offset-4">terms of sale</Link> and{" "}
                  <Link href="/delivery" target="_blank" className="underline underline-offset-4">delivery & returns policy</Link>.
                </span>
              </label>
              {errors.termsAccepted && <p className="field-error pl-7">{errors.termsAccepted}</p>}
            </div>
          </div>

          {(formError || quoteError) && (
            <p className="mt-6 border border-danger/30 bg-danger/5 px-4 py-3 text-[14px] text-danger" role="alert">
              {formError ?? "We couldn’t load current prices. Please refresh the page."}
            </p>
          )}

          <button type="submit" disabled={submitting || !quote || quote.hasProblems} className="btn btn-primary mt-8 w-full !min-h-14">
            {submitting ? (
              <span className="flex items-center gap-3">
                <span className="h-4 w-4 animate-spin rounded-full border border-ivory/40 border-t-ivory" /> Creating your order…
              </span>
            ) : (
              <>Continue to payment · {quote ? formatRM(quote.total, { decimals: true }) : "—"}</>
            )}
          </button>
        </form>

        <aside className="hidden lg:col-span-5 lg:block">
          <div className="sticky top-28 border border-line bg-cream/50 p-8">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="label">Order summary</h2>
              <Monogram className="h-6 w-auto text-champagne" />
            </div>
            {summary}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10 border-t border-line pt-8 md:mt-12">
      <h2 className="mb-6 flex items-baseline gap-3">
        <span className="text-[12px] tabular-nums text-ink-3">0{n}</span>
        <span className="display text-[1.6rem]">{title}</span>
      </h2>
      {children}
    </section>
  );
}

function Field({
  id,
  label,
  error,
  hint,
  className = "",
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className} data-field={id}>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      {children}
      {error ? <p className="field-error">{error}</p> : hint ? <p className="mt-1.5 text-[12px] text-ink-3">{hint}</p> : null}
    </div>
  );
}
