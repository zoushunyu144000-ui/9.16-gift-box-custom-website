import Link from "next/link";
import { OCCASIONS, priceLabel } from "@/lib/catalog";
import type { Product } from "@/lib/types";
import { ProductImage } from "./product-image";
import { QuickAdd } from "./quick-add";

export function ProductCard({
  product,
  priority = false,
  sizes,
  showOccasion = false,
}: {
  product: Product;
  priority?: boolean;
  sizes?: string;
  showOccasion?: boolean;
}) {
  const [first, second] = product.images;
  const soldOut = product.status !== "active";
  const simple = !product.variants.length && !product.personalisation?.enabled;
  const tag = soldOut
    ? product.availabilityNote || "Sold out"
    : product.personalisation?.enabled
      ? "Can be engraved"
      : product.variants.length > 1 && product.variants.some((v) => v.containsAlcohol)
        ? "Upgrade available"
        : null;

  return (
    <article className="group relative flex flex-col">
      <Link href={`/products/${product.slug}`} className="block" aria-label={product.name}>
        <div className="relative">
          <ProductImage
            src={first?.src}
            alt={first?.alt ?? product.name}
            ratio={1.25}
            sizes={sizes}
            priority={priority}
            imgClassName={`transition-transform duration-[1.2s] ease-out-soft group-hover:scale-[1.03] ${soldOut ? "grayscale-[35%]" : ""}`}
          />
          {second && (
            <ProductImage
              src={second.src}
              alt=""
              ratio={1.25}
              sizes={sizes}
              className="pointer-events-none !absolute inset-0 opacity-0 transition-opacity duration-700 [@media(hover:hover)]:group-hover:opacity-100"
            />
          )}
          {tag && (
            <span
              className={`absolute left-3 top-3 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] ${
                soldOut ? "bg-ivory/95 text-ink-2" : "bg-ivory/90 text-bronze"
              }`}
            >
              {tag}
            </span>
          )}
        </div>
      </Link>
      <div className="flex flex-1 flex-col pt-4">
        {showOccasion && product.occasion && <p className="label mb-1.5 !text-[10px] !text-ink-3">{OCCASIONS[product.occasion].name}</p>}
        <h3 className="display text-[1.15rem] leading-snug md:text-[1.3rem]">
          <Link href={`/products/${product.slug}`} className="after:absolute after:inset-0 after:content-['']">
            {product.name}
          </Link>
        </h3>
        <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-ink-2 md:text-sm">{product.summary}</p>
        <div className="mt-auto flex items-center justify-between gap-3 pt-3">
          <p className={`text-[15px] font-medium tracking-wide ${soldOut ? "text-ink-3" : "text-ink"}`}>{priceLabel(product)}</p>
          {simple && !soldOut && <QuickAdd product={product} />}
        </div>
      </div>
    </article>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="flex flex-col">
      <div className="skeleton aspect-[4/5] w-full" />
      <div className="skeleton mt-4 h-5 w-2/3" />
      <div className="skeleton mt-2 h-4 w-full" />
      <div className="skeleton mt-4 h-4 w-1/4" />
    </div>
  );
}
