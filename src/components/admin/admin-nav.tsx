"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/admin", label: "Overview", exact: true },
  { href: "/admin/orders", label: "Orders", key: "orders" as const },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/enquiries", label: "Corporate enquiries", key: "enquiries" as const },
  { href: "/admin/settings", label: "Settings" },
];

export function AdminNav({ counts }: { counts: { orders: number; enquiries: number } }) {
  const pathname = usePathname();
  return (
    <nav className="no-scrollbar flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:px-3 lg:pb-0" aria-label="Admin">
      {ITEMS.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        const count = item.key ? counts[item.key] : 0;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-none items-center justify-between gap-3 px-3 py-2 text-[14px] transition-colors ${
              active ? "bg-cream text-ink" : "text-ink-2 hover:bg-cream/60 hover:text-ink"
            }`}
          >
            {item.label}
            {count > 0 && <span className="min-w-5 bg-ink px-1.5 text-center text-[11px] leading-5 text-ivory">{count}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
