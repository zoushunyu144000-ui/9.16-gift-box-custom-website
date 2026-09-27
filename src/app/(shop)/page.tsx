import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Hero } from "@/components/hero";
import { ProductCard } from "@/components/product-card";
import { ProductImage } from "@/components/product-image";
import { ProductRail, RailItem } from "@/components/product-rail";
import { siteImages } from "@/data/seed";
import { sortProducts } from "@/lib/catalog";
import { getStore } from "@/lib/store";
import type { Product, ProductImage as ProductImageData } from "@/lib/types";

function pick(list: Product[], n: number) {
  const featured = list.filter((p) => p.featured);
  const rest = list.filter((p) => !p.featured);
  return [...featured, ...rest].slice(0, n);
}

/** "Chinese New Year 2027" → ["Chinese New Year", "2027"] */
function splitYear(title: string): [string, string | null] {
  const m = title.match(/^(.*?)\s*(\d{4})$/);
  return m ? [m[1], m[2]] : [title, null];
}

export default async function HomePage() {
  const store = await getStore();
  const [products, settings] = await Promise.all([store.listProducts(), store.getSettings()]);
  const visible = sortProducts(products.filter((p) => p.status !== "hidden"));

  const festive = pick(visible.filter((p) => p.category === "festive" && p.occasion === settings.activeOccasion && p.status === "active"), 4);
  const wine = pick(visible.filter((p) => p.category === "wine-spirits" && p.status === "active"), 1);
  const [festiveName, festiveYear] = splitYear(settings.festiveTitle);
  const fixedImage = siteImages.brand;
  const wineImage = wine[0]?.images[0] ?? siteImages.brand;

  return (
    <>
      <Hero eyebrow={settings.heroEyebrow} title={settings.heroTitle} text={settings.heroText} slides={siteImages.hero} />

      {/* 1 · Festive — the seasonal chapter */}
      {festive.length > 0 && (
        <section className="bg-paper py-16 md:py-24" aria-labelledby="festive-heading">
          <div className="shell">
            <div className="grid gap-8 md:grid-cols-12 md:items-end">
              <div className="md:col-span-7">
                <p className="eyebrow">Festive Collection</p>
                <h2 id="festive-heading" className="display mt-4 leading-[0.95] tracking-[-0.02em]">
                  <span className="block text-[2.35rem] md:text-[3.6rem]">{festiveName}</span>
                  {festiveYear && <span className="display-italic block text-[3.8rem] text-bronze/90 md:text-[6.5rem]">{festiveYear}</span>}
                </h2>
              </div>
              <div className="md:col-span-4 md:col-start-9 md:pb-5">
                <p className="text-[15px] leading-relaxed text-ink-2">{settings.festiveIntro}</p>
                <Link href={`/festive?occasion=${settings.activeOccasion}`} className="link-line mt-7">
                  Shop the collection <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.25} />
                </Link>
              </div>
            </div>
            <div className="mt-10 md:mt-14">
              <ProductRail label={settings.festiveTitle}>
                {festive.map((p, i) => (
                  <RailItem key={p.id}>
                    <ProductCard product={p} priority={i < 2} reveal={false} sizes="(min-width: 1024px) 24vw, (min-width: 640px) 40vw, 72vw" />
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
        imageSide="right"
      />
      <CollectionGateway
        id="wine-heading"
        eyebrow="By the bottle"
        title="Wine & Spirits"
        text="Gift-boxed bottles selected for celebrations, dinners and considered gestures."
        href="/wine-spirits"
        cta="Explore wine & spirits"
        image={wineImage}
        tone="sand"
        imageSide="left"
      />
      <CollectionGateway
        id="corporate-heading"
        eyebrow="For business"
        title="Corporate Orders"
        text="Semi-curated and fully customised gifting for clients, partners and teams."
        href="/corporate"
        cta="Explore corporate gifting"
        image={siteImages.corporateBespoke}
        tone="stone"
        imageSide="right"
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
  imageSide,
}: {
  id: string;
  eyebrow: string;
  title: string;
  text: string;
  href: string;
  cta: string;
  image: ProductImageData;
  tone: "cream" | "sand" | "stone";
  imageSide: "left" | "right";
}) {
  const tones = {
    cream: "bg-cream",
    sand: "bg-sand",
    stone: "bg-stone",
  };
  const imageOrder = imageSide === "right" ? "lg:col-start-7" : "lg:col-start-1 lg:row-start-1";
  const copyOrder = imageSide === "right" ? "lg:col-start-1 lg:row-start-1" : "lg:col-start-8 lg:row-start-1";

  return (
    <section className={`${tones[tone]} border-t border-line`} aria-labelledby={id}>
      <div className="shell grid items-center gap-8 py-12 sm:py-14 lg:grid-cols-12 lg:gap-12 lg:py-20">
        <div className={`lg:col-span-6 ${imageOrder}`}>
          <ProductImage src={image.src} alt={image.alt} ratio={0.58} sizes="(min-width: 1024px) 48vw, 100vw" imgClassName="grade" />
        </div>
        <div className={`py-2 lg:col-span-5 ${copyOrder}`}>
          <p className="eyebrow">{eyebrow}</p>
          <h2 id={id} className="display mt-4 max-w-[15ch] text-[2.25rem] leading-[1.02] tracking-[-0.015em] md:text-[3rem] lg:text-[3.4rem]">
            {title}
          </h2>
          <p className="mt-5 max-w-[42ch] text-[15px] leading-relaxed text-ink-2">{text}</p>
          <Link href={href} className="link-line mt-7">
            {cta} <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.25} />
          </Link>
        </div>
      </div>
    </section>
  );
}

