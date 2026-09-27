import type { Metadata } from "next";
import { CollectionView, parseOccasion, parseSort } from "@/components/collection-view";
import { CATEGORIES, OCCASION_ORDER, OCCASIONS } from "@/lib/catalog";
import { getStore } from "@/lib/store";

export const metadata: Metadata = {
  title: "Festive Collection",
  description: CATEGORIES.festive.intro,
};

export default async function FestivePage({ searchParams }: PageProps<"/festive">) {
  const sp = await searchParams;
  const store = await getStore();
  const [products, settings] = await Promise.all([store.listProducts(), store.getSettings()]);
  const festive = products.filter((p) => p.category === "festive" && p.status !== "hidden");
  const available = OCCASION_ORDER.filter((o) => festive.some((p) => p.occasion === o));
  // Current season first
  const occasions = [settings.activeOccasion, ...available.filter((o) => o !== settings.activeOccasion)].filter((o) =>
    available.includes(o),
  );
  const occasion = parseOccasion(sp.occasion);
  const list = occasion === "all" ? festive : festive.filter((p) => p.occasion === occasion);

  return (
    <CollectionView
      basePath="/festive"
      eyebrow={occasion === "all" ? `Now: ${OCCASIONS[settings.activeOccasion].name}` : "Festive Collection"}
      title={occasion === "all" ? CATEGORIES.festive.name : OCCASIONS[occasion].name}
      intro={occasion === settings.activeOccasion || occasion === "all" ? settings.festiveIntro : CATEGORIES.festive.intro}
      products={list}
      sort={parseSort(sp.sort)}
      occasions={occasions}
      activeOccasion={occasion}
    />
  );
}
