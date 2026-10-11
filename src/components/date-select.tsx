"use client";

import { useState } from "react";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const pad = (n: number) => String(n).padStart(2, "0");
const daysIn = (y: number, m: number) => new Date(Date.UTC(y || 2000, m || 1, 0)).getUTCDate();

/**
 * Date picker as Day / Month / Year selects, always in English — the native date input
 * follows the visitor's browser language (e.g. shows Chinese), which the client doesn't want.
 * `value` / `onChange` use ISO "YYYY-MM-DD"; "" until all three parts are chosen.
 * A date before `min` is reported as "" with a note, so the form's own checks still apply.
 */
export function DateSelect({
  id,
  value,
  onChange,
  min,
  years = 3,
  invalid,
}: {
  id: string;
  value: string;
  onChange: (iso: string) => void;
  min?: string;
  years?: number;
  invalid?: boolean;
}) {
  const [init] = useState(() => value.split("-").map(Number));
  const [y, setY] = useState(value ? init[0] : 0);
  const [m, setM] = useState(value ? init[1] : 0);
  const [d, setD] = useState(value ? init[2] : 0);
  const startYear = min ? Number(min.slice(0, 4)) : new Date().getFullYear();
  const iso = y && m && d ? `${y}-${pad(m)}-${pad(Math.min(d, daysIn(y, m)))}` : "";
  const tooEarly = !!iso && !!min && iso < min;

  function update(ny: number, nm: number, nd: number) {
    setY(ny);
    setM(nm);
    setD(nd);
    const next = ny && nm && nd ? `${ny}-${pad(nm)}-${pad(Math.min(nd, daysIn(ny, nm)))}` : "";
    onChange(next && min && next < min ? "" : next);
  }

  const cls = "field";
  return (
    <div>
      <div className="grid grid-cols-[1fr_1.6fr_1.2fr] gap-2">
        <select id={id} aria-label="Day" className={cls} value={d || ""} onChange={(e) => update(y, m, Number(e.target.value))} aria-invalid={invalid || tooEarly}>
          <option value="">Day</option>
          {Array.from({ length: daysIn(y, m) }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <select aria-label="Month" className={cls} value={m || ""} onChange={(e) => update(y, Number(e.target.value), d)} aria-invalid={invalid || tooEarly}>
          <option value="">Month</option>
          {MONTHS.map((name, i) => (
            <option key={name} value={i + 1}>
              {name}
            </option>
          ))}
        </select>
        <select aria-label="Year" className={cls} value={y || ""} onChange={(e) => update(Number(e.target.value), m, d)} aria-invalid={invalid || tooEarly}>
          <option value="">Year</option>
          {Array.from({ length: years }, (_, i) => startYear + i).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>
      {tooEarly && min && (
        <p className="field-error" role="alert">
          Please choose {new Date(`${min}T00:00:00+08:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kuala_Lumpur" })} or later
        </p>
      )}
    </div>
  );
}
