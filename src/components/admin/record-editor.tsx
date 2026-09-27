"use client";

import { useState, useTransition } from "react";
import { updateEnquiryAction, updateOrderAction } from "@/lib/admin/actions";
import type { EnquiryStatus, OrderStatus } from "@/lib/types";

function Editor({
  status,
  notes,
  options,
  onSave,
}: {
  status: string;
  notes: string;
  options: { value: string; label: string }[];
  onSave: (status: string, notes: string) => Promise<{ ok: boolean }>;
}) {
  const [s, setS] = useState(status);
  const [n, setN] = useState(notes);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const dirty = s !== status || n !== notes;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await onSave(s, n);
          setMsg(r.ok ? "Saved" : "Could not save");
          setTimeout(() => setMsg(null), 2500);
        });
      }}
      className="space-y-4"
    >
      <div>
        <label htmlFor="status" className="field-label">Status</label>
        <select id="status" className="field" value={s} onChange={(e) => setS(e.target.value)}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="notes" className="field-label">Internal notes</label>
        <textarea id="notes" className="field !min-h-[8rem]" maxLength={2000} value={n} onChange={(e) => setN(e.target.value)} placeholder="Only visible to staff" />
      </div>
      <div className="flex items-center gap-4">
        <button className="btn btn-primary" disabled={pending || !dirty}>{pending ? "Saving…" : "Save changes"}</button>
        {msg && <span className="text-[13px] text-ink-2" role="status">{msg}</span>}
      </div>
    </form>
  );
}

export function OrderEditor({ id, status, notes, options }: { id: string; status: OrderStatus; notes: string; options: { value: string; label: string }[] }) {
  return <Editor status={status} notes={notes} options={options} onSave={(s, n) => updateOrderAction(id, { status: s as OrderStatus, internalNotes: n })} />;
}

export function EnquiryEditor({ id, status, notes, options }: { id: string; status: EnquiryStatus; notes: string; options: { value: string; label: string }[] }) {
  return <Editor status={status} notes={notes} options={options} onSave={(s, n) => updateEnquiryAction(id, { status: s as EnquiryStatus, internalNotes: n })} />;
}
