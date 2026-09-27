import Link from "next/link";
import { OCCASIONS } from "@/lib/catalog";
import type { Occasion, Product, SiteSettings } from "@/lib/types";
import { Breadcrumbs } from "./breadcrumbs";
import { sortBy, type SortKey } from "./collection-view";
import { EditorialGrid } from "./editorial-grid";
import { Star } from "./logo";
import { MoireField } from "./moire";
import { ProductCard } from "./product-card";
import { ProductImage } from "./product-image";
import { SortSelect } from "./sort-select";

const OCCASION_NOTES: Record<Occasion, string> = {
  "chinese-new-year": "",
  "hari-raya": "Boxes for Hari Raya open houses. These gifts contain no alcohol.",
  "dragon-boat": "Rice dumplings for the Dragon Boat Festival.",
  "mid-autumn": "Mooncakes and tea for the Mid-Autumn Festival.",
};

function splitYear(title: string): [string, string | null] {
  const m = title.match(/^(.*?)\s*(\d{4})$/);
  return m ? [m[1], m[2]] : [title, null];
}

/**
 * The Festive Collection as a seasonal chapter: a campaign opening for the current
 * occasion, then the gifts laid out as a spread, then the other occasions of the year.
 */
export function FestiveView({
  products,
  settings,
  occasion,
  sort,
}: {
  products: Product[];
  settings: SiteSettings;
  occasion: Occasion | "all";
  sort: SortKey;
}) {
  const festive = products.filter((p) => p.category === "festive" && p.status !== "hidden");
  const order: Occasion[] = [
    settings.activeOccasion,
    ...(["chinese-new-year", "hari-raya", "dragon-boat", "mid-autumn"] as Occasion[]).filter((o) => o !== settings.activeOccasion),
  ].filter((o) => festive.some((p) => p.occasion === o));

  const focus: Occasion = occasion === "all" ? settings.activeOccasion : occasion;
  const focusList = sortBy(festive.filter((p) => p.occasion === focus), sort);
  const isSeason = focus === settings.activeOccasion;
  const [name, year] = isSeason ? splitYear(settings.festiveTitle) : [OCCASIONS[focus].name, null];
  const intro = isSeason ? settings.festiveIntro : OCCASION_NOTES[focus] || "";
  const available = focusList.filter((p) => p.status === "active");
  // The primary scene image is campaign artwork; secondary product-detail shots are not collection heroes.
  const lead = [...available].filter((p) => p.images.length > 1).sort((a, b) => b.price - a.price)[0] ?? focusList[0];
  const campaign = lead?.images[0];
  const others = occasion === "all" ? order.filter((o) => o !== focus) : [];

  const tab = (o: Occasion | "all") => {
    const p = new URLSearchParams();
    if (o !== "all") p.set("occasion", o);
    if (sort !== "featured") p.set("sort", sort);
    const s = p.toString();
    return s ? `/festive?${s}` : "/festive";
  };

  return (
    <div>
      {/* Chapter opening */}
      <header className="relative overflow-hidden bg-paper">
        <MoireField className="pointer-events-none absolute -left-[260px] -top-[300px] h-[760px] w-[760px] text-champagne" opacity={0.3} />
        <div className="shell relative grid gap-10 pb-12 pt-6 md:pb-16 md:pt-10 lg:grid-cols-12 lg:gap-12">
          <div className="flex flex-col lg:col-span-6">
            <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Festive Collection" }]} />
            <div className="mt-10 lg:mt-auto lg:pb-4 lg:pt-16">
              <p className="eyebrow">{isSeason ? "This season" : "Festive Collection"}</p>
              <h1 className="display mt-5 leading-[0.92] tracking-[-0.02em]">
                <span className="block text-[2.35rem] xs:text-[2.6rem] md:text-[4.6rem]">{name}</span>
                {year && <span className="display-italic block text-[5rem] text-bronze/90 md:text-[9rem]">{year}</span>}
              </h1>
              {intro && <p className="mt-6 max-w-[42ch] text-[15px] leading-relaxed text-ink-2 md:text-[16px]">{intro}</p>}
              <p className="mt-6 text-[13px] text-ink-3">
                {available.length} {available.length === 1 ? "gift" : "gifts"} available
                {focusList.length > available.length ? ` · ${focusList.length - available.length} unavailable` : ""}
              </p>
            </div>
          </div>
          {campaign && (
            <div className="relative lg:col-span-5 lg:col-start-8">
              <ProductImage src={campaign.src} alt={campaign.alt} ratio={1.22} className="max-lg:!aspect-[4/3]" sizes="(min-width: 1024px) 40vw, 100vw" priority imgClassName="grade" />
              {lead && (
                <Link href={`/products/${lead.slug}`} className="mt-3 flex items-baseline justify-between gap-4 text-[12px] text-ink-3 hover:text-ink">
                  <span>{lead.name}</span>
                  <span className="tabular-nums">View →</span>
                </Link>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Occasion navigation + sort */}
      <div className="sticky top-16 z-20 border-b border-line bg-ivory/95 backdrop-blur-md lg:top-[76px]">
        <div className="shell flex items-center justify-between gap-6">
          <nav className="no-scrollbar -mx-1 flex min-w-0 gap-6 overflow-x-auto px-1 md:gap-9" aria-label="Occasions">
            {(["all", ...order] as const).map((o) => {
              const active = occasion === o;
              const count = o === "all" ? festive.length : festive.filter((p) => p.occasion === o).length;
              return (
                <Link
                  key={o}
                  href={tab(o)}
                  scroll={false}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex-none py-4 text-[14px] transition-colors md:text-[15px] ${active ? "text-ink" : "text-ink-3 hover:text-ink"}`}
                >
                  <span className={active ? "display-italic text-[16px] md:text-[17px]" : ""}>{o === "all" ? "All occasions" : OCCASIONS[o].name}</span>
                  <sup className="ml-1 text-[10px] tabular-nums text-ink-3">{count}</sup>
                  {active && <span className="absolute inset-x-0 bottom-0 h-px bg-champagne" />}
                </Link>
              );
            })}
          </nav>
          <div className="hidden flex-none md:block">
            <SortSelect value={sort} />
          </div>
        </div>
      </div>

      <div className="shell pt-12 md:pt-20">
        <div className="mb-8 flex justify-end md:hidden">
          <SortSelect value={sort} />
        </div>

        {focusList.length === 0 ? (
          <div className="border border-line px-6 py-20 text-center">
            <p className="display text-2xl">Nothing here yet</p>
            <p className="mx-auto mt-2 max-w-[40ch] text-ink-2">There are no gifts for this occasion at the moment.</p>
            <Link href="/festive" className="btn btn-outline mt-8">
              All occasions
            </Link>
          </div>
        ) : (
          <EditorialGrid products={focusList} />
        )}

        {/* A pause: something useful, not a slogan */}
        {focusList.length > 0 && available.length > 0 && (
          <section className="mx-auto max-w-3xl py-24 text-center md:py-36" aria-label="Gift messages">
            <Star className="mx-auto h-3.5 w-3.5 text-champagne" />
            <p className="display mt-8 text-[1.6rem] leading-[1.3] md:text-[2.2rem]" data-reveal="">
              Every box can carry a card with <em>your own words</em> — add a gift message on the product page, and choose a delivery date at checkout.
            </p>
          </section>
        )}

        {/* The rest of the year */}
        {others.map((o) => {
          const list = sortBy(festive.filter((p) => p.occasion === o), sort);
          const open = list.some((p) => p.status === "active");
          return (
            <section key={o} className="border-t border-line pb-16 pt-10 md:pb-24 md:pt-14" aria-labelledby={`occ-${o}`}>
              <div className="mb-10 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="label">{open ? "Also available" : "Later in the year"}</p>
                  <h2 id={`occ-${o}`} className="display mt-3 text-[2rem] leading-tight md:text-[2.8rem]">
                    {OCCASIONS[o].name}
                  </h2>
                  {OCCASION_NOTES[o] && <p className="mt-2 text-[14px] text-ink-2">{OCCASION_NOTES[o]}</p>}
                </div>
                <Link href={tab(o)} className="link-line self-start md:self-auto">
                  View {OCCASIONS[o].short}
                </Link>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-12 md:grid-cols-4 md:gap-x-6">
                {list.map((p) => (
                  <ProductCard key={p.id} product={p} sizes="(min-width: 768px) 23vw, 50vw" />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
