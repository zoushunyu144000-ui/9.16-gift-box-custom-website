import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { ProcessLine } from "@/components/process-line";
import { ProductImage } from "@/components/product-image";
import { siteImages } from "@/data/seed";
import { whatsappLink } from "@/lib/catalog";
import { getStore } from "@/lib/store";

export const metadata: Metadata = {
  title: "Corporate Orders",
  description: "Corporate gifting from Moire Co.: semi-curated orders from our collection, or fully customised gifts made for your brand.",
};

export default async function CorporatePage() {
  const settings = await (await getStore()).getSettings();
  return (
    <div className="shell pt-6 md:pt-10">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Corporate Orders" }]} />

      <header className="mt-8 grid gap-10 md:mt-12 lg:grid-cols-12 lg:gap-12">
        <div className="flex flex-col justify-center lg:col-span-5">
          <p className="eyebrow">Corporate Orders</p>
          <h1 className="display mt-4 text-[2.6rem] leading-[1.02] md:text-[4rem]">Gifting for your clients and team</h1>
          <p className="mt-6 max-w-[46ch] text-[15px] leading-relaxed text-ink-2">
            There are two ways to order for your company. Start from gifts we already make and add light customisation, or work with us on a gift designed
            entirely around your brand.
          </p>
        </div>
        <div className="lg:col-span-7">
          <ProductImage src={siteImages.corporateHero.src} alt={siteImages.corporateHero.alt} ratio={0.66} sizes="(min-width: 1024px) 56vw, 100vw" priority imgClassName="grade" />
        </div>
      </header>

      <section className="mt-20 grid gap-6 md:mt-28 md:grid-cols-2" aria-label="Ways to order">
        <PathCard
          label="Semi-curated"
          title="Start from our collection"
          points={[
            "Choose from existing festive and fixed gifts",
            "Set a quantity for each gift",
            "Add light customisation, such as your company name on the card",
            "Send the request here and we reply with a quotation",
          ]}
          href="/corporate/semi-curated"
          cta="Build a request"
        />
        <PathCard
          label="Fully customised"
          title="Made for your brand"
          points={[
            "A gift designed around your brand and occasion",
            "Tell us the style, quantity, date and delivery address",
            "We prepare a proposal for you to review",
            "Production begins once you confirm",
          ]}
          href="/corporate/bespoke"
          cta="Enquire now"
        />
      </section>

      <section className="mt-20 border-t border-line pt-12 md:mt-28" aria-label="Process">
        <ProcessLine />
      </section>

      <section className="mt-20 flex flex-col items-start justify-between gap-6 border border-line bg-cream/60 px-6 py-10 md:mt-28 md:flex-row md:items-center md:px-10">
        <div>
          <h2 className="display text-[1.75rem] leading-tight">Not sure which suits you?</h2>
          <p className="mt-2 max-w-[52ch] text-[15px] text-ink-2">Message us with your occasion, quantity and date, and we’ll suggest the right route.</p>
        </div>
        <a
          href={whatsappLink(settings.whatsappNumber, "Hello Moire Co., I'd like to discuss a corporate gifting order.")}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-primary flex-none"
        >
          Chat on WhatsApp
        </a>
      </section>
    </div>
  );
}

function PathCard({ label, title, points, href, cta }: { label: string; title: string; points: string[]; href: string; cta: string }) {
  return (
    <Link href={href} className="group flex flex-col border border-line p-7 transition-colors hover:border-champagne md:p-10">
      <p className="eyebrow">{label}</p>
      <h2 className="display mt-4 text-[2rem] leading-tight md:text-[2.5rem]">{title}</h2>
      <ul className="prose-moire mt-6 flex-1 text-[15px] text-ink-2">
        {points.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
      <span className="btn btn-outline mt-8 self-start group-hover:border-ink">
        {cta} <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.25} />
      </span>
    </Link>
  );
}
