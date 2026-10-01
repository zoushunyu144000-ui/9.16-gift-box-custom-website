import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { parseSort } from "@/components/collection-view";
import { FestivalView } from "@/components/festive-view";
import { getStore } from "@/lib/store";

async function findFestival(slug: string) {
  const festivals = await (await getStore()).listFestivals();
  return { festival: festivals.find((f) => f.slug === slug && f.active) ?? null, festivals };
}

export async function generateMetadata({ params }: PageProps<"/festive/[festival]">): Promise<Metadata> {
  const { festival } = await findFestival((await params).festival);
  if (!festival) return { title: "Festive Collection" };
  return { title: `${festival.name} gift boxes`, description: festival.description || `${festival.name} gift boxes from Moire Co.` };
}

export default async function FestivalPage({ params, searchParams }: PageProps<"/festive/[festival]">) {
  const [{ festival: slug }, sp] = await Promise.all([params, searchParams]);
  const { festival, festivals } = await findFestival(slug);
  if (!festival) notFound();
  const store = await getStore();
  const [products, settings] = await Promise.all([store.listProducts(), store.getSettings()]);
  return <FestivalView festival={festival} festivals={festivals} products={products} settings={settings} sort={parseSort(sp.sort)} />;
}
