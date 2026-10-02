import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { ProductCard } from "@/components/product-card";
import { festivalName } from "@/lib/catalog";
import { searchProducts } from "@/lib/search";
import { getStore } from "@/lib/store";

export const metadata: Metadata = { title: "Search", robots: { index: false } };

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.trim().slice(0, 80) : "";
  const store = await getStore();
  const [products, festivals] = await Promise.all([store.listProducts(), store.listFestivals()]);
  const results = query ? searchProducts(products, query, festivals) : [];

  return (
    <div className="shell pt-6 md:pt-10">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Search" }]} />
      <h1 className="display mt-8 text-[2.4rem] leading-none md:mt-12 md:text-[3.5rem]">{query ? `“${query}”` : "Search"}</h1>
      <form action="/search" className="mt-8 flex max-w-xl gap-3" role="search">
        <input name="q" defaultValue={query} type="search" placeholder="Search gift boxes, hampers…" className="field flex-1" aria-label="Search products" />
        <button className="btn btn-primary">Search</button>
      </form>
      {query && (
        <p className="mt-8 text-[13px] text-ink-2">
          {results.length} {results.length === 1 ? "result" : "results"}
        </p>
      )}
      {query && results.length === 0 && (
        <div className="mt-6 border border-line px-6 py-16 text-center">
          <p className="display text-2xl">No gifts found</p>
          <p className="mx-auto mt-2 max-w-[40ch] text-ink-2">Try a different word, or browse a collection.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/festive" className="btn btn-outline">Festive</Link>
            <Link href="/fixed-gifts" className="btn btn-outline">Fixed Gift Collection</Link>
            <Link href="/wine-gift-boxes" className="btn btn-outline">Wine Gift Boxes</Link>
          </div>
        </div>
      )}
      {results.length > 0 && (
        <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-12 md:grid-cols-3 md:gap-x-6 xl:grid-cols-4">
          {results.map((p) => (
            <ProductCard key={p.id} product={p} eyebrow={festivalName(festivals, p.festivalId)} sizes="(min-width: 1280px) 23vw, (min-width: 768px) 31vw, 50vw" />
          ))}
        </div>
      )}
    </div>
  );
}
