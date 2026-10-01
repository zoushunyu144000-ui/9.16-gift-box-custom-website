import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductEditor } from "@/components/admin/product-editor";
import { PageTitle } from "@/components/admin/ui";
import { getStore } from "@/lib/store";

export default async function EditProduct({ params }: PageProps<"/admin/products/[id]">) {
  const { id } = await params;
  const store = await getStore();
  const [product, festivals] = await Promise.all([id === "new" ? null : store.getProductById(id), store.listFestivals()]);
  if (id !== "new" && !product) notFound();
  return (
    <>
      <Link href="/admin/products" className="text-[13px] text-ink-2 hover:text-ink">← Products</Link>
      <PageTitle title={product ? product.name : "New product"}>
        {product && product.status !== "hidden" && (
          <Link href={`/products/${product.slug}`} target="_blank" className="btn btn-outline">View on site ↗</Link>
        )}
      </PageTitle>
      <ProductEditor product={product} festivals={festivals} />
    </>
  );
}
