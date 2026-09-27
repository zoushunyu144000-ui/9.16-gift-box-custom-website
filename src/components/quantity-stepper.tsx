"use client";

import { Minus, Plus } from "lucide-react";

export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 99,
  size = "md",
  label = "Quantity",
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  size?: "sm" | "md";
  label?: string;
}) {
  const h = size === "sm" ? "h-9" : "h-12";
  const w = size === "sm" ? "w-9" : "w-12";
  return (
    <div className={`inline-flex items-stretch border border-line-strong ${h}`} role="group" aria-label={label}>
      <button
        type="button"
        className={`${w} grid place-items-center transition-colors hover:bg-cream disabled:opacity-30`}
        onClick={() => onChange(Math.max(size === "sm" ? 0 : min, value - 1))}
        disabled={size !== "sm" && value <= min}
        aria-label={size === "sm" && value <= 1 ? "Remove item" : "Decrease quantity"}
      >
        <Minus className="h-3.5 w-3.5" strokeWidth={1.25} />
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const n = parseInt(e.target.value, 10);
          if (!Number.isNaN(n)) onChange(Math.min(max, Math.max(min, n)));
        }}
        className={`${size === "sm" ? "w-9 text-[13px]" : "w-12 text-[15px]"} border-x border-line bg-transparent text-center tabular-nums outline-none`}
        aria-label={label}
      />
      <button
        type="button"
        className={`${w} grid place-items-center transition-colors hover:bg-cream disabled:opacity-30`}
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        aria-label="Increase quantity"
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={1.25} />
      </button>
    </div>
  );
}
