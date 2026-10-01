import Link from "next/link";
import { isSoldOut, priceLabel, soldOutLabel } from "@/lib/catalog";
import type { Product } from "@/lib/types";
import { ProductImage } from "./product-image";
import { QuickAdd } from "./quick-add";

/**
 * Product card.
 * `mount`  — photograph set in a paper mount (default; the collection look)
 * `bare`   — full-bleed photograph, used for the larger editorial features
 * Notes (engraving, upgrades) are set as a quiet line of text rather than badges on the
 * image, so the photograph stays clean. The one exception is Sold Out, which must be
 * unmistakable: a small ivory label on the photograph, in every card size.
 */
export function ProductCard({
  product,
  priority = false,
  sizes,
  eyebrow,
  frame = "mount",
  ratio = 1.25,
  size = "md",
  compact = false,
  reveal = true,
  revealDelay = 0,
}: {
  product: Product;
  priority?: boolean;
  sizes?: string;
  /** Small line above the name, e.g. the festival in search results. */
  eyebrow?: string;
  frame?: "mount" | "bare";
  ratio?: number;
  size?: "md" | "lg";
  compact?: boolean;
  reveal?: boolean;
  revealDelay?: number;
}) {
  const [first, second] = product.images;
  const soldOut = isSoldOut(product);
  const simple = !product.variants.length && !product.personalisation?.enabled;
  const statusNote = soldOut ? soldOutLabel(product) : null;
  const note = soldOut
    ? statusNote !== "Sold Out"
      ? statusNote
      : null
    : product.personalisation?.enabled
      ? product.personalisation.options?.length
        ? "Personalisation available"
        : "Engraving available"
      : product.variants.length > 1 && product.variants.some((v) => v.containsAlcohol)
        ? "Wine gift box option"
        : product.variants.length > 1
          ? `${product.variants.length} options`
          : null;

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

  return (
    <article
      className="group relative flex flex-col"
      data-reveal={reveal ? "" : undefined}
      style={revealDelay ? ({ "--reveal-delay": `${revealDelay}ms` } as React.CSSProperties) : undefined}
    >
      <Link href={`/products/${product.slug}`} className="block" aria-label={product.name} tabIndex={-1}>
        {frame === "mount" ? <div className="mount transition-colors duration-500 group-hover:bg-stone">{media}</div> : media}
      </Link>
      <div className={`flex flex-1 flex-col ${size === "lg" ? "pt-5 md:pt-6" : "pt-4"}`}>
        {eyebrow && <p className="mb-1.5 text-[11px] tracking-[0.14em] text-ink-3 uppercase">{eyebrow}</p>}
        <div className="flex items-baseline justify-between gap-4">
          <h3 className={`display leading-[1.15] ${size === "lg" ? "text-[1.5rem] md:text-[1.9rem]" : "text-[1.12rem] md:text-[1.28rem]"}`}>
            <Link href={`/products/${product.slug}`} className="after:absolute after:inset-0 after:content-['']">
              {product.name}
            </Link>
          </h3>
          <p className={`hidden flex-none tabular-nums sm:block ${soldOut ? "text-ink-3" : "text-ink"} ${size === "lg" ? "text-[15px]" : "text-[14px]"}`}>
            {priceLabel(product)}
          </p>
        </div>
        {!compact && <p className={`mt-1.5 line-clamp-2 leading-relaxed text-ink-2 ${size === "lg" ? "max-w-[46ch] text-[14px] md:text-[15px]" : "text-[13px]"}`}>{product.summary}</p>}
        <p className={`mt-2 text-[14px] tabular-nums sm:hidden ${soldOut ? "text-ink-3" : ""}`}>{priceLabel(product)}</p>
        {(!compact || (simple && !soldOut)) && (
          <div className="mt-auto flex items-center justify-between gap-3 pt-2.5">
            {!compact && note ? (
              <p className={`text-[11px] uppercase tracking-[0.14em] ${soldOut ? "text-ink-3" : "text-bronze"}`}>{note}</p>
            ) : (
              <span />
            )}
            {simple && !soldOut && <QuickAdd product={product} />}
          </div>
        )}
      </div>
    </article>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="flex flex-col">
      <div className="mount">
        <div className="skeleton aspect-[4/5] w-full" />
      </div>
      <div className="skeleton mt-4 h-5 w-2/3" />
      <div className="skeleton mt-2 h-4 w-full" />
    </div>
  );
}
