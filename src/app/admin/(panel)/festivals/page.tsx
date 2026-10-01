import { FestivalEditor } from "@/components/admin/festival-editor";
import { PageTitle } from "@/components/admin/ui";
import { sortFestivals } from "@/lib/catalog";
import { getStore } from "@/lib/store";

export const metadata = { title: "Festivals" };

export default async function FestivalsAdmin() {
  const store = await getStore();
  const [festivals, products] = await Promise.all([store.listFestivals(), store.listProducts()]);
  const list = sortFestivals(festivals, true);
  const nextSort = (list.at(-1)?.sort ?? 0) + 10;
  return (
    <>
      <PageTitle
        title="Festivals"
        sub="The festivals customers see in the Festive Collection. Rename, reorder, hide or add festivals here; assign products to a festival in Products."
      />
      <div className="max-w-4xl space-y-4">
        {list.map((f) => (
          <FestivalEditor key={f.id + (f.updatedAt ?? "")} festival={f} productCount={products.filter((p) => p.festivalId === f.id).length} />
        ))}
        <h2 className="pt-6 text-[12px] font-medium uppercase tracking-[0.14em] text-ink-2">Add a festival</h2>
        <FestivalEditor festival={null} nextSort={nextSort} />
      </div>
    </>
  );
}
