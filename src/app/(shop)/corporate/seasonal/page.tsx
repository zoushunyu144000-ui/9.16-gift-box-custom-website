import type { Metadata } from "next";
import { CollectionView, parseSort } from "@/components/collection-view";
import { CATEGORIES } from "@/lib/catalog";
import { getStore } from "@/lib/store";

export const metadata: Metadata = {
  title: "Corporate Seasonal Gifting",
  description: CATEGORIES["corporate-seasonal"].intro,
};

/** The third way to order on Corporate Orders: the sets in the "Corporate Seasonal Gifting" category. */
export default async function CorporateSeasonalPage({ searchParams }: PageProps<"/corporate/seasonal">) {
  const sp = await searchParams;
  const products = await (await getStore()).listProducts();
  return (
    <CollectionView
      basePath="/corporate/seasonal"
      eyebrow="Corporate Orders"
      title="Corporate Seasonal *Gifting*"
      intro={CATEGORIES["corporate-seasonal"].intro}
      products={products.filter((p) => p.category === "corporate-seasonal" && p.status !== "hidden")}
      sort={parseSort(sp.sort)}
    />
  );
}
