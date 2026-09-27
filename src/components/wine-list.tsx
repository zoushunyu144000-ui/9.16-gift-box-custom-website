"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { priceLabel } from "@/lib/catalog";
import type { Product } from "@/lib/types";
import { ProductImage } from "./product-image";

/**
 * Wine & Spirits presented as a list — the way a wine list is read — with the
 * bottle shown alongside. Desktop: hovering a row changes the photograph.
 * Mobile: each row carries its own small photograph.
 */
export function WineList({ products }: { products: Product[] }) {
  const [active, setActive] = useState(0);
  const current = products[active] ?? products[0];

  return (
    <div className="grid gap-10 lg:grid-cols-12 lg:gap-16">
      <div className="relative hidden lg:col-span-5 lg:block">
        <div className="sticky top-28">
          <div className="mount">
            <div className="relative aspect-[4/5] overflow-hidden">
              {products.map((p, i) => (
                <div key={p.id} className={`absolute inset-0 transition-opacity duration-700 ${i === active ? "opacity-100" : "opacity-0"}`} aria-hidden={i !== active}>
                  <ProductImage src={p.images[0]?.src} alt={p.images[0]?.alt ?? p.name} ratio={1.25} sizes="36vw" className="!absolute inset-0" imgClassName="grade" />
                </div>
              ))}
            </div>
          </div>
          <p className="mt-4 text-[12px] text-ink-3" aria-live="polite">
            {current?.name}
          </p>
        </div>
      </div>

      <ol className="border-t border-line lg:col-span-7">
        {products.map((p, i) => (
          <li key={p.id} className="border-b border-line" data-reveal="" style={{ "--reveal-delay": `${i * 60}ms` } as React.CSSProperties}>
            <Link
              href={`/products/${p.slug}`}
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              className="group grid grid-cols-[64px_1fr_auto] items-center gap-4 py-5 md:gap-6 lg:grid-cols-[2.5rem_1fr_auto_1.25rem] lg:py-7"
            >
              <span className="w-16 lg:hidden">
                <ProductImage src={p.images[0]?.src} alt="" ratio={1.25} sizes="64px" imgClassName="grade" />
              </span>
              <span className="hidden text-[12px] tabular-nums text-ink-3 lg:block">{String(i + 1).padStart(2, "0")}</span>
              <span className="min-w-0">
                <span className={`display block text-[1.25rem] leading-tight transition-colors md:text-[1.65rem] ${i === active ? "lg:text-ink" : "lg:text-ink-2"} group-hover:text-ink`}>
                  {p.name}
                </span>
                <span className="mt-1 block text-[13px] text-ink-2">{p.summary}</span>
              </span>
              <span className="text-[14px] tabular-nums md:text-[15px]">{priceLabel(p)}</span>
              <ArrowUpRight className="hidden h-4 w-4 text-ink-3 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-ink lg:block" strokeWidth={1.25} />
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
