import Link from "next/link";
import { festivalHref, isPurchasable, sortFestivals } from "@/lib/catalog";
import type { Festival, Product, SiteSettings } from "@/lib/types";
import { Breadcrumbs } from "./breadcrumbs";
import { sortBy, type SortKey } from "./collection-view";
import { MoireField } from "./moire";
import { ProductImage } from "./product-image";
import { ProductGrid } from "./product-grid";
import { SortSelect } from "./sort-select";

/**
 * Festive Collection — level 1: one visual entry per festival.
 * Festivals come from data (Admin → Festivals): name, cover, description, shown/hidden, order.
 */
export function FestiveIndex({ festivals, products, settings }: { festivals: Festival[]; products: Product[]; settings: SiteSettings }) {
  const festive = products.filter((p) => p.category === "festive" && p.status !== "hidden");
  const list = sortFestivals(festivals);

  return (
    <div>
      <header className="relative overflow-hidden bg-paper">
        <MoireField className="pointer-events-none absolute -left-[260px] -top-[300px] h-[760px] w-[760px] text-champagne" opacity={0.3} />
        <div className="shell relative pb-12 pt-6 md:pb-16 md:pt-10">
          <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Festive Collection" }]} />
          <div className="mt-10 grid gap-6 md:mt-16 md:grid-cols-12 md:items-end">
            <div className="md:col-span-7">
              <p className="eyebrow">By festival</p>
              <h1 className="display mt-5 text-[2.6rem] leading-[0.98] tracking-[-0.02em] md:text-[4.6rem]">Festive Collection</h1>
            </div>
            <p className="max-w-[44ch] text-[15px] leading-relaxed text-ink-2 md:col-span-4 md:col-start-9">Choose a festival to see its gift boxes.</p>
          </div>
        </div>
      </header>

      <div className="shell pt-10 md:pt-16">
        {list.length === 0 ? (
          <div className="border border-line px-6 py-20 text-center">
            <p className="display text-2xl">Nothing here yet</p>
            <p className="mx-auto mt-2 max-w-[40ch] text-ink-2">There are no festive gifts at the moment. Please check back soon.</p>
          </div>
        ) : (
          <ul className="grid gap-x-6 gap-y-12 sm:grid-cols-2 md:gap-y-16">
            {list.map((f, i) => {
              const items = festive.filter((p) => p.festivalId === f.id);
              const available = items.filter(isPurchasable).length;
              const cover = f.coverImage ?? items.find((p) => p.images[0])?.images[0];
              const season = f.id === settings.activeFestivalId;
              return (
                <li key={f.id} data-reveal="" style={{ "--reveal-delay": `${(i % 2) * 90}ms` } as React.CSSProperties}>
                  <Link href={festivalHref(f)} className="group block">
                    <div className="mount overflow-hidden transition-colors duration-500 group-hover:bg-stone">
                      <ProductImage
                        src={cover?.src}
                        alt={cover?.alt ?? f.name}
                        ratio={0.8}
                        priority={i < 2}
                        sizes="(min-width: 640px) 46vw, 100vw"
                        imgClassName="grade transition-transform duration-[1.4s] ease-out-soft [@media(hover:hover)]:group-hover:scale-[1.035]"
                      />
                    </div>
                    <div className="flex items-end justify-between gap-6 pt-5">
                      <div className="min-w-0">
                        {season && <p className="mb-2 text-[11px] uppercase tracking-[0.16em] text-bronze">This season</p>}
                        <h2 className="display text-[1.75rem] leading-[1.1] md:text-[2.25rem]">{f.name}</h2>
                        {f.description && <p className="mt-2 max-w-[44ch] text-[14px] leading-relaxed text-ink-2">{f.description}</p>}
                      </div>
                      <span className="flex-none pb-1 text-[12px] tabular-nums text-ink-3 transition-colors group-hover:text-ink">
                        {items.length} {items.length === 1 ? "gift" : "gifts"}
                        {items.length > 0 && available === 0 ? " · Sold Out" : ""} →
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * Festive Collection — level 2: the gift boxes of one festival, in the same even grid as
 * every other shopping page. Sold-out boxes stay listed (after the available ones) and are
 * marked Sold Out. Other festivals are reached from the Festive Collection page or the homepage.
 */
export function FestivalView({
  festival,
  products,
  settings,
  sort,
}: {
  festival: Festival;
  products: Product[];
  settings: SiteSettings;
  sort: SortKey;
}) {
  const list = sortBy(
    products.filter((p) => p.category === "festive" && p.status !== "hidden" && p.festivalId === festival.id),
    sort,
  );
  const isSeason = festival.id === settings.activeFestivalId;
  // The current season keeps its campaign title ("Chinese New Year 2027") and intro from Settings.
  const title = isSeason ? settings.festiveTitle : festival.name;
  const intro = isSeason ? settings.festiveIntro : festival.description || "";
  const available = list.filter(isPurchasable);
  const lead = [...available].filter((p) => p.images.length > 1).sort((a, b) => b.price - a.price)[0] ?? list[0];
  const campaign = festival.coverImage ?? lead?.images[0];

  return (
    <div>
      <header className="bg-paper">
        <div className="shell grid gap-8 pb-12 pt-6 md:pb-16 md:pt-10 lg:grid-cols-12 lg:items-end lg:gap-12">
          <div className="lg:col-span-6">
            <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Festive Collection", href: "/festive" }, { label: festival.name }]} />
            <p className="eyebrow mt-10 md:mt-16">{isSeason ? "This season" : "Festive Collection"}</p>
            <h1 className="display mt-5 text-[2.4rem] leading-[1] tracking-[-0.02em] md:text-[4rem]">{title}</h1>
            {intro && <p className="mt-6 max-w-[44ch] text-[15px] leading-relaxed text-ink-2">{intro}</p>}
          </div>
          {campaign && (
            <div className="lg:col-span-5 lg:col-start-8">
              <ProductImage src={campaign.src} alt={campaign.alt} ratio={0.75} sizes="(min-width: 1024px) 40vw, 100vw" priority imgClassName="grade" />
            </div>
          )}
        </div>
      </header>

      <div className="sticky top-16 z-20 border-b border-line bg-ivory/95 backdrop-blur-md lg:top-[76px]">
        <div className="shell flex h-14 items-center justify-between gap-4">
          <p className="text-[13px] text-ink-2">
            {available.length} {available.length === 1 ? "gift" : "gifts"}
            {list.length > available.length ? <span className="text-ink-3"> · {list.length - available.length} sold out</span> : null}
          </p>
          <SortSelect value={sort} />
        </div>
      </div>

      <div className="shell pt-12 md:pt-20">
        {list.length === 0 ? (
          <div className="border border-line px-6 py-20 text-center">
            <p className="display text-2xl">Nothing here yet</p>
            <p className="mx-auto mt-2 max-w-[40ch] text-ink-2">There are no gift boxes for {festival.name} at the moment.</p>
            <Link href="/festive" className="btn btn-outline mt-8">
              All festivals
            </Link>
          </div>
        ) : (
          <ProductGrid products={list} />
        )}
      </div>
    </div>
  );
}
