import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { ProductCard } from "@/components/product-card";
import { Gallery } from "@/components/product/gallery";
import { PurchasePanel } from "@/components/product/purchase-panel";
import { CATEGORIES, festivalHref, formatRM, isSoldOut, sortProducts } from "@/lib/catalog";
import { sizedSrc } from "@/lib/images";
import { getStore } from "@/lib/store";

export async function generateMetadata({ params }: PageProps<"/products/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const product = await (await getStore()).getProductBySlug(slug);
  if (!product || product.status === "hidden") return { title: "Gift not found" };
  return {
    title: product.name,
    description: product.summary,
    openGraph: { images: product.images[0] ? [sizedSrc(product.images[0].src, 1200)] : [] },
  };
}

export default async function ProductPage({ params }: PageProps<"/products/[slug]">) {
  const { slug } = await params;
  const store = await getStore();
  const [product, all, settings, festivals] = await Promise.all([store.getProductBySlug(slug), store.listProducts(), store.getSettings(), store.listFestivals()]);
  if (!product || product.status === "hidden") notFound();

  const cat = CATEGORIES[product.category];
  const festival = festivals.find((f) => f.id === product.festivalId && f.active);
  const related = sortProducts(
    all.filter((p) => p.id !== product.id && p.status === "active" && !isSoldOut(p) && p.category === product.category),
  )
    .sort((a, b) => Number(b.festivalId === product.festivalId) - Number(a.festivalId === product.festivalId))
    .slice(0, 4);
  const soldOut = isSoldOut(product);

  const deliveryText =
    settings.freeDeliveryThreshold != null
      ? `Delivery ${formatRM(settings.deliveryFee)} per order, free on orders from ${formatRM(settings.freeDeliveryThreshold)}.`
      : `Delivery ${formatRM(settings.deliveryFee)} per order.`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.summary,
    image: product.images.map((i) => sizedSrc(i.src, 1200)),
    offers: {
      "@type": "Offer",
      priceCurrency: "MYR",
      price: product.price,
      availability: soldOut || product.status !== "active" ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
    },
  };

  return (
    <div className="shell pt-5 md:pt-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="hidden lg:block">
        <Breadcrumbs
          items={[
            { label: "Home", href: "/" },
            { label: cat.name, href: cat.href },
            ...(festival ? [{ label: festival.name, href: festivalHref(festival) }] : []),
            { label: product.name },
          ]}
        />
      </div>

      <div className="grid gap-8 lg:mt-8 lg:grid-cols-12 lg:gap-12 xl:gap-16">
        <div className="min-w-0 lg:sticky lg:top-28 lg:col-span-7 lg:self-start">
          <Gallery images={product.images} name={product.name} soldOut={soldOut} mobileRatio={product.category === "wine-spirits" ? 1.25 : 1.05} />
        </div>

        {/* Name → Description → Price → Options / Personalisation → Add to bag (or Sold Out) → details */}
        <div className="min-w-0 lg:col-span-5">
          <div className="lg:hidden">
            <Breadcrumbs items={[{ label: cat.name, href: cat.href }, { label: product.name }]} />
          </div>
          <p className="eyebrow mt-5 lg:mt-0">{festival ? festival.name : cat.name}</p>
          <h1 className="display mt-3 text-[2.25rem] leading-[1.05] md:text-[2.9rem]">{product.name}</h1>
          {/* The one product description sits right under the name (client, Oct 2026); what's in
              the box is written into it, so there is no separate contents list. */}
          {product.description && (
            <p id="description-heading" className="mt-4 whitespace-pre-line text-[15px] leading-relaxed text-ink-2">
              {product.description}
            </p>
          )}
          <div className="mt-4">
            <PurchasePanel product={product} personalisationLive={!!settings.personalisationLive} />
          </div>

          <section className="mt-10" aria-label="Details">
            <div className="border-t border-line">
              {product.specs.length > 0 && (
                <Accordion title="Specifications">
                  <dl className="grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-6 gap-y-2.5 text-[14px]">
                    {product.specs.map((s) => (
                      <div key={s.label} className="contents">
                        <dt className="text-ink-2">{s.label}</dt>
                        <dd>{s.value}</dd>
                      </div>
                    ))}
                  </dl>
                </Accordion>
              )}
              {product.allergens && (
                <Accordion title="Allergens">
                  <p>{product.allergens}</p>
                </Accordion>
              )}
              {product.storage && (
                <Accordion title="Storage & care">
                  <p>{product.storage}</p>
                </Accordion>
              )}
              <Accordion title="Delivery & returns">
                <p>
                  {deliveryText} {settings.deliveryNote}
                </p>
                <p className="mt-2">
                  Food and personalised items can’t be returned unless they arrive damaged or incorrect.{" "}
                  <Link href="/delivery" className="underline underline-offset-4">
                    Full delivery & returns policy
                  </Link>
                </p>
              </Accordion>
            </div>
          </section>

        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-24 md:mt-32" aria-labelledby="related-heading">
          <div className="flex items-end justify-between gap-6">
            <h2 id="related-heading" className="display text-[1.9rem] leading-tight md:text-[2.25rem]">
              You may also like
            </h2>
            <Link href={cat.href} className="link-line hidden sm:inline-flex">
              {cat.name}
            </Link>
          </div>
          <div className="mt-8 grid grid-cols-2 gap-3 md:gap-5 lg:grid-cols-4">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} sizes="(min-width: 1024px) 23vw, 50vw" />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Accordion({ title, children, open = false }: { title: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details className="group border-b border-line" open={open}>
      <summary className="flex cursor-pointer list-none items-center justify-between py-4 text-[14px] font-medium tracking-wide [&::-webkit-details-marker]:hidden">
        {title}
        <span className="relative h-3 w-3" aria-hidden="true">
          <span className="absolute left-0 top-1/2 h-px w-3 bg-ink" />
          <span className="absolute left-1/2 top-0 h-3 w-px bg-ink transition-transform group-open:scale-y-0" />
        </span>
      </summary>
      <div className="pb-5 text-[14px] leading-relaxed text-ink-2">{children}</div>
    </details>
  );
}
