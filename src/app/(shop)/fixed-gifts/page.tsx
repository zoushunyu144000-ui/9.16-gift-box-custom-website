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
      title="Fixed Gift *Collection*"
      intro={CATEGORIES["fixed-gifts"].intro}
      note="Pieces marked “Engraving available” can carry a name or a date — add it on the product page."
      products={products.filter((p) => p.category === "fixed-gifts" && p.status !== "hidden")}
      sort={parseSort(sp.sort)}
    />
  );
}
