"use client";

import { useState } from "react";
import { whatsappLink } from "@/lib/catalog";
import { formatDate } from "@/lib/dates";
import { Field } from "../form-field";

const STYLES = ["Festive hamper", "Gift box", "Wine gift box", "Keepsake / engraved gift", "Not sure yet"];

/**
 * Fully customised: three quick fields (style, approximate date, quantity) plus an optional note.
 * Nothing is submitted to the site — the WhatsApp button opens a chat with these details filled in.
 * Every field is optional so a customer can still message straight away.
 */
export function BespokeQuickForm({ earliestDate, whatsappNumber }: { earliestDate: string; whatsappNumber: string }) {
  const [f, setF] = useState({ style: "", date: "", quantity: "", notes: "" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  const message = [
    "Hello Moire Co., I'd like to enquire about a fully customised corporate gift.",
    "",
    `Preferred style: ${f.style}`,
    `Approximate date: ${f.date ? formatDate(f.date) : ""}`,
    `Quantity: ${f.quantity}`,
    ...(f.notes.trim() ? [`Notes: ${f.notes.trim()}`] : []),
  ].join("\n");

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <Field id="b-style" label="Preferred style" className="sm:col-span-2">
        <select id="b-style" className="field" value={f.style} onChange={set("style")}>
          <option value="">Choose a style</option>
          {STYLES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </Field>
      <Field id="b-date" label="Approximate date" hint="Your best guess is fine.">
        <input id="b-date" type="date" className="field" min={earliestDate} value={f.date} onChange={set("date")} />
      </Field>
      <Field id="b-qty" label="Quantity" hint="Roughly how many gifts.">
        <input id="b-qty" type="number" inputMode="numeric" min={1} className="field" placeholder="e.g. 50" value={f.quantity} onChange={set("quantity")} />
      </Field>
      <Field id="b-notes" label="Anything else (optional)" className="sm:col-span-2">
        <textarea id="b-notes" rows={3} maxLength={500} className="field resize-none" placeholder="Budget, occasion, logo or colours…" value={f.notes} onChange={set("notes")} />
      </Field>
      <div className="sm:col-span-2">
        <a href={whatsappLink(whatsappNumber, message)} target="_blank" rel="noopener noreferrer" className="btn btn-primary w-full sm:w-auto">
          Send to WhatsApp
        </a>
        <p className="mt-3 text-[13px] text-ink-3">WhatsApp opens with these details filled in, ready to send.</p>
      </div>
    </div>
  );
}
