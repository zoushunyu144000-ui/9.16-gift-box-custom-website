import Link from "next/link";
import { Plus } from "lucide-react";
import { festivalHref, isPurchasable, sortFestivals } from "@/lib/catalog";
import type { Festival, Product, SiteSettings } from "@/lib/types";
import { Breadcrumbs } from "./breadcrumbs";
import { sortBy, type SortKey } from "./collection-view";
import { ProductImage } from "./product-image";
import { ProductGrid } from "./product-grid";
import { SortSelect } from "./sort-select";

/**
 * Festive Collection: one row per festival, the current season first and open; the others
 * stay closed and show their gift boxes only when clicked (client, Oct 2026). Order after the
 * season follows Admin → Festivals; festivals with no gift boxes are left out. Each festival
 * also keeps its own page (/festive/[slug]).
 */
export function FestiveIndex({ festivals, products, settings }: { festivals: Festival[]; products: Product[]; settings: SiteSettings }) {
  const festive = products.filter((p) => p.category === "festive" && p.status !== "hidden");
  const ordered = sortFestivals(festivals);
  const sections = [
    ...ordered.filter((f) => f.id === settings.activeFestivalId),
    ...ordered.filter((f) => f.id !== settings.activeFestivalId),
  ]
    .map((f) => ({ festival: f, items: sortBy(festive.filter((p) => p.festivalId === f.id), "featured") }))
    .filter((s) => s.items.length > 0);

  return (
    <div>
      <header className="bg-paper">
        <div className="shell pb-8 pt-4 md:pb-16 md:pt-10">
          <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Festive Collection" }]} />
          <div className="mt-6 grid gap-3 md:mt-16 md:grid-cols-12 md:items-end md:gap-6">
            <div className="md:col-span-7">
              <p className="eyebrow">By festival</p>
              <h1 className="display mt-3 text-[2.2rem] leading-[1] tracking-[-0.02em] md:mt-5 md:text-[4.6rem]">Festive Collection</h1>
            </div>
            <p className="max-w-[44ch] text-[14px] leading-relaxed text-ink-2 md:col-span-4 md:col-start-9 md:text-[15px]">Choose a festival to see its gift boxes.</p>
          </div>
        </div>
      </header>

      <div className="shell pt-10 md:pt-14">
        {sections.length === 0 ? (
          <div className="border border-line px-6 py-20 text-center">
            <p className="display text-2xl">Nothing here yet</p>
            <p className="mx-auto mt-2 max-w-[40ch] text-ink-2">There are no festive gifts at the moment. Please check back soon.</p>
          </div>
        ) : (
          <div className="border-t border-line">
            {sections.map(({ festival: f, items }) => {
              const season = f.id === settings.activeFestivalId;
              return (
                <details key={f.id} id={f.slug} className="group scroll-mt-24 border-b border-line" open={season}>
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 md:py-6 [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0">
                      {season && <span className="eyebrow mb-1.5 block">This season</span>}
                      <span className="display block text-[1.6rem] leading-tight md:text-[2.1rem]">{f.name}</span>
                      {f.description && <span className="mt-1 block text-[13px] text-ink-2 md:text-[14px]">{f.description}</span>}
                    </span>
                    <span className="flex flex-none items-center gap-3 text-[12px] uppercase tracking-[0.14em] text-ink-2">
                      <span className="hidden sm:inline">
                        {items.length} {items.length === 1 ? "gift" : "gifts"}
                      </span>
                      <span className="grid h-9 w-9 place-items-center border border-line-strong transition-colors group-open:border-champagne group-open:bg-champagne group-open:text-ivory">
                        <Plus className="h-4 w-4 transition-transform duration-300 group-open:rotate-45" strokeWidth={1.25} aria-hidden="true" />
                      </span>
                    </span>
                  </summary>
                  <div className="pb-10 md:pb-14">
                    <ProductGrid products={items} priorityCount={season ? 4 : 0} />
                    <div className="mt-6 flex justify-end">
                      <Link href={festivalHref(f)} className="link-line">
                        View {f.name}
                      </Link>
                    </div>
                  </div>
                </details>
              );
            })}
          </div>
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
        <div className="shell grid gap-8 pb-8 pt-4 md:pb-16 md:pt-10 lg:grid-cols-12 lg:items-end lg:gap-12">
          <div className="lg:col-span-6">
            <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Festive Collection", href: "/festive" }, { label: festival.name }]} />
            <p className="eyebrow mt-6 md:mt-16">{isSeason ? "This season" : "Festive Collection"}</p>
            <h1 className="display mt-3 text-[2.2rem] leading-[1] tracking-[-0.02em] md:mt-5 md:text-[4rem]">{title}</h1>
            {intro && <p className="mt-3 max-w-[44ch] text-[14px] leading-relaxed text-ink-2 md:mt-6 md:text-[15px]">{intro}</p>}
          </div>
          {campaign && (
            // Desktop only: on phones the products follow the title straight away.
            <div className="hidden lg:col-span-5 lg:col-start-8 lg:block">
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

      <div className="shell pt-8 md:pt-16">
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
