import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { ProductImage } from "@/components/product-image";
import { siteImages } from "@/data/seed";
import type { ProductImage as Img } from "@/lib/types";

export const metadata: Metadata = {
  title: "Corporate Orders",
  description: "Corporate gifting from Moire: semi-customised gifts from our collection, or fully customised gifts made for your brand.",
};

/**
 * Corporate Orders, after the client's mockup (Oct 2026): three numbered entries.
 * 01 Semi-curated goes straight to the Fixed Gift Collection, 02 Fully customise to
 * /corporate/bespoke, 03 Corporate seasonal gifting to the festive collection.
 * Photographs sit full-bleed, without a mount.
 */
export default function CorporatePage() {
  return (
    <div className="shell pt-6 md:pt-10">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Corporate Orders" }]} />

      <header className="mt-8 max-w-6xl md:mt-12">
        <p className="eyebrow">Corporate Gifting</p>
        <h1 className="display mt-4 text-[2.6rem] leading-[1.02] md:text-[4rem]">Create Emotion Through Gifting</h1>
        <p className="mt-5 text-[15px] leading-relaxed text-ink-2">
          We help brands create thoughtful moments that leave a lasting impression — for clients, VIPs and teams.
        </p>
      </header>

      <section className="mt-12 grid gap-x-6 gap-y-14 md:mt-16 md:grid-cols-3" aria-label="Ways to order">
        <Entry
          number="01"
          title="Semi - Curated"
          text="Choose from our collection and add your brand touch."
          href="/fixed-gifts"
          image={siteImages.corporateSemi}
          priority
        />
        <Entry
          number="02"
          title="Fully Customize"
          text="Built a gift around your brand, from packaging to products."
          href="/corporate/bespoke"
          image={siteImages.corporateBespoke}
        />
        <Entry
          number="03"
          title="Corporate Seasonal Gifting"
          text="Thoughtful gifts for teams, celebrations and bulk orders."
          href="/festive"
          image={siteImages.festiveCampaign}
        />
      </section>
    </div>
  );
}

function Entry({ number, title, text, href, image, priority = false }: { number: string; title: string; text: string; href: string; image: Img; priority?: boolean }) {
  return (
    <Link href={href} className="group block">
      <div className="-mx-5 overflow-hidden md:mx-0">
        <ProductImage
          src={image.src}
          alt={image.alt}
          ratio={0.9}
          priority={priority}
          sizes="(min-width: 768px) 46vw, 100vw"
          imgClassName="grade transition-transform duration-[1.4s] ease-out-soft [@media(hover:hover)]:group-hover:scale-[1.035]"
        />
      </div>
      <h2 className="mt-6 flex items-baseline gap-3 leading-[1.1]">
        <span className="text-[13px] font-medium tracking-[0.18em] text-bronze">{number}</span>
        <span className="h-4 w-px self-center bg-bronze/60" aria-hidden="true" />
        <span className="display text-[1.5rem] uppercase tracking-[0.02em] md:text-[1.1rem] lg:text-[1.2rem] xl:text-[1.3rem]">{title}</span>
      </h2>
      <p className="mt-3 text-[15px] text-ink-2">{text}</p>
      <span className="link-line mt-5">
        View details <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.25} />
      </span>
    </Link>
  );
}
