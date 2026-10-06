import Link from "next/link";
import { isSoldOut, priceLabel } from "@/lib/catalog";
import type { Product } from "@/lib/types";
import { ProductImage } from "./product-image";
import { QuickAdd } from "./quick-add";

/**
 * Product card: a framed card with the photograph, the name and the price beneath it
 * (client, Oct 2026). Sold Out is the one label: a small ivory tag on the photograph.
 */
export function ProductCard({
  product,
  priority = false,
  sizes,
  eyebrow,
  ratio = 1.25,
  size = "md",
  reveal = true,
  revealDelay = 0,
}: {
  product: Product;
  priority?: boolean;
  sizes?: string;
  /** Small line above the name, e.g. the festival in search results. */
  eyebrow?: string;
  ratio?: number;
  size?: "md" | "lg";
  /** Kept for existing call sites; every card is now name + price only. */
  compact?: boolean;
  reveal?: boolean;
  revealDelay?: number;
}) {
  const [first, second] = product.images;
  const soldOut = isSoldOut(product);
  const simple = !product.variants.length && !product.personalisation?.enabled;

  const media = (
    <div className="relative overflow-hidden">
      <ProductImage
        src={first?.src}
        alt={first?.alt ?? product.name}
        ratio={ratio}
        sizes={sizes}
        priority={priority}
        imgClassName={`${soldOut ? "grade-muted" : "grade"} transition-transform duration-[1.4s] ease-out-soft [@media(hover:hover)]:group-hover:scale-[1.035]`}
      />
      {second && !soldOut && (
        <ProductImage
          src={second.src}
          alt=""
          ratio={ratio}
          sizes={sizes}
          className="pointer-events-none !absolute inset-0 opacity-0 transition-opacity duration-700 [@media(hover:hover)]:group-hover:opacity-100"
          imgClassName="grade scale-[1.04] transition-transform duration-[1.4s] ease-out-soft [@media(hover:hover)]:group-hover:scale-100"
        />
      )}
      {soldOut && (
        <span className="absolute left-2.5 top-2.5 bg-ivory/95 px-2.5 py-1.5 text-[10px] font-medium uppercase leading-none tracking-[0.18em] text-ink md:left-3 md:top-3 md:text-[11px]">
          Sold Out
        </span>
      )}
    </div>
  );

  // One framed card: photograph on top, then the name and, on its own line, the price.
  return (
    <article
      className="group relative flex flex-col border border-line bg-ivory transition-colors duration-500 hover:border-champagne/70"
      data-reveal={reveal ? "" : undefined}
      style={revealDelay ? ({ "--reveal-delay": `${revealDelay}ms` } as React.CSSProperties) : undefined}
    >
      <Link href={`/products/${product.slug}`} className="block" aria-label={product.name} tabIndex={-1}>
        {media}
      </Link>
      <div className={`flex flex-1 flex-col ${size === "lg" ? "p-4 md:p-5" : "px-3 pb-3.5 pt-3 md:px-4 md:pb-4 md:pt-3.5"}`}>
        {eyebrow && <p className="mb-1 text-[11px] tracking-[0.14em] text-ink-3 uppercase">{eyebrow}</p>}
        <h3 className={`display leading-[1.2] ${size === "lg" ? "text-[1.4rem] md:text-[1.7rem]" : "text-[1.02rem] md:text-[1.15rem]"}`}>
          <Link href={`/products/${product.slug}`} className="after:absolute after:inset-0 after:content-['']">
            {product.name}
          </Link>
        </h3>
        <p className={`mt-1.5 tabular-nums ${soldOut ? "text-ink-3" : "text-ink-2"} ${size === "lg" ? "text-[15px]" : "text-[13px] md:text-[14px]"}`}>{priceLabel(product)}</p>
        {simple && !soldOut && (
          <div className="mt-auto flex justify-end pt-2">
            <QuickAdd product={product} />
          </div>
        )}
      </div>
    </article>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="flex flex-col border border-line bg-ivory">
      <div className="skeleton aspect-[4/5] w-full" />
      <div className="p-3">
        <div className="skeleton h-5 w-2/3" />
        <div className="skeleton mt-2 h-4 w-1/3" />
      </div>
    </div>
  );
}
