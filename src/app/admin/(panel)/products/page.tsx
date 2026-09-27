import Link from "next/link";
import { PageTitle, Pill, PRODUCT_STATUS } from "@/components/admin/ui";
import { ProductImage } from "@/components/product-image";
import { CATEGORIES, OCCASIONS, priceLabel, sortProducts } from "@/lib/catalog";
import { getStore } from "@/lib/store";
import type { CategorySlug } from "@/lib/types";

export const metadata = { title: "Products" };

export default async function ProductsAdmin({ searchParams }: PageProps<"/admin/products">) {
  const { category } = await searchParams;
  const all = sortProducts(await (await getStore()).listProducts());
  const cat = typeof category === "string" && category in CATEGORIES ? (category as CategorySlug) : null;
  const list = cat ? all.filter((p) => p.category === cat) : all;
  return (
    <>
      <PageTitle title="Products" sub={`${all.length} products · ${all.filter((p) => p.status === "active").length} on sale`}>
        <Link href="/admin/products/new" className="btn btn-primary">Add product</Link>
      </PageTitle>
      <div className="no-scrollbar mb-5 flex gap-1.5 overflow-x-auto">
        {[null, ...(Object.keys(CATEGORIES) as CategorySlug[])].map((c) => (
          <Link key={c ?? "all"} href={c ? `/admin/products?category=${c}` : "/admin/products"} className={`flex-none border px-3 py-1.5 text-[12px] ${cat === c ? "border-ink bg-ink text-ivory" : "border-line-strong bg-ivory hover:border-ink"}`}>
            {c ? CATEGORIES[c].name : "All"} ({c ? all.filter((p) => p.category === c).length : all.length})
          </Link>
        ))}
      </div>
      <div className="overflow-x-auto border border-line bg-ivory">
        <table className="w-full min-w-[720px] text-left text-[14px]">
          <thead className="border-b border-line text-[11px] uppercase tracking-[0.12em] text-ink-3">
            <tr>
              <th className="px-4 py-3 font-medium">Product</th>
              <th className="px-4 py-3 font-medium">Collection</th>
              <th className="px-4 py-3 font-medium">Price</th>
              <th className="px-4 py-3 font-medium">Images</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {list.map((p) => (
              <tr key={p.id} className="hover:bg-cream/50">
                <td className="px-4 py-2.5">
                  <Link href={`/admin/products/${p.id}`} className="flex items-center gap-3">
                    <span className="w-10 flex-none"><ProductImage src={p.images[0]?.src} alt="" ratio={1.25} sizes="40px" /></span>
                    <span>
                      <span className="block font-medium underline-offset-4 hover:underline">{p.name}</span>
                      <span className="block text-[12px] text-ink-3">
                        {p.featured ? "Homepage · " : ""}{p.personalisation?.enabled ? "Engraving · " : ""}{p.variants.length ? `${p.variants.length} options` : "No options"}
                      </span>
                    </span>
                  </Link>
                </td>
                <td className="px-4 py-2.5">{CATEGORIES[p.category].short}{p.occasion ? <div className="text-[12px] text-ink-3">{OCCASIONS[p.occasion].name}</div> : null}</td>
                <td className="px-4 py-2.5 tabular-nums">{priceLabel(p)}</td>
                <td className="px-4 py-2.5 tabular-nums">{p.images.length}</td>
                <td className="px-4 py-2.5"><Pill tone={PRODUCT_STATUS[p.status].tone}>{PRODUCT_STATUS[p.status].label}</Pill></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
