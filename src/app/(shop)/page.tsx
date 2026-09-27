import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Hero } from "@/components/hero";
import { ProcessLine } from "@/components/process-line";
import { ProductCard } from "@/components/product-card";
import { ProductImage } from "@/components/product-image";
import { ProductRail, RailItem } from "@/components/product-rail";
import { SectionHeader } from "@/components/section-header";
import { siteImages } from "@/data/seed";
import { CATEGORIES, sortProducts } from "@/lib/catalog";
import { getStore } from "@/lib/store";
import type { Product } from "@/lib/types";

function pick(list: Product[], n: number) {
  const featured = list.filter((p) => p.featured);
  const rest = list.filter((p) => !p.featured);
  return [...featured, ...rest].slice(0, n);
}

export default async function HomePage() {
  const store = await getStore();
  const [products, settings] = await Promise.all([store.listProducts(), store.getSettings()]);
  const visible = sortProducts(products.filter((p) => p.status !== "hidden"));

  const festive = pick(
    visible.filter((p) => p.category === "festive" && p.occasion === settings.activeOccasion && p.status === "active"),
    6,
  );
  const fixed = pick(visible.filter((p) => p.category === "fixed-gifts" && p.status === "active"), 5);
  const wine = pick(visible.filter((p) => p.category === "wine-spirits" && p.status === "active"), 3);

  return (
    <>
      <Hero eyebrow={settings.heroEyebrow} title={settings.heroTitle} text={settings.heroText} slides={siteImages.hero} />

      {/* 1 · Festive — seasonal priority */}
      {festive.length > 0 && (
        <section className="shell pt-6 md:pt-10" aria-labelledby="festive-heading">
          <div id="festive-heading">
            <SectionHeader
              eyebrow="Festive Collection"
              title={settings.festiveTitle}
              intro={settings.festiveIntro}
              href={`/festive?occasion=${settings.activeOccasion}`}
              linkLabel="Shop the collection"
            />
          </div>
          <div className="mt-10 md:mt-12">
            <ProductRail label={settings.festiveTitle}>
              {festive.map((p, i) => (
                <RailItem key={p.id}>
                  <ProductCard product={p} priority={i < 2} sizes="(min-width: 1024px) 24vw, (min-width: 640px) 40vw, 68vw" />
                </RailItem>
              ))}
            </ProductRail>
          </div>
        </section>
      )}

      {/* 2 · Fixed Gift Collection */}
      {fixed.length > 0 && (
        <section className="shell mt-24 md:mt-36" aria-labelledby="fixed-heading">
          <div id="fixed-heading">
            <SectionHeader
              eyebrow="Year-round"
              title={CATEGORIES["fixed-gifts"].name}
              intro={CATEGORIES["fixed-gifts"].intro}
              href="/fixed-gifts"
              linkLabel="View all gifts"
            />
          </div>
          <div className="mt-10 grid grid-cols-2 gap-x-4 gap-y-10 md:mt-12 md:gap-x-6 lg:grid-cols-12 lg:gap-y-12">
            {fixed[0] && (
              <div className="col-span-2 lg:col-span-6 lg:row-span-2">
                <FeatureCard product={fixed[0]} />
              </div>
            )}
            {fixed.slice(1, 5).map((p) => (
              <div key={p.id} className="lg:col-span-3">
                <ProductCard product={p} sizes="(min-width: 1024px) 22vw, 50vw" />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 3 · Wine & Spirits */}
      {wine.length > 0 && (
        <section className="mt-24 bg-cream py-16 md:mt-36 md:py-24" aria-labelledby="wine-heading">
          <div className="shell grid gap-10 lg:grid-cols-12 lg:gap-6">
            <div className="flex flex-col lg:col-span-3 lg:pr-6">
              <p className="eyebrow">Cellar selection</p>
              <h2 id="wine-heading" className="display mt-4 text-[2rem] leading-[1.08] md:text-[2.75rem]">
                {CATEGORIES["wine-spirits"].name}
              </h2>
              <p className="mt-4 text-[15px] leading-relaxed text-ink-2">
                Wine, champagne and spirits, each presented in a gift box — on their own or alongside a festive hamper.
              </p>
              <p className="mt-4 text-[12px] leading-relaxed text-ink-3">Alcohol is sold only to customers aged 21 and above.</p>
              <Link href="/wine-spirits" className="link-line mt-8 self-start">
                Shop Wine & Spirits <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.25} />
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 md:gap-x-6 lg:col-span-9">
              {wine.map((p, i) => (
                <div key={p.id} className={i === 2 ? "hidden md:block" : ""}>
                  <ProductCard product={p} sizes="(min-width: 1024px) 24vw, (min-width: 768px) 33vw, 50vw" />
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 4 · Corporate Orders */}
      <section className="shell mt-24 md:mt-36" aria-labelledby="corporate-heading">
        <div id="corporate-heading">
          <SectionHeader
            eyebrow="Corporate Orders"
            title="Gifting for your clients and team"
            intro="Choose from our existing gifts with light customisation, or work with us on a gift made entirely for your brand."
            href="/corporate"
            linkLabel="Corporate overview"
          />
        </div>
        <div className="mt-10 grid gap-6 md:mt-12 md:grid-cols-2 md:gap-6">
          <CorporatePanel
            href="/corporate/semi-curated"
            label="Semi-curated"
            title="Start from our collection"
            text="Select existing gift boxes, set quantities and add light customisation such as your company name on the card. We reply with a quotation."
            cta="Build a request"
            image={siteImages.corporateSemi}
          />
          <CorporatePanel
            href="/corporate/bespoke"
            label="Fully customised"
            title="Made for your brand"
            text="A gift designed around your brand, quantity, date and delivery addresses. Tell us what you need and we prepare a proposal."
            cta="Enquire now"
            image={siteImages.corporateBespoke}
          />
        </div>
        <ProcessLine className="mt-14 md:mt-20" />
      </section>
    </>
  );
}

function FeatureCard({ product }: { product: Product }) {
  const img = product.images[0];
  return (
    <Link href={`/products/${product.slug}`} className="group block">
      <ProductImage
        src={img?.src}
        alt={img?.alt ?? product.name}
        ratio={1.25}
        sizes="(min-width: 1024px) 46vw, 100vw"
        imgClassName="transition-transform duration-[1.2s] ease-out-soft group-hover:scale-[1.03]"
      />
      <div className="mt-5 flex items-start justify-between gap-6">
        <div>
          {product.personalisation?.enabled && <p className="eyebrow mb-2">Can be engraved</p>}
          <h3 className="display text-[1.6rem] leading-tight md:text-[2rem]">{product.name}</h3>
          <p className="mt-2 max-w-[46ch] text-[14px] leading-relaxed text-ink-2">{product.summary}</p>
        </div>
        <p className="flex-none pt-1 text-[15px] font-medium">RM {product.price.toLocaleString("en-MY")}</p>
      </div>
    </Link>
  );
}

function CorporatePanel({
  href,
  label,
  title,
  text,
  cta,
  image,
}: {
  href: string;
  label: string;
  title: string;
  text: string;
  cta: string;
  image: { src: string; alt: string };
}) {
  return (
    <Link href={href} className="group flex flex-col border border-line bg-ivory transition-colors hover:border-champagne">
      <ProductImage
        src={image.src}
        alt={image.alt}
        ratio={0.62}
        sizes="(min-width: 768px) 48vw, 100vw"
        imgClassName="transition-transform duration-[1.2s] ease-out-soft group-hover:scale-[1.03]"
      />
      <div className="flex flex-1 flex-col p-6 md:p-8">
        <p className="eyebrow">{label}</p>
        <h3 className="display mt-3 text-[1.75rem] leading-tight md:text-[2.1rem]">{title}</h3>
        <p className="mt-3 max-w-[48ch] text-[14px] leading-relaxed text-ink-2 md:text-[15px]">{text}</p>
        <span className="link-line mt-8 self-start">
          {cta} <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.25} />
        </span>
      </div>
    </Link>
  );
}

