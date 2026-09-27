"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

const OPTIONS = [
  { value: "featured", label: "Featured" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
  { value: "name", label: "Name A–Z" },
];

export function SortSelect({ value }: { value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <label className="flex flex-none items-center gap-2 text-[13px]">
      <span className="hidden text-ink-2 sm:inline">Sort by</span>
      <select
        value={value}
        onChange={(e) => {
          const p = new URLSearchParams(params.toString());
          if (e.target.value === "featured") p.delete("sort");
          else p.set("sort", e.target.value);
          const s = p.toString();
          router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
        }}
        className="h-9 appearance-none border border-line-strong bg-transparent bg-[url('data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%2210%22%20height=%226%22%20fill=%22none%22%3E%3Cpath%20stroke=%22%231F1C18%22%20d=%22m1%201%204%204%204-4%22/%3E%3C/svg%3E')] bg-[position:right_0.75rem_center] bg-no-repeat pl-3 pr-8 text-[13px] outline-none focus:border-bronze"
        aria-label="Sort products"
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
