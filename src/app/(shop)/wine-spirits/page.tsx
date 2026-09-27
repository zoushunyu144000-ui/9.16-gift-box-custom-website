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
      eyebrow="By the bottle"
      title="Wine *&* Spirits"
      layout="list"
      intro="Wine, champagne and spirits, each in its own gift box — to give on its own or alongside a festive hamper."
      note="Alcohol is sold only to customers aged 21 and above. You'll be asked to confirm your age at checkout."
      products={products.filter((p) => p.category === "wine-spirits" && p.status !== "hidden")}
      sort={parseSort(sp.sort)}
    />
  );
}
