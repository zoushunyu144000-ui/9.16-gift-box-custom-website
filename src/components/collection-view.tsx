import Link from "next/link";
import { isPurchasable, priceRange, sortProducts } from "@/lib/catalog";
import type { Product } from "@/lib/types";
import { Breadcrumbs } from "./breadcrumbs";
import { EditorialGrid } from "./editorial-grid";
import { Emph } from "./moire";
import { ProductCard } from "./product-card";
import { SortSelect } from "./sort-select";
import { WineList } from "./wine-list";

export type SortKey = "featured" | "price-asc" | "price-desc" | "name";

export function sortBy(list: Product[], sort: SortKey) {
  const base = sortProducts(list);
  const avail = (p: Product) => (isPurchasable(p) ? 0 : 1);
  if (sort === "price-asc") return [...base].sort((a, b) => avail(a) - avail(b) || priceRange(a).min - priceRange(b).min);
  if (sort === "price-desc") return [...base].sort((a, b) => avail(a) - avail(b) || priceRange(b).min - priceRange(a).min);
  if (sort === "name") return [...base].sort((a, b) => a.name.localeCompare(b.name));
  return [...base].sort((a, b) => avail(a) - avail(b) || Number(b.featured) - Number(a.featured) || a.sort - b.sort);
}

/**
 * Category page (Fixed Gift Collection, Wine Gift Boxes).
 * `layout="editorial"` lays products out as a spread; `layout="list"` reads like a wine list.
 * Titles accept *italic* markup.
 */
export function CollectionView({

  title,
  eyebrow,
  intro,
  products,
  sort,
  note,
  layout = "editorial",
}: {
  basePath: string;
  title: string;
  eyebrow?: string;
  intro: string;
  products: Product[];
  sort: SortKey;
  note?: string;
  layout?: "editorial" | "list" | "grid";
}) {
  const list = sortBy(products, sort);
  const available = list.filter(isPurchasable).length;
  const plainTitle = title.replace(/\*/g, "");

  return (
    <div>
      <header className="bg-paper">
        <div className="shell pb-14 pt-6 md:pb-20 md:pt-10">
          <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: plainTitle }]} />
          <div className="mt-12 grid gap-8 md:mt-20 md:grid-cols-12 md:items-end">
            <div className="md:col-span-7">
              {eyebrow && <p className="eyebrow mb-5">{eyebrow}</p>}
              <h1 className="display text-[2.8rem] leading-[0.98] tracking-[-0.02em] md:text-[5rem]">
                <Emph text={title} />
              </h1>
            </div>
            <div className="md:col-span-4 md:col-start-9">
              <p className="max-w-[44ch] text-[15px] leading-relaxed text-ink-2">{intro}</p>
              {note && <p className="mt-3 text-[13px] leading-relaxed text-ink-3">{note}</p>}
            </div>
          </div>
        </div>
      </header>

      <div className="sticky top-16 z-20 border-b border-line bg-ivory/95 backdrop-blur-md lg:top-[76px]">
        <div className="shell flex h-14 items-center justify-between gap-4">
          <p className="text-[13px] text-ink-2">
            {available} {available === 1 ? "gift" : "gifts"}
            {list.length > available ? <span className="text-ink-3"> · {list.length - available} sold out</span> : null}
          </p>
          <SortSelect value={sort} />
        </div>
      </div>

      <div className="shell pt-12 md:pt-20">
        {list.length === 0 ? (
          <div className="border border-line px-6 py-20 text-center">
            <p className="display text-2xl">Nothing here yet</p>
            <p className="mx-auto mt-2 max-w-[40ch] text-ink-2">There are no gifts in this collection at the moment. Please check back soon.</p>
            <Link href="/" className="btn btn-outline mt-8">
              Back to home
            </Link>
          </div>
        ) : layout === "list" ? (
          <WineList products={list} />
        ) : layout === "grid" ? (
          <div className="grid grid-cols-2 gap-x-4 gap-y-12 md:grid-cols-3 md:gap-x-6 xl:grid-cols-4">
            {list.map((p, i) => (
              <ProductCard key={p.id} product={p} priority={i < 4} sizes="(min-width: 1280px) 23vw, (min-width: 768px) 31vw, 50vw" />
            ))}
          </div>
        ) : (
          <EditorialGrid products={list} />
        )}
      </div>
    </div>
  );
}

export function parseSort(v: string | string[] | undefined): SortKey {
  return v === "price-asc" || v === "price-desc" || v === "name" ? v : "featured";
}
