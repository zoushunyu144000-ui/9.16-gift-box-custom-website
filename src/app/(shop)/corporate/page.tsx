import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { ProductImage } from "@/components/product-image";
import { siteImages } from "@/data/seed";
import type { ProductImage as Img } from "@/lib/types";

export const metadata: Metadata = {
  title: "Corporate Orders",
  description: "Corporate gifting from Moire: semi-curated gifts from our collection, fully customised gifts made for your brand, and seasonal sets for teams and bulk orders.",
};

/**
 * Corporate Orders — three ways to order, side by side (client, Oct 2026): Semi-curated goes straight
 * to the Fixed Gift Collection, Fully customise to /corporate/bespoke, and Corporate Seasonal Gifting
 * to its own short list of sets. Photographs sit full-bleed, without a mount.
 */
export default function CorporatePage() {
  return (
    <div className="shell pt-6 md:pt-10">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Corporate Orders" }]} />

      <header className="mt-8 max-w-3xl md:mt-12">
        <p className="eyebrow">Corporate Gifting</p>
        <h1 className="display mt-4 text-[2.6rem] leading-[1.02] md:text-[4rem]">Create Emotion Through Gifting</h1>
        <p className="mt-5 text-[15px] leading-relaxed text-ink-2">We help brands create thoughtful moments that leave a lasting impression — for clients, VIPs and teams.</p>
      </header>

      <section className="mt-12 grid gap-x-6 gap-y-14 md:mt-16 md:grid-cols-3" aria-label="Ways to order">
        <Entry
          number="01"
          title="Semi-curated"
          text="Choose from our collection and add your brand touch."
          href="/fixed-gifts"
          image={siteImages.corporateSemi}
          priority
        />
        <Entry number="02" title="Fully customise" text="A gift built around your brand, from packaging to product." href="/corporate/bespoke" image={siteImages.corporateBespoke} />
        <Entry
          number="03"
          title="Corporate Seasonal Gifting"
          text="Thoughtful gifts from teams, celebrations and bulk orders."
          href="/corporate/seasonal"
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
          sizes="(min-width: 768px) 31vw, 100vw"
          imgClassName="transition-transform duration-[1.4s] ease-out-soft [@media(hover:hover)]:group-hover:scale-[1.035]"
        />
      </div>
      <h2 className="display mt-6 flex items-baseline gap-3 text-[1.6rem] uppercase leading-[1.1] tracking-[0.02em] md:text-[1.45rem] lg:text-[1.7rem]">
        <span className="text-[13px] tracking-[0.12em] text-bronze">{number}</span>
        <span className="h-4 w-px flex-none self-center bg-line-strong" aria-hidden="true" />
        <span>{title}</span>
      </h2>
      <p className="mt-2 text-[15px] text-ink-2">{text}</p>
      <span className="link-line mt-5">
        View details <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.25} />
      </span>
    </Link>
  );
}
