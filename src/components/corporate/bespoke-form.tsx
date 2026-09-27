"use client";

import { useState } from "react";
import { whatsappLink } from "@/lib/catalog";
import { formatDate } from "@/lib/dates";
import { Field, focusFirstError } from "../form-field";
import { Star } from "../logo";

const STYLES = ["Festive hamper", "Gift box", "Wine & spirits set", "Keepsake / engraved gift", "Not sure yet"];

/**
 * Fully customised enquiry: Style / Quantity / Date / Address → WhatsApp.
 * The enquiry is also saved so it appears in the admin, then WhatsApp opens with the details filled in.
 */
export function BespokeForm({ earliestDate, whatsappNumber }: { earliestDate: string; whatsappNumber: string }) {
  const [f, setF] = useState({
    style: "",
    styleNotes: "",
    quantity: "",
    deliveryDate: "",
    deliveryAddress: "",
    multipleAddresses: false,
    budgetPerGift: "",
    name: "",
    company: "",
    phone: "",
    email: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ id: string | null; link: string } | null>(null);

  const set = (k: keyof typeof f, v: string | boolean) => {
    setF((p) => ({ ...p, [k]: v }));
    setErrors((p) => ({ ...p, [k]: "" }));
  };

  function message(ref: string | null) {
    return [
      `Hello Moire Co., I'd like to enquire about a fully customised corporate gift${ref ? ` (ref ${ref})` : ""}.`,
      `Style: ${f.style}${f.styleNotes ? ` — ${f.styleNotes}` : ""}`,
      `Quantity: ${f.quantity}`,
      `Date: ${formatDate(f.deliveryDate)}`,
      `Address: ${f.deliveryAddress}${f.multipleAddresses ? " (multiple addresses)" : ""}`,
      f.budgetPerGift && `Budget per gift: ${f.budgetPerGift}`,
      `Name: ${f.name}${f.company ? `, ${f.company}` : ""}`,
    ]
      .filter(Boolean)
      .join("\n");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const err: Record<string, string> = {};
    if (!f.style) err.style = "Please choose a style";
    const q = parseInt(f.quantity, 10);
    if (!q || q < 1) err.quantity = "Please enter a quantity";
    if (!f.deliveryDate) err.deliveryDate = "Please choose a date";
    if (f.deliveryAddress.trim().length < 3) err.deliveryAddress = "Please enter the delivery area or address";
    if (f.name.trim().length < 2) err.name = "Please enter your name";
    if (!/^[+0-9 ()-]{8,20}$/.test(f.phone.trim())) err.phone = "Please enter a valid phone number";
    if (f.email && !/^\S+@\S+\.\S+$/.test(f.email)) err.email = "Please enter a valid email";
    setErrors(err);
    if (Object.keys(err).length) return focusFirstError(err);

    setBusy(true);
    let id: string | null = null;
    try {
      const res = await fetch("/api/enquiries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "bespoke",
          contact: { name: f.name, company: f.company, email: f.email, phone: f.phone },
          style: f.styleNotes ? `${f.style} — ${f.styleNotes}` : f.style,
          quantity: q,
          budgetPerGift: f.budgetPerGift || undefined,
          deliveryDate: f.deliveryDate,
          deliveryAddress: f.deliveryAddress,
          multipleAddresses: f.multipleAddresses,
        }),
      });
      if (res.ok) id = (await res.json()).id;
    } catch {
      /* Still continue to WhatsApp — the conversation is the primary channel. */
    }
    const link = whatsappLink(whatsappNumber, message(id));
    setDone({ id, link });
    setBusy(false);
    window.open(link, "_blank", "noopener,noreferrer");
  }

  if (done) {
    return (
      <div className="mx-auto mt-16 max-w-2xl border border-line bg-cream/50 px-6 py-14 text-center md:px-12">
        <Star className="mx-auto h-5 w-5 text-champagne animate-twinkle" />
        {done.id && <p className="eyebrow mt-5">Reference {done.id}</p>}
        <h2 className="display mt-4 text-[2.2rem] leading-tight">Continue on WhatsApp</h2>
        <p className="mx-auto mt-4 max-w-[46ch] text-[15px] leading-relaxed text-ink-2">
          We’ve opened WhatsApp with your details filled in — just press send. If it didn’t open, use the button below.
        </p>
        <a href={done.link} target="_blank" rel="noopener noreferrer" className="btn btn-primary mt-8">
          Open WhatsApp
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="mt-16 grid gap-10 border-t border-line pt-12 md:mt-24 lg:grid-cols-12 lg:gap-16">
      <div className="lg:col-span-4">
        <h2 className="display text-[2rem] leading-tight md:text-[2.5rem]">Tell us about your gift</h2>
        <p className="mt-4 text-[15px] leading-relaxed text-ink-2">
          Four details are enough to start: style, quantity, date and address. We’ll continue the conversation on WhatsApp and send a proposal.
        </p>
      </div>
      <div className="grid gap-5 sm:grid-cols-2 lg:col-span-8">
        <div className="sm:col-span-2" data-field="style">
          <p className="field-label">Style</p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Style">
            {STYLES.map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={f.style === s}
                onClick={() => set("style", s)}
                className={`inline-flex h-10 items-center border px-4 text-[13px] transition-colors ${f.style === s ? "border-ink bg-ink text-ivory" : "border-line-strong hover:border-ink"}`}
              >
                {s}
              </button>
            ))}
          </div>
          {errors.style && <p className="field-error">{errors.style}</p>}
        </div>
        <Field id="styleNotes" label="Describe what you have in mind (optional)" className="sm:col-span-2">
          <textarea id="styleNotes" className="field" maxLength={250} placeholder="Colours, contents, occasion, branding…" value={f.styleNotes} onChange={(e) => set("styleNotes", e.target.value)} />
        </Field>
        <Field id="quantity" label="Quantity" error={errors.quantity}>
          <input id="quantity" type="number" inputMode="numeric" min={1} className="field" value={f.quantity} onChange={(e) => set("quantity", e.target.value)} aria-invalid={!!errors.quantity} />
        </Field>
        <Field id="deliveryDate" label="Date needed" error={errors.deliveryDate}>
          <input id="deliveryDate" type="date" min={earliestDate} className="field" value={f.deliveryDate} onChange={(e) => set("deliveryDate", e.target.value)} aria-invalid={!!errors.deliveryDate} />
        </Field>
        <Field id="deliveryAddress" label="Delivery address or area" error={errors.deliveryAddress} className="sm:col-span-2">
          <input id="deliveryAddress" className="field" value={f.deliveryAddress} onChange={(e) => set("deliveryAddress", e.target.value)} aria-invalid={!!errors.deliveryAddress} />
        </Field>
        <label className="flex items-start gap-3 text-[15px] sm:col-span-2">
          <input type="checkbox" className="check" checked={f.multipleAddresses} onChange={(e) => set("multipleAddresses", e.target.checked)} />
          Gifts go to multiple addresses
        </label>
        <Field id="budgetPerGift" label="Budget per gift (optional)" className="sm:col-span-2">
          <input id="budgetPerGift" className="field" placeholder="e.g. RM 200–300" value={f.budgetPerGift} onChange={(e) => set("budgetPerGift", e.target.value)} />
        </Field>
        <Field id="name" label="Your name" error={errors.name}>
          <input id="name" className="field" autoComplete="name" value={f.name} onChange={(e) => set("name", e.target.value)} aria-invalid={!!errors.name} />
        </Field>
        <Field id="company" label="Company (optional)">
          <input id="company" className="field" autoComplete="organization" value={f.company} onChange={(e) => set("company", e.target.value)} />
        </Field>
        <Field id="phone" label="Mobile number" error={errors.phone}>
          <input id="phone" type="tel" className="field" autoComplete="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} aria-invalid={!!errors.phone} />
        </Field>
        <Field id="email" label="Email (optional)" error={errors.email}>
          <input id="email" type="email" className="field" autoComplete="email" value={f.email} onChange={(e) => set("email", e.target.value)} aria-invalid={!!errors.email} />
        </Field>
        <div className="sm:col-span-2">
          <button type="submit" disabled={busy} className="btn btn-primary w-full sm:w-auto">
            {busy ? "Opening WhatsApp…" : "Enquiry now → WhatsApp"}
          </button>
          <p className="mt-3 text-[12px] text-ink-3">Opens WhatsApp with your details filled in. Nothing is charged.</p>
        </div>
      </div>
    </form>
  );
}
