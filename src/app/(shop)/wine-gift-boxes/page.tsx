import type { Metadata } from "next";
import { CollectionView, parseSort } from "@/components/collection-view";
import { CATEGORIES } from "@/lib/catalog";
import { getStore } from "@/lib/store";

export const metadata: Metadata = {
  title: "Wine Gift Boxes",
  description: CATEGORIES["wine-spirits"].intro,
};

export default async function WineGiftBoxesPage({ searchParams }: PageProps<"/wine-gift-boxes">) {
  const sp = await searchParams;
  const products = await (await getStore()).listProducts();
  return (
    <CollectionView
      basePath="/wine-gift-boxes"
      eyebrow="Gift boxes & gift sets"
      title="Wine *Gift Boxes*"
      layout="list"
      intro="Wine, champagne and spirits, gift boxed and ready to give."
      note="Gift boxes containing alcohol are sold only to customers aged 21 and above. You'll be asked to confirm your age at checkout."
      products={products.filter((p) => p.category === "wine-spirits" && p.status !== "hidden")}
      sort={parseSort(sp.sort)}
    />
  );
}
