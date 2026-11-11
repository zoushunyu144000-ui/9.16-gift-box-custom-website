import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CollectionView, parseSort } from "@/components/collection-view";
import { ALCOHOL_ON_SALE } from "@/lib/alcohol";
import { CATEGORIES } from "@/lib/catalog";
import { getStore } from "@/lib/store";

// Off the shop while alcohol is not on sale (lib/alcohol): the page answers Not Found.
export const metadata: Metadata = ALCOHOL_ON_SALE
  ? { title: "Wine Gift Boxes", description: CATEGORIES["wine-spirits"].intro }
  : { robots: { index: false } };

export default async function WineGiftBoxesPage({ searchParams }: PageProps<"/wine-gift-boxes">) {
  if (!ALCOHOL_ON_SALE) notFound();
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
