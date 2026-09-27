"use client";

import { Plus } from "lucide-react";
import type { Product } from "@/lib/types";
import { useCart } from "./cart/cart-context";

/** One-tap add for products without options. Products with options link to their page. */
export function QuickAdd({ product }: { product: Product }) {
  const { add } = useCart();
  return (
    <button
      type="button"
      onClick={() =>
        add({
          productId: product.id,
          slug: product.slug,
          quantity: 1,
          snapshot: {
            name: product.name,
            image: product.images[0]?.src,
            unitPrice: product.price,
            containsAlcohol: product.containsAlcohol,
          },
        })
      }
      className="relative z-10 -mr-2 inline-flex h-9 items-center gap-1.5 px-2 text-[11px] font-medium uppercase tracking-[0.14em] text-ink-2 transition-colors hover:text-bronze"
      aria-label={`Add ${product.name} to bag`}
    >
      <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
      <span className="hidden sm:inline">Add</span>
    </button>
  );
}
