import type { Metadata } from "next";
import { parseOccasion, parseSort } from "@/components/collection-view";
import { FestiveView } from "@/components/festive-view";
import { CATEGORIES } from "@/lib/catalog";
import { getStore } from "@/lib/store";

export const metadata: Metadata = {
  title: "Festive Collection",
  description: CATEGORIES.festive.intro,
};

export default async function FestivePage({ searchParams }: PageProps<"/festive">) {
  const sp = await searchParams;
  const store = await getStore();
  const [products, settings] = await Promise.all([store.listProducts(), store.getSettings()]);
  return <FestiveView products={products} settings={settings} occasion={parseOccasion(sp.occasion)} sort={parseSort(sp.sort)} />;
}
