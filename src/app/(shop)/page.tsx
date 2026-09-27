import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Hero } from "@/components/hero";
import { Star } from "@/components/logo";
import { Emph, MoireField } from "@/components/moire";
import { ProcessLine } from "@/components/process-line";
import { ProductCard } from "@/components/product-card";
import { ProductImage } from "@/components/product-image";
import { ProductRail, RailItem } from "@/components/product-rail";
import { WineList } from "@/components/wine-list";
import { siteImages } from "@/data/seed";
import { CATEGORIES, sortProducts } from "@/lib/catalog";
import { getStore } from "@/lib/store";
import type { Product } from "@/lib/types";

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

  const festive = pick(visible.filter((p) => p.category === "festive" && p.occasion === settings.activeOccasion && p.status === "active"), 6);
  const fixed = pick(visible.filter((p) => p.category === "fixed-gifts" && p.status === "active"), 5);
  const engravable = visible.filter((p) => p.status === "active" && p.personalisation?.enabled);
  const wine = pick(visible.filter((p) => p.category === "wine-spirits" && p.status === "active"), 6);
  const [festiveName, festiveYear] = splitYear(settings.festiveTitle);

  return (
    <>
      <Hero eyebrow={settings.heroEyebrow} title={settings.heroTitle} text={settings.heroText} slides={siteImages.hero} />

      {/* Pause — who we are, in one sentence */}
      <section className="shell py-24 text-center md:py-36" aria-label="About Moire Co.">
        <Star className="mx-auto h-3.5 w-3.5 text-champagne" />
        <p className="display mx-auto mt-8 max-w-[26ch] text-[1.75rem] leading-[1.25] md:text-[2.6rem] md:leading-[1.2]" data-reveal="">
          Gifts for the festivals of the year, for everyday occasions, and for the people you <em>work with</em>.
        </p>
      </section>

      {/* 1 · Festive — the seasonal chapter */}
      {festive.length > 0 && (
        <section className="relative overflow-hidden bg-paper pb-20 pt-16 md:pb-28 md:pt-24" aria-labelledby="festive-heading">
          <MoireField className="pointer-events-none absolute -right-[180px] -top-[260px] h-[720px] w-[720px] text-champagne md:-right-[120px] md:-top-[200px]" opacity={0.35} />
          <div className="shell relative">
            <div className="grid gap-8 md:grid-cols-12 md:items-end">
              <div className="md:col-span-7">
                <p className="eyebrow">Festive Collection</p>
                <h2 id="festive-heading" className="display mt-5 leading-[0.92] tracking-[-0.02em]">
                  <span className="block text-[2.6rem] md:text-[4.2rem]">{festiveName}</span>
                  {festiveYear && <span className="display-italic block text-[4.6rem] text-bronze/90 md:text-[8.5rem]">{festiveYear}</span>}
                </h2>
              </div>
              <div className="md:col-span-4 md:col-start-9 md:pb-5">
                <p className="text-[15px] leading-relaxed text-ink-2">{settings.festiveIntro}</p>
                <Link href={`/festive?occasion=${settings.activeOccasion}`} className="link-line mt-7">
                  Shop the collection <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.25} />
                </Link>
              </div>
            </div>
            <div className="mt-12 md:mt-16">
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

      {/* 2 · Fixed Gift Collection — editorial spread */}
      {fixed.length > 0 && (
        <section className="shell mt-24 md:mt-40" aria-labelledby="fixed-heading">
          <div className="grid gap-5 md:grid-cols-12 md:items-end">
            <div className="md:col-span-6">
              <p className="eyebrow">Year-round</p>
              <h2 id="fixed-heading" className="display mt-5 text-[2.4rem] leading-[1.02] tracking-[-0.015em] md:text-[3.6rem]">
                Fixed Gift <em>Collection</em>
              </h2>
            </div>
            <div className="md:col-span-5 md:col-start-8">
              <p className="text-[15px] leading-relaxed text-ink-2">{CATEGORIES["fixed-gifts"].intro}</p>
            </div>
          </div>

          <div className="mt-12 grid grid-cols-2 gap-x-4 gap-y-12 md:mt-16 md:gap-x-6 lg:grid-cols-12 lg:gap-y-14">
            {fixed[0] && (
              <div className="col-span-2 lg:col-span-6 lg:row-span-2">
                <ProductCard product={fixed[0]} frame="bare" size="lg" ratio={1.3} sizes="(min-width: 1024px) 48vw, 100vw" />
              </div>
            )}
            {fixed.slice(1, 5).map((p, i) => (
              <div key={p.id} className="lg:col-span-3">
                <ProductCard product={p} revealDelay={(i % 2) * 90} sizes="(min-width: 1024px) 22vw, 50vw" />
              </div>
            ))}
          </div>

          {engravable.length > 0 && (
            <div className="mt-16 grid items-center gap-6 border-y border-line py-8 md:mt-24 md:grid-cols-12 md:py-10" data-reveal="">
              <p className="label md:col-span-3">Engraving</p>
              <p className="display-italic text-[1.9rem] leading-none tracking-[0.02em] text-ink md:col-span-6 md:text-center md:text-[2.6rem]">
                Mei Ling · 06.02.2027
              </p>
              <div className="md:col-span-3 md:text-right">
                <p className="text-[13px] text-ink-2">A name or a date on {engravable.length} of our gifts.</p>
                <Link href="/search?q=engraved" className="link-line mt-3">
                  See engravable gifts <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.25} />
                </Link>
              </div>
            </div>
          )}
        </section>
      )}

      {/* 3 · Wine & Spirits — read like a wine list */}
      {wine.length > 0 && (
        <section className="shell mt-24 md:mt-40" aria-labelledby="wine-heading">
          <div className="mb-10 grid gap-5 md:mb-14 md:grid-cols-12 md:items-end">
            <div className="md:col-span-6">
              <p className="eyebrow">By the bottle</p>
              <h2 id="wine-heading" className="display mt-5 text-[2.4rem] leading-[1.02] tracking-[-0.015em] md:text-[3.6rem]">
                Wine <em>&</em> Spirits
              </h2>
            </div>
            <div className="md:col-span-5 md:col-start-8">
              <p className="text-[15px] leading-relaxed text-ink-2">Each bottle comes in its own gift box, to give on its own or alongside a festive hamper.</p>
              <p className="mt-2 text-[12px] text-ink-3">For customers aged 21 and above.</p>
            </div>
          </div>
          <WineList products={wine} />
          <Link href="/wine-spirits" className="link-line mt-10">
            All wine & spirits <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.25} />
          </Link>
        </section>
      )}

      {/* 4 · Corporate Orders */}
      <section className="mt-24 bg-cream md:mt-40" aria-labelledby="corporate-heading">
        <div className="shell grid gap-12 py-20 md:py-28 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-5">
            <p className="eyebrow">Corporate Orders</p>
            <h2 id="corporate-heading" className="display mt-5 text-[2.6rem] leading-[1] tracking-[-0.015em] md:text-[4rem]">
              For clients, <em>partners</em> and teams
            </h2>
            <div className="mt-10 hidden lg:block" data-reveal="">
              <ProductImage src={siteImages.corporateBespoke.src} alt={siteImages.corporateBespoke.alt} ratio={0.75} sizes="36vw" imgClassName="grade" />
            </div>
          </div>
          <div className="lg:col-span-6 lg:col-start-7 lg:pt-24">
            <CorporatePath
              href="/corporate/semi-curated"
              label="Semi-curated"
              title="Start from our collection"
              text="Choose from our existing gift boxes, set a quantity for each and add light customisation, such as your company name on the card. We reply with a quotation."
              cta="Build a request"
            />
            <CorporatePath
              href="/corporate/bespoke"
              label="Fully customised"
              title="Made for your brand"
              text="A gift designed around your brand, quantity, date and delivery addresses. Tell us what you need and we prepare a proposal for you to review."
              cta="Enquire now"
            />
            <ProcessLine className="mt-14" layout="column" />
          </div>
        </div>
      </section>
    </>
  );
}

function CorporatePath({ href, label, title, text, cta }: { href: string; label: string; title: string; text: string; cta: string }) {
  return (
    <Link href={href} className="group block border-t border-line-strong py-8 first:pt-8 md:py-10" data-reveal="">
      <p className="label">{label}</p>
      <div className="mt-3 flex items-baseline justify-between gap-6">
        <h3 className="display text-[1.8rem] leading-tight md:text-[2.3rem]">
          <Emph text={title} />
        </h3>
        <ArrowRight className="h-5 w-5 flex-none text-ink-3 transition-transform duration-500 group-hover:translate-x-1 group-hover:text-ink" strokeWidth={1} />
      </div>
      <p className="mt-3 max-w-[52ch] text-[15px] leading-relaxed text-ink-2">{text}</p>
      <span className="link-line mt-5">{cta}</span>
    </Link>
  );
}

