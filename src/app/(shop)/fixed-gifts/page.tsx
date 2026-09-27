import type { Metadata } from "next";
import { CollectionView, parseSort } from "@/components/collection-view";
import { CATEGORIES } from "@/lib/catalog";
import { getStore } from "@/lib/store";

export const metadata: Metadata = {
  title: "Fixed Gift Collection",
  description: CATEGORIES["fixed-gifts"].intro,
};

export default async function FixedGiftsPage({ searchParams }: PageProps<"/fixed-gifts">) {
  const sp = await searchParams;
  const products = await (await getStore()).listProducts();
  return (
    <CollectionView
      basePath="/fixed-gifts"
      eyebrow="Year-round"
      title={CATEGORIES["fixed-gifts"].name}
      intro={CATEGORIES["fixed-gifts"].intro}
      note="Look for “Can be engraved” — add the name on the product page before adding to your bag."
      products={products.filter((p) => p.category === "fixed-gifts" && p.status !== "hidden")}
      sort={parseSort(sp.sort)}
    />
  );
}
