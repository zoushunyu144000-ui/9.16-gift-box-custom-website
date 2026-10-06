import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Hero } from "@/components/hero";
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
  // Hero photographs cross-fade like a short film.
  const heroSlides = [siteImages.homeHero, siteImages.homeFixed, siteImages.festiveCampaign, siteImages.homeCorporate];
  const shown = sortFestivals(festivals);
  const festivalNames = shown.length > 1 ? `${shown.slice(0, -1).map((f) => f.name).join(", ")} and ${shown.at(-1)!.name}` : shown[0]?.name ?? "every festival";
  const fixedImage = siteImages.homeFixed;
  const wineImage = siteImages.homeWine;

  return (
    <>
      <Hero title={settings.heroTitle} slides={heroSlides} href={season && festive.length > 0 ? festivalHref(season) : "/festive"} />

      {/* 1 · Festive — only while a festival is in season (Admin → Settings). Other festivals
          live on the Festive Collection page. */}
      {festive.length > 0 && (
        <section className="bg-paper py-12 md:py-16" aria-labelledby="festive-heading">
          <div className="shell">
            <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
              <div>
                <p className="eyebrow">{settings.festiveTitle}</p>
                <h2 id="festive-heading" className="display mt-3 text-[2.2rem] leading-tight tracking-[-0.01em] md:text-[2.8rem]">Festive Collection</h2>
                <p className="mt-2 text-[14px] text-ink-2 md:text-[15px]">Joyful gifts for the season, ready to choose and send.</p>
              </div>
              <Link href={festivalHref(season!)} className="link-line flex-none sm:mb-1">
                View all <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.25} />
              </Link>
            </div>
            <div className="mt-8 md:mt-10">
              <ProductRail label={settings.festiveTitle}>
                {festive.map((p, i) => (
                  <RailItem key={p.id}>
                    <ProductCard product={p} compact priority={i < 2} ratio={0.92} reveal={false} sizes="(min-width: 1024px) 24vw, (min-width: 640px) 44vw, 78vw" />
                  </RailItem>
                ))}
              </ProductRail>
            </div>
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
        flushFooter={festive.length > 0}
      />

      {/* No festival in season: the festive collection becomes a closing entry instead of a product row. */}
      {festive.length === 0 && (
        <CollectionGateway
          id="festive-gateway-heading"
          eyebrow="By festival"
          title="Festive Collection"
          text={`Gift boxes for ${festivalNames}.`}
          href="/festive"
          cta="Explore festive gifts"
          image={siteImages.festiveCampaign}
          tone="walnut"
          flushFooter
        />
      )}
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

