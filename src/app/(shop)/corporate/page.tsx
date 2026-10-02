import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { ProductImage } from "@/components/product-image";
import { siteImages } from "@/data/seed";
import type { ProductImage as Img } from "@/lib/types";

export const metadata: Metadata = {
  title: "Corporate Orders",
  description: "Corporate gifting from Moire Co.: semi-customised gifts from our collection, or fully customised gifts made for your brand.",
};

/**
 * Corporate Orders — deliberately short: two main entries, details one click away
 * (/corporate/semi-curated and /corporate/bespoke).
 */
export default function CorporatePage() {
  return (
    <div className="shell pt-6 md:pt-10">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Corporate Orders" }]} />

      <header className="mt-8 max-w-3xl md:mt-12">
        <p className="eyebrow">Corporate Orders</p>
        <h1 className="display mt-4 text-[2.6rem] leading-[1.02] md:text-[4rem]">Gifting for your clients and team</h1>
        <p className="mt-5 text-[15px] leading-relaxed text-ink-2">Two ways to order. Choose one to see how it works.</p>
      </header>

      <section className="mt-12 grid gap-x-6 gap-y-14 md:mt-16 md:grid-cols-2" aria-label="Ways to order">
        <Entry
          title="Semi-customised"
          text="Gifts from our collection, with your company’s touch."
          href="/corporate/semi-curated"
          image={siteImages.corporateSemi}
          priority
        />
        <Entry
          title="Fully customised"
          text="A gift designed entirely around your brand."
          href="/corporate/bespoke"
          image={siteImages.corporateBespoke}
        />
      </section>
    </div>
  );
}

function Entry({ title, text, href, image, priority = false }: { title: string; text: string; href: string; image: Img; priority?: boolean }) {
  return (
    <Link href={href} className="group block">
      <div className="mount overflow-hidden transition-colors duration-500 group-hover:bg-stone">
        <ProductImage
          src={image.src}
          alt={image.alt}
          ratio={0.9}
          priority={priority}
          sizes="(min-width: 768px) 46vw, 100vw"
          imgClassName="grade transition-transform duration-[1.4s] ease-out-soft [@media(hover:hover)]:group-hover:scale-[1.035]"
        />
      </div>
      <h2 className="display mt-6 text-[2.2rem] leading-[1.05] md:text-[3rem]">{title}</h2>
      <p className="mt-2 text-[15px] text-ink-2">{text}</p>
      <span className="link-line mt-5">
        View details <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.25} />
      </span>
    </Link>
  );
}
