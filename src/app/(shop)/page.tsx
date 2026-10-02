import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Hero } from "@/components/hero";
import { Star } from "@/components/logo";
import { ProductCard } from "@/components/product-card";
import { ProductImage } from "@/components/product-image";
import { ProductRail, RailItem } from "@/components/product-rail";
import { siteImages } from "@/data/seed";
import { festivalHref, sortFestivals, sortProducts } from "@/lib/catalog";
import { getStore } from "@/lib/store";
import type { Product, ProductImage as ProductImageData } from "@/lib/types";

function pick(list: Product[], n: number) {
  const featured = list.filter((p) => p.featured);
  const rest = list.filter((p) => !p.featured);
  return [...featured, ...rest].slice(0, n);
}

export default async function HomePage() {
  const store = await getStore();
  const [products, settings, festivals] = await Promise.all([store.listProducts(), store.getSettings(), store.listFestivals()]);
  const visible = sortProducts(products.filter((p) => p.status !== "hidden"));

  // Current season's gift boxes as a horizontal row. Sold-out boxes stay in the row (after the
  // available ones, via sortProducts) and are marked Sold Out on the card.
  const season = festivals.find((f) => f.id === settings.activeFestivalId && f.active);
  const festive = season ? pick(visible.filter((p) => p.category === "festive" && p.festivalId === season.id), 4) : [];
  // Every other festival is a plain button under the row (no images, no prices) that leads to its page.
  const otherFestivals = sortFestivals(festivals).filter((f) => f.id !== season?.id);
  const fixedImage = siteImages.homeFixed;
  const wineImage = siteImages.homeWine;

  return (
    <>
      <Hero eyebrow={settings.heroEyebrow} title={settings.heroTitle} text={settings.heroText} slides={[siteImages.homeHero]} />

      {/* 1 · Festive — direct seasonal shopping */}
      {(festive.length > 0 || otherFestivals.length > 0) && (
        <section className="bg-paper py-12 md:py-16" aria-labelledby="festive-heading">
          <div className="shell">
            <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
              <div>
                <p className="eyebrow">{settings.festiveTitle}</p>
                <h2 id="festive-heading" className="display mt-3 text-[2.2rem] leading-tight tracking-[-0.01em] md:text-[2.8rem]">Festive Collection</h2>
                <p className="mt-2 text-[14px] text-ink-2 md:text-[15px]">Joyful gifts for the season, ready to choose and send.</p>
              </div>
              <Link href={season && festive.length > 0 ? festivalHref(season) : "/festive"} className="link-line flex-none sm:mb-1">
                View all <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.25} />
              </Link>
            </div>
            {festive.length > 0 && (
              <div className="mt-8 md:mt-10">
                <ProductRail label={settings.festiveTitle}>
                  {festive.map((p, i) => (
                    <RailItem key={p.id}>
                      <ProductCard product={p} compact priority={i < 2} ratio={0.92} reveal={false} sizes="(min-width: 1024px) 24vw, (min-width: 640px) 44vw, 78vw" />
                    </RailItem>
                  ))}
                </ProductRail>
              </div>
            )}
            {otherFestivals.length > 0 && (
              <nav className="mt-12 md:mt-14" aria-labelledby="other-festivals-heading">
                <p id="other-festivals-heading" className="text-[11px] font-medium uppercase tracking-[0.18em] text-bronze">
                  Other festivals
                </p>
                <ul className="mt-4 grid border-t border-line sm:grid-cols-3 sm:border-t-0 sm:gap-4">
                  {otherFestivals.map((f) => (
                    <li key={f.id}>
                      <Link
                        href={festivalHref(f)}
                        className="group flex items-center justify-between gap-4 border-b border-line py-4 transition-colors sm:h-full sm:flex-col sm:items-start sm:border sm:border-line sm:bg-ivory/60 sm:px-6 sm:py-6 sm:hover:border-bronze/50 sm:hover:bg-ivory"
                      >
                        <span className="flex items-center gap-3">
                          <Star className="h-2.5 w-2.5 flex-none text-champagne" />
                          <span className="display text-[1.25rem] leading-tight md:text-[1.45rem]">{f.name}</span>
                        </span>
                        <span className="flex flex-none items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-ink-2 transition-colors group-hover:text-bronze sm:mt-6">
                          <span className="hidden sm:inline">View gift boxes</span>
                          <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-1" strokeWidth={1.25} aria-hidden="true" />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            )}
          </div>
        </section>
      )}

      {/* 2–4 · Clear gateways to the full collection and service pages */}
      <CollectionGateway
        id="fixed-heading"
        eyebrow="Year-round gifting"
        title="Fixed Gift Collection"
        text="Timeless gifts for birthdays, thanks and milestones, with personalisation available on selected pieces."
        href="/fixed-gifts"
        cta="Explore fixed gifts"
        image={fixedImage}
        tone="cream"
      />
      <CollectionGateway
        id="wine-heading"
        eyebrow="Gift boxes & gift sets"
        title="Wine Gift Boxes"
        text="Gift boxes and gift sets with wine, champagne or spirits, for celebrations, dinners and considered gestures."
        href="/wine-gift-boxes"
        cta="Explore wine gift boxes"
        image={wineImage}
        tone="walnut"
      />
      <CollectionGateway
        id="corporate-heading"
        eyebrow="For business"
        title="Corporate Orders"
        text="Semi-customised and fully customised gifting for clients, partners and teams."
        href="/corporate"
        cta="Explore corporate gifting"
        image={siteImages.homeCorporate}
        tone="paper"
        flushFooter
      />
    </>
  );
}

function CollectionGateway({
  id,
  eyebrow,
  title,
  text,
  href,
  cta,
  image,
  tone,
  flushFooter = false,
}: {
  id: string;
  eyebrow: string;
  title: string;
  text: string;
  href: string;
  cta: string;
  image: ProductImageData;
  tone: "cream" | "walnut" | "paper";
  flushFooter?: boolean;
}) {
  const tones = {
    cream: {
      section: "bg-cream text-ink",
      eyebrow: "text-bronze",
      body: "text-ink-2",
      button: "border-bronze/45 text-ink hover:bg-bronze hover:text-ivory",
    },
    walnut: {
      section: "bg-walnut text-ivory",
      eyebrow: "text-champagne",
      body: "text-ivory/75",
      button: "border-champagne/65 text-ivory hover:bg-champagne hover:text-ink",
    },
    paper: {
      section: "bg-paper text-ink",
      eyebrow: "text-bronze",
      body: "text-ink-2",
      button: "border-bronze/45 text-ink hover:bg-bronze hover:text-ivory",
    },
  };
  const style = tones[tone];

  return (
    <section className={`${style.section} border-t border-line`} aria-labelledby={id} data-flush-footer={flushFooter ? "" : undefined}>
      <div className="shell py-4 md:py-5">
        <div className="grid overflow-hidden lg:min-h-[340px] lg:grid-cols-12">
          <div className="order-1 lg:order-2 lg:col-span-7">
            <ProductImage src={image.src} alt={image.alt} ratio={0.44} sizes="(min-width: 1024px) 58vw, 100vw" className="lg:h-full" imgClassName="grade" />
          </div>
          <div className="order-2 flex items-center py-6 sm:py-8 lg:order-1 lg:col-span-5 lg:py-10 lg:pr-12">
            <div>
              <p className={`text-[11px] font-medium uppercase tracking-[0.18em] ${style.eyebrow}`}>{eyebrow}</p>
              <h2 id={id} className="display mt-3 text-[2rem] leading-tight tracking-[-0.01em] md:text-[2.45rem]">
                {title}
              </h2>
              <p className={`mt-3 max-w-[38ch] text-[14px] leading-relaxed md:text-[15px] ${style.body}`}>{text}</p>
              <Link href={href} className={`home-cta home-cta--quiet mt-6 ${style.button}`}>
                {cta}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

