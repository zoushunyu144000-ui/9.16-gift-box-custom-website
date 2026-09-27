"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Check } from "lucide-react";
import { formatRM, whatsappLink } from "@/lib/catalog";
import { Field, focusFirstError, FormSection } from "../form-field";
import { ProductImage } from "../product-image";
import { Star } from "../logo";

interface Option {
  id: string;
  name: string;
  price: number;
  summary: string;
  image?: string;
  group: string;
}

export function SemiCuratedForm({ options, earliestDate, whatsappNumber }: { options: Option[]; earliestDate: string; whatsappNumber: string }) {
  const [qty, setQty] = useState<Record<string, number>>({});
  const [c, setC] = useState({
    companyNameOnCard: "",
    cardMessage: "",
    logoOnPackaging: false,
    notes: "",
    deliveryDate: "",
    deliveryAddress: "",
    multipleAddresses: false,
    name: "",
    company: "",
    email: "",
    phone: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const selected = useMemo(() => options.filter((o) => (qty[o.id] ?? 0) > 0), [options, qty]);
  const units = selected.reduce((n, o) => n + qty[o.id], 0);
  const indicative = selected.reduce((n, o) => n + o.price * qty[o.id], 0);
  const groups = [...new Set(options.map((o) => o.group))];

  const set = (k: keyof typeof c, v: string | boolean) => {
    setC((p) => ({ ...p, [k]: v }));
    setErrors((p) => ({ ...p, [k]: "" }));
  };

  function toggle(id: string) {
    setQty((q) => ({ ...q, [id]: q[id] ? 0 : 10 }));
    setErrors((p) => ({ ...p, items: "" }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const err: Record<string, string> = {};
    if (!selected.length) err.items = "Please choose at least one gift";
    if (!c.deliveryDate) err.deliveryDate = "Please choose a date";
    if (c.deliveryAddress.trim().length < 5) err.deliveryAddress = "Please enter the delivery address";
    if (c.name.trim().length < 2) err.name = "Please enter your name";
    if (!/^\S+@\S+\.\S+$/.test(c.email)) err.email = "Please enter a valid email";
    if (!/^[+0-9 ()-]{8,20}$/.test(c.phone.trim())) err.phone = "Please enter a valid phone number";
    setErrors(err);
    if (Object.keys(err).length) {
      setFormError("Please check the highlighted fields.");
      focusFirstError(err);
      return;
    }
    setFormError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/enquiries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "semi-curated",
          contact: { name: c.name, company: c.company, email: c.email, phone: c.phone },
          items: selected.map((o) => ({ productId: o.id, quantity: qty[o.id] })),
          customisation: {
            companyNameOnCard: c.companyNameOnCard || undefined,
            cardMessage: c.cardMessage || undefined,
            logoOnPackaging: c.logoOnPackaging,
            notes: c.notes || undefined,
          },
          deliveryDate: c.deliveryDate,
          deliveryAddress: c.deliveryAddress,
          multipleAddresses: c.multipleAddresses,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const map: Record<string, string> = {};
        for (const [k, v] of Object.entries((data.fieldErrors ?? {}) as Record<string, string>)) map[k.replace("contact.", "")] = v;
        setErrors(map);
        setFormError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      setDone(data.id);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setFormError("We couldn’t reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    const summary = selected.map((o) => `${qty[o.id]} × ${o.name}`).join(", ");
    return (
      <div className="mx-auto mt-14 max-w-2xl border border-line bg-cream/50 px-6 py-14 text-center md:px-12">
        <Star className="mx-auto h-5 w-5 text-champagne animate-twinkle" />
        <p className="eyebrow mt-5">Reference {done}</p>
        <h2 className="display mt-4 text-[2.2rem] leading-tight">Request received</h2>
        <p className="mx-auto mt-4 max-w-[46ch] text-[15px] leading-relaxed text-ink-2">
          Thank you, {c.name}. We’ll review your selection and reply to {c.email} with a quotation. If it’s urgent, send us your reference on WhatsApp.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <a
            href={whatsappLink(whatsappNumber, `Hello Moire Co., I've sent a semi-curated corporate request (${done}): ${summary}. Delivery ${c.deliveryDate}.`)}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary"
          >
            Follow up on WhatsApp
          </a>
          <Link href="/" className="btn btn-outline">
            Back to home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="mt-12 grid gap-12 lg:grid-cols-12 lg:gap-16">
      <div className="space-y-12 lg:col-span-8">
        <FormSection n={1} title="Choose gifts" intro="Tap a gift to include it, then set the quantity.">
          <div data-field="items">
            {groups.map((g) => (
              <div key={g} className="mb-8 last:mb-0">
                <p className="label mb-3">{g}</p>
                <ul className="grid gap-3 sm:grid-cols-2">
                  {options
                    .filter((o) => o.group === g)
                    .map((o) => {
                      const on = (qty[o.id] ?? 0) > 0;
                      return (
                        <li key={o.id} className={`flex gap-3 border p-3 transition-colors ${on ? "border-ink bg-ivory" : "border-line hover:border-line-strong"}`}>
                          <button type="button" onClick={() => toggle(o.id)} className="flex min-w-0 flex-1 gap-3 text-left" aria-pressed={on}>
                            <span className="relative w-16 flex-none">
                              <ProductImage src={o.image} alt="" ratio={1.25} sizes="64px" />
                              {on && (
                                <span className="absolute -left-1.5 -top-1.5 grid h-5 w-5 place-items-center bg-ink text-ivory">
                                  <Check className="h-3 w-3" strokeWidth={2} />
                                </span>
                              )}
                            </span>
                            <span className="min-w-0">
                              <span className="block text-[15px] leading-snug">{o.name}</span>
                              <span className="block text-[12px] text-ink-2">{formatRM(o.price)} each</span>
                            </span>
                          </button>
                          {on && (
                            <label className="flex flex-none flex-col items-end justify-center gap-1 text-[11px] text-ink-3">
                              Qty
                              <input
                                type="number"
                                inputMode="numeric"
                                min={1}
                                max={10000}
                                value={qty[o.id]}
                                onChange={(e) => setQty((q) => ({ ...q, [o.id]: Math.max(0, Math.min(10000, parseInt(e.target.value || "0", 10))) }))}
                                className="field !min-h-9 w-20 !px-2 !py-1 text-center tabular-nums"
                                aria-label={`Quantity of ${o.name}`}
                              />
                            </label>
                          )}
                        </li>
                      );
                    })}
                </ul>
              </div>
            ))}
            {errors.items && <p className="field-error">{errors.items}</p>}
          </div>
        </FormSection>

        <FormSection n={2} title="Light customisation" intro="All optional. We’ll confirm what’s possible in the quotation.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="companyNameOnCard" label="Company name on the greeting card">
              <input id="companyNameOnCard" className="field" maxLength={80} value={c.companyNameOnCard} onChange={(e) => set("companyNameOnCard", e.target.value)} />
            </Field>
            <div className="flex items-end pb-3">
              <label className="flex items-start gap-3 text-[15px]">
                <input type="checkbox" className="check" checked={c.logoOnPackaging} onChange={(e) => set("logoOnPackaging", e.target.checked)} />
                <span>
                  Add our logo to the packaging
                  <span className="block text-[13px] text-ink-2">We’ll ask for your artwork</span>
                </span>
              </label>
            </div>
            <Field id="cardMessage" label="Card message" className="sm:col-span-2" hint="Printed on every card">
              <textarea id="cardMessage" className="field" maxLength={300} value={c.cardMessage} onChange={(e) => set("cardMessage", e.target.value)} />
            </Field>
            <Field id="notes" label="Anything else" className="sm:col-span-2">
              <textarea id="notes" className="field" maxLength={1000} placeholder="Budget, occasion, packing requests…" value={c.notes} onChange={(e) => set("notes", e.target.value)} />
            </Field>
          </div>
        </FormSection>

        <FormSection n={3} title="Delivery">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="deliveryDate" label="Required by" error={errors.deliveryDate}>
              <input id="deliveryDate" type="date" min={earliestDate} className="field" value={c.deliveryDate} onChange={(e) => set("deliveryDate", e.target.value)} aria-invalid={!!errors.deliveryDate} />
            </Field>
            <div className="flex items-end pb-3">
              <label className="flex items-start gap-3 text-[15px]">
                <input type="checkbox" className="check" checked={c.multipleAddresses} onChange={(e) => set("multipleAddresses", e.target.checked)} />
                <span>
                  Deliver to multiple addresses
                  <span className="block text-[13px] text-ink-2">We’ll collect the address list from you</span>
                </span>
              </label>
            </div>
            <Field id="deliveryAddress" label={c.multipleAddresses ? "Main delivery area / first address" : "Delivery address"} error={errors.deliveryAddress} className="sm:col-span-2">
              <textarea id="deliveryAddress" className="field !min-h-[4.5rem]" maxLength={500} value={c.deliveryAddress} onChange={(e) => set("deliveryAddress", e.target.value)} aria-invalid={!!errors.deliveryAddress} />
            </Field>
          </div>
        </FormSection>

        <FormSection n={4} title="Your details">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="name" label="Name" error={errors.name}>
              <input id="name" className="field" autoComplete="name" value={c.name} onChange={(e) => set("name", e.target.value)} aria-invalid={!!errors.name} />
            </Field>
            <Field id="company" label="Company (optional)">
              <input id="company" className="field" autoComplete="organization" value={c.company} onChange={(e) => set("company", e.target.value)} />
            </Field>
            <Field id="email" label="Work email" error={errors.email}>
              <input id="email" type="email" className="field" autoComplete="email" value={c.email} onChange={(e) => set("email", e.target.value)} aria-invalid={!!errors.email} />
            </Field>
            <Field id="phone" label="Mobile number" error={errors.phone}>
              <input id="phone" type="tel" className="field" autoComplete="tel" value={c.phone} onChange={(e) => set("phone", e.target.value)} aria-invalid={!!errors.phone} />
            </Field>
          </div>
        </FormSection>
      </div>

      <aside className="lg:col-span-4">
        <div className="border border-line bg-cream/50 p-6 lg:sticky lg:top-28 md:p-8">
          <h2 className="label">Your selection</h2>
          {selected.length === 0 ? (
            <p className="mt-4 text-[14px] text-ink-2">No gifts selected yet.</p>
          ) : (
            <ul className="mt-4 divide-y divide-line text-[14px]">
              {selected.map((o) => (
                <li key={o.id} className="flex justify-between gap-3 py-2.5">
                  <span>
                    {qty[o.id]} × {o.name}
                  </span>
                  <span className="tabular-nums text-ink-2">{formatRM(o.price * qty[o.id])}</span>
                </li>
              ))}
            </ul>
          )}
          <dl className="mt-4 space-y-2 border-t border-line pt-4 text-[14px]">
            <div className="flex justify-between">
              <dt className="text-ink-2">Total gifts</dt>
              <dd className="tabular-nums">{units}</dd>
            </div>
            <div className="flex justify-between text-[16px]">
              <dt>Indicative value</dt>
              <dd className="tabular-nums">{formatRM(indicative)}</dd>
            </div>
          </dl>
          <p className="mt-3 text-[12px] leading-relaxed text-ink-3">
            Based on standard prices, before customisation and delivery. Your quotation confirms the final amount — nothing is charged now.
          </p>
          {formError && (
            <p className="mt-4 text-[13px] text-danger" role="alert">
              {formError}
            </p>
          )}
          <button type="submit" disabled={busy} className="btn btn-primary mt-6 w-full">
            {busy ? "Sending…" : "Send request"}
          </button>
        </div>
      </aside>
    </form>
  );
}
