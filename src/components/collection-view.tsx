import Link from "next/link";
import { OCCASION_ORDER, OCCASIONS, priceRange, sortProducts } from "@/lib/catalog";
import type { Occasion, Product } from "@/lib/types";
import { Breadcrumbs } from "./breadcrumbs";
import { ProductCard } from "./product-card";
import { SortSelect } from "./sort-select";

export type SortKey = "featured" | "price-asc" | "price-desc" | "name";

export function sortBy(list: Product[], sort: SortKey) {
  const base = sortProducts(list);
  const avail = (p: Product) => (p.status === "active" ? 0 : 1);
  if (sort === "price-asc") return [...base].sort((a, b) => avail(a) - avail(b) || priceRange(a).min - priceRange(b).min);
  if (sort === "price-desc") return [...base].sort((a, b) => avail(a) - avail(b) || priceRange(b).min - priceRange(a).min);
  if (sort === "name") return [...base].sort((a, b) => a.name.localeCompare(b.name));
  return [...base].sort((a, b) => avail(a) - avail(b) || Number(b.featured) - Number(a.featured) || a.sort - b.sort);
}

export function CollectionView({
  basePath,
  title,
  eyebrow,
  intro,
  products,
  sort,
  occasions,
  activeOccasion,
  note,
}: {
  basePath: string;
  title: string;
  eyebrow?: string;
  intro: string;
  products: Product[];
  sort: SortKey;
  /** Festive only: occasions that have products, plus the currently selected one. */
  occasions?: Occasion[];
  activeOccasion?: Occasion | "all";
  note?: string;
}) {
  const list = sortBy(products, sort);
  const qs = (o: Occasion | "all") => {
    const p = new URLSearchParams();
    if (o !== "all") p.set("occasion", o);
    if (sort !== "featured") p.set("sort", sort);
    const s = p.toString();
    return s ? `${basePath}?${s}` : basePath;
  };

  return (
    <div className="shell pt-6 md:pt-10">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: title }]} />
      <header className="mt-8 grid gap-6 border-b border-line pb-10 md:mt-12 md:grid-cols-12 md:pb-14">
        <div className="md:col-span-7">
          {eyebrow && <p className="eyebrow mb-4">{eyebrow}</p>}
          <h1 className="display text-[2.5rem] leading-[1.02] md:text-[4rem]">{title}</h1>
        </div>
        <div className="flex flex-col justify-end md:col-span-5">
          <p className="max-w-[48ch] text-[15px] leading-relaxed text-ink-2">{intro}</p>
          {note && <p className="mt-3 text-[13px] text-ink-3">{note}</p>}
        </div>
      </header>

      <div className="sticky top-16 z-20 -mx-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b border-line bg-ivory/95 px-5 py-3 backdrop-blur-md md:static md:mx-0 md:border-0 md:bg-transparent md:px-0 md:py-6 md:backdrop-blur-none lg:top-[76px]">
        {occasions && occasions.length > 0 ? (
          <nav className="no-scrollbar -my-1 flex w-full min-w-0 gap-2 overflow-x-auto py-1 md:w-auto md:flex-1" aria-label="Filter by occasion">
            {(["all", ...occasions] as const).map((o) => {
              const active = (activeOccasion ?? "all") === o;
              return (
                <Link
                  key={o}
                  href={qs(o)}
                  scroll={false}
                  aria-current={active ? "true" : undefined}
                  className={`inline-flex h-9 flex-none items-center border px-4 text-[12px] tracking-wide transition-colors ${
                    active ? "border-ink bg-ink text-ivory" : "border-line-strong hover:border-ink"
                  }`}
                >
                  {o === "all" ? "All occasions" : OCCASIONS[o].name}
                </Link>
              );
            })}
          </nav>
        ) : (
          <p className="text-[13px] text-ink-2">
            {list.length} {list.length === 1 ? "gift" : "gifts"}
          </p>
        )}
        <SortSelect value={sort} />
      </div>

      {occasions && (
        <p className="mb-6 mt-4 text-[13px] text-ink-2 md:mt-0">
          {list.length} {list.length === 1 ? "gift" : "gifts"}
        </p>
      )}

      {list.length === 0 ? (
        <div className="border border-line px-6 py-20 text-center">
          <p className="display text-2xl">Nothing here yet</p>
          <p className="mx-auto mt-2 max-w-[40ch] text-ink-2">There are no gifts in this selection at the moment. Please check back soon or browse another collection.</p>
          <Link href={basePath} className="btn btn-outline mt-8">
            View all
          </Link>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-12 md:mt-2 md:grid-cols-3 md:gap-x-6 md:gap-y-16 xl:grid-cols-4">
          {list.map((p, i) => (
            <ProductCard
              key={p.id}
              product={p}
              priority={i < 4}
              showOccasion={Boolean(occasions)}
              sizes="(min-width: 1280px) 23vw, (min-width: 768px) 31vw, 50vw"
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function parseSort(v: string | string[] | undefined): SortKey {
  return v === "price-asc" || v === "price-desc" || v === "name" ? v : "featured";
}

export function parseOccasion(v: string | string[] | undefined): Occasion | "all" {
  return typeof v === "string" && (OCCASION_ORDER as string[]).includes(v) ? (v as Occasion) : "all";
}
