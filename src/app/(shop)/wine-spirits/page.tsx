import type { Metadata } from "next";
import { CollectionView, parseSort } from "@/components/collection-view";
import { CATEGORIES } from "@/lib/catalog";
import { getStore } from "@/lib/store";

export const metadata: Metadata = {
  title: "Wine & Spirits",
  description: CATEGORIES["wine-spirits"].intro,
};

export default async function WineSpiritsPage({ searchParams }: PageProps<"/wine-spirits">) {
  const sp = await searchParams;
  const products = await (await getStore()).listProducts();
  return (
    <CollectionView
      basePath="/wine-spirits"
      eyebrow="Cellar selection"
      title={CATEGORIES["wine-spirits"].name}
      intro="Wine, champagne and spirits, each presented in a gift box."
      note="Alcohol is sold only to customers aged 21 and above. You'll be asked to confirm your age at checkout."
      products={products.filter((p) => p.category === "wine-spirits" && p.status !== "hidden")}
      sort={parseSort(sp.sort)}
    />
  );
}
