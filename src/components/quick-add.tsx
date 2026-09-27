"use client";

import { useState } from "react";
import type { Product } from "@/lib/types";
import { useCart } from "./cart/cart-context";

/**
 * One-tap add for products without options. Appears on hover on desktop;
 * on touch screens customers tap through to the product page instead.
 */
export function QuickAdd({ product }: { product: Product }) {
  const { add } = useCart();
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
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
        });
        setDone(true);
        setTimeout(() => setDone(false), 2000);
      }}
      className="relative z-10 hidden text-[11px] font-medium uppercase tracking-[0.14em] text-ink-2 underline decoration-transparent underline-offset-4 opacity-0 transition-all duration-300 hover:text-ink hover:decoration-champagne focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:hover)]:inline-block"
      aria-label={`Add ${product.name} to bag`}
    >
      {done ? "Added" : "Add to bag"}
    </button>
  );
}
