import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { SemiCuratedForm } from "@/components/corporate/semi-curated-form";
import { isPurchasable, sortProducts } from "@/lib/catalog";
import { earliestDeliveryDate } from "@/lib/dates";
import { getStore } from "@/lib/store";

export const metadata: Metadata = {
  title: "Semi-customised corporate orders",
  description: "Choose gifts from the Moire Co. collection, set quantities and add light customisation. We reply with a quotation.",
};

export default async function SemiCuratedPage() {
  const store = await getStore();
  const [products, settings] = await Promise.all([store.listProducts(), store.getSettings()]);
  const options = sortProducts(products.filter((p) => isPurchasable(p) && p.category !== "wine-spirits")).map((p) => ({
    id: p.id,
    name: p.name,
    price: p.price,
    summary: p.summary,
    image: p.images[0]?.src,
    group: p.category === "festive" ? "Festive" : "Fixed Gift Collection",
  }));
  return (
    <div className="shell pt-6 md:pt-10">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Corporate Orders", href: "/corporate" }, { label: "Semi-customised" }]} />
      <header className="mt-8 max-w-3xl md:mt-12">
        <p className="eyebrow">Semi-customised</p>
        <h1 className="display mt-4 text-[2.5rem] leading-[1.02] md:text-[3.6rem]">Start from our collection</h1>
        <p className="mt-5 max-w-[56ch] text-[15px] leading-relaxed text-ink-2">
          Choose the gifts, quantities and light customisation you need. Prices shown are our standard prices per gift — we’ll reply with a quotation
          confirming the final amount, customisation and delivery.
        </p>
      </header>
      <SemiCuratedForm options={options} earliestDate={earliestDeliveryDate(settings.deliveryLeadDays)} whatsappNumber={settings.whatsappNumber} />
    </div>
  );
}
