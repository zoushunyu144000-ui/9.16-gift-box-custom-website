import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FestiveIndex } from "@/components/festive-view";
import { CATEGORIES, festivalHref } from "@/lib/catalog";
import { getStore } from "@/lib/store";

export const metadata: Metadata = {
  title: "Festive Collection",
  description: CATEGORIES.festive.intro,
};

export default async function FestivePage({ searchParams }: PageProps<"/festive">) {
  const sp = await searchParams;
  const store = await getStore();
  const [products, settings, festivals] = await Promise.all([store.listProducts(), store.getSettings(), store.listFestivals()]);

  // Links from v1 used /festive?occasion=mid-autumn — send them to the festival page.
  if (typeof sp.occasion === "string") {
    const f = festivals.find((x) => (x.id === sp.occasion || x.slug === sp.occasion) && x.active);
    if (f) redirect(festivalHref(f));
  }

  return <FestiveIndex festivals={festivals} products={products} settings={settings} />;
}
