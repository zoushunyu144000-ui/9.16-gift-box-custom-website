"use client";

import { useState, useTransition } from "react";
import { saveSettingsAction } from "@/lib/admin/actions";
import { OCCASIONS } from "@/lib/catalog";
import type { SiteSettings } from "@/lib/types";

export function SettingsForm({ settings }: { settings: SiteSettings }) {
  const [s, setS] = useState(settings);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof SiteSettings>(k: K, v: SiteSettings[K]) => setS((p) => ({ ...p, [k]: v }));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveSettingsAction(s);
          setMsg(r.ok ? { ok: true, text: "Settings saved. The website is updated." } : { ok: false, text: r.error ?? "Could not save" });
        });
      }}
      className="grid max-w-5xl gap-6 lg:grid-cols-2"
    >
      <Section title="Festive season" hint="Controls which occasion leads the homepage and Festive page.">
        <F label="Current occasion">
          <select className="field" value={s.activeOccasion} onChange={(e) => set("activeOccasion", e.target.value as SiteSettings["activeOccasion"])}>
            {Object.entries(OCCASIONS).map(([k, o]) => <option key={k} value={k}>{o.name}</option>)}
          </select>
        </F>
        <F label="Section title"><input className="field" value={s.festiveTitle} onChange={(e) => set("festiveTitle", e.target.value)} /></F>
        <F label="Section introduction"><textarea className="field" value={s.festiveIntro} onChange={(e) => set("festiveIntro", e.target.value)} /></F>
      </Section>

      <Section title="Homepage hero">
        <F label="Small heading"><input className="field" value={s.heroEyebrow} onChange={(e) => set("heroEyebrow", e.target.value)} /></F>
        <F label="Headline"><input className="field" value={s.heroTitle} onChange={(e) => set("heroTitle", e.target.value)} /></F>
        <F label="Text"><textarea className="field" value={s.heroText} onChange={(e) => set("heroText", e.target.value)} /></F>
      </Section>

      <Section title="Delivery">
        <div className="grid grid-cols-2 gap-4">
          <F label="Delivery fee (RM)"><input className="field" inputMode="decimal" value={s.deliveryFee} onChange={(e) => set("deliveryFee", parseFloat(e.target.value.replace(/[^0-9.]/g, "")) || 0)} /></F>
          <F label="Free delivery from (RM)" hint="Leave empty for none">
            <input className="field" inputMode="decimal" value={s.freeDeliveryThreshold ?? ""} onChange={(e) => set("freeDeliveryThreshold", e.target.value.trim() ? parseFloat(e.target.value.replace(/[^0-9.]/g, "")) || 0 : null)} />
          </F>
        </div>
        <F label="Minimum days before delivery"><input className="field" type="number" min={0} max={60} value={s.deliveryLeadDays} onChange={(e) => set("deliveryLeadDays", parseInt(e.target.value || "0", 10))} /></F>
        <F label="Delivery note" hint="Shown on product pages and checkout"><textarea className="field" value={s.deliveryNote} onChange={(e) => set("deliveryNote", e.target.value)} /></F>
      </Section>

      <Section title="Contact">
        <F label="WhatsApp number" hint="Digits only with country code, e.g. 60123456789"><input className="field" inputMode="numeric" value={s.whatsappNumber} onChange={(e) => set("whatsappNumber", e.target.value.replace(/\D/g, ""))} /></F>
        <F label="Email (optional)"><input className="field" type="email" value={s.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} /></F>
        <F label="Business hours (optional)"><input className="field" value={s.businessHours} placeholder="Mon–Sat, 10am–6pm" onChange={(e) => set("businessHours", e.target.value)} /></F>
        <label className="flex items-start gap-3 text-[14px]">
          <input type="checkbox" className="check" checked={s.showPreviewNotice} onChange={(e) => set("showPreviewNotice", e.target.checked)} />
          <span>Show “preview build / test payments” notice in the footer<span className="block text-[12px] text-ink-2">Turn off at launch</span></span>
        </label>
      </Section>

      <div className="flex items-center gap-4 lg:col-span-2">
        <button className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : "Save settings"}</button>
        {msg && <p className={`text-[13px] ${msg.ok ? "text-success" : "text-danger"}`} role="status">{msg.text}</p>}
      </div>
    </form>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="border border-line bg-ivory">
      <div className="border-b border-line px-5 py-3.5">
        <h2 className="text-[12px] font-medium uppercase tracking-[0.14em] text-ink-2">{title}</h2>
        {hint && <p className="mt-1 text-[12px] text-ink-3">{hint}</p>}
      </div>
      <div className="space-y-4 p-5">{children}</div>
    </section>
  );
}

function F({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[12px] text-ink-3">{hint}</span>}
    </label>
  );
}
