"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setProductStockAction } from "@/lib/admin/actions";

/** Inline stock edit on the products list, for quick changes after an off-site sale (10 → 9). */
export function StockCell({ id, stock }: { id: string; stock: number | null | undefined }) {
  const router = useRouter();
  const initial = typeof stock === "number" ? String(stock) : "";
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const dirty = value !== saved;

  function save() {
    const next = value.trim() === "" ? null : Number(value);
    start(async () => {
      const r = await setProductStockAction(id, next);
      if (!r.ok) return setError(r.error ?? "Could not save");
      setError(null);
      setSaved(value);
      router.refresh();
    });
  }

  return (
    <form
      className="flex items-center gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (dirty) save();
      }}
    >
      <input
        className={`h-8 w-16 border bg-white px-2 text-center text-[13px] tabular-nums outline-none focus:border-bronze ${value.trim() === "0" ? "border-warn/50 text-warn" : "border-line-strong"}`}
        inputMode="numeric"
        value={value}
        placeholder="—"
        aria-label="Stock quantity"
        title={error ?? "Stock quantity (empty = not tracked)"}
        onChange={(e) => setValue(e.target.value.replace(/[^0-9]/g, ""))}
      />
      {dirty && (
        <button className="h-8 border border-ink bg-ink px-2 text-[11px] text-ivory disabled:opacity-50" disabled={pending}>
          {pending ? "…" : "Save"}
        </button>
      )}
      {error && <span className="text-[11px] text-danger">{error}</span>}
    </form>
  );
}
