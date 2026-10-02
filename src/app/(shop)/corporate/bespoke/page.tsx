import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { ProcessLine } from "@/components/process-line";
import { ProductImage } from "@/components/product-image";
import { siteImages } from "@/data/seed";
import { BespokeQuickForm } from "@/components/corporate/bespoke-quick-form";
import { earliestDeliveryDate } from "@/lib/dates";
import { getStore } from "@/lib/store";

export const metadata: Metadata = {
  title: "Made for your brand — fully customised corporate gifts",
  description: "Fully customised corporate gifts from Moire Co. Tell us your style, date and quantity and send it to us on WhatsApp, and we prepare a proposal.",
};

export default async function BespokePage() {
  const settings = await (await getStore()).getSettings();

  return (
    <div className="shell pt-6 md:pt-10">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Corporate Orders", href: "/corporate" }, { label: "Fully customised" }]} />
      <header className="mt-8 grid gap-10 md:mt-12 lg:grid-cols-12 lg:gap-12">
        <div className="flex flex-col justify-center lg:col-span-6">
          <p className="eyebrow">Fully customised</p>
          <h1 className="display mt-4 text-[2.6rem] leading-[1.0] tracking-[0.01em] md:text-[4.2rem]">MADE FOR YOUR BRAND</h1>
          <p className="mt-6 max-w-[48ch] text-[15px] leading-relaxed text-ink-2">
            A corporate gift designed around your brand, occasion and recipients. We prepare a proposal for you to review before anything is produced.
          </p>
        </div>
        <div className="lg:col-span-5 lg:col-start-8">
          <ProductImage src={siteImages.bespokeDetail.src} alt={siteImages.bespokeDetail.alt} ratio={1.15} sizes="(min-width: 1024px) 40vw, 100vw" priority />
        </div>
      </header>

      <section className="mt-16 border-t border-line pt-12 md:mt-24" aria-label="Process">
        <ProcessLine />
      </section>

      <section className="mt-16 grid gap-10 border-t border-line pt-12 md:mt-24 md:grid-cols-12 md:gap-8" aria-labelledby="prepare-heading">
        <div className="md:col-span-5">
          <h2 id="prepare-heading" className="display text-[2rem] leading-tight md:text-[2.5rem]">
            Tell us a little
          </h2>
          <p className="mt-3 max-w-[40ch] text-[15px] leading-relaxed text-ink-2">
            Fill in what you know — it takes a few seconds — and send it to us on WhatsApp. Anything you’re unsure of, we can work out together.
          </p>
        </div>
        <div className="md:col-span-6 md:col-start-7">
          <BespokeQuickForm earliestDate={earliestDeliveryDate(settings.deliveryLeadDays)} whatsappNumber={settings.whatsappNumber} />
        </div>
      </section>
    </div>
  );
}
