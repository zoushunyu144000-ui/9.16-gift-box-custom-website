import { NextResponse } from "next/server";
import { CATEGORIES, priceLabel } from "@/lib/catalog";
import { searchProducts } from "@/lib/search";
import { getStore } from "@/lib/store";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.slice(0, 80) ?? "";
  const store = await getStore();
  const hits = searchProducts(await store.listProducts(), q).slice(0, 12);
  return NextResponse.json({
    hits: hits.map((p) => ({
      slug: p.slug,
      name: p.name,
      price: priceLabel(p),
      category: CATEGORIES[p.category].name,
      image: p.images[0]?.src,
      soldOut: p.status !== "active",
    })),
  });
}
