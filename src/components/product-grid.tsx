import type { Product } from "@/lib/types";
import { ProductCard } from "./product-card";

/**
 * The one product layout for every shopping page: an even grid, same card size and
 * image ratio throughout (2 columns on mobile, 3 on tablet, 4 on wide screens).
 */
export function ProductGrid({ products, priorityCount = 4 }: { products: Product[]; priorityCount?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-5 xl:grid-cols-4">
      {products.map((p, i) => (
        <ProductCard
          key={p.id}
          product={p}
          priority={i < priorityCount}
          revealDelay={(i % 4) * 60}
          sizes="(min-width: 1280px) 23vw, (min-width: 768px) 31vw, 50vw"
        />
      ))}
    </div>
  );
}
