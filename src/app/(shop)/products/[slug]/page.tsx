import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { ProductCard } from "@/components/product-card";
import { Gallery } from "@/components/product/gallery";
import { PurchasePanel } from "@/components/product/purchase-panel";
import { CATEGORIES, formatRM, OCCASIONS, sortProducts, whatsappLink } from "@/lib/catalog";
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
  const [product, all, settings] = await Promise.all([store.getProductBySlug(slug), store.listProducts(), store.getSettings()]);
  if (!product || product.status === "hidden") notFound();

  const cat = CATEGORIES[product.category];
  const related = sortProducts(
    all.filter((p) => p.id !== product.id && p.status === "active" && p.category === product.category),
  )
    .sort((a, b) => Number(b.occasion === product.occasion) - Number(a.occasion === product.occasion))
    .slice(0, 4);

  const hasDetails = product.specs.length > 0 || product.allergens || product.storage;
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
      availability: product.status === "active" ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
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
            ...(product.occasion ? [{ label: OCCASIONS[product.occasion].name, href: `/festive?occasion=${product.occasion}` }] : []),
            { label: product.name },
          ]}
        />
      </div>

      <div className="grid gap-8 lg:mt-8 lg:grid-cols-12 lg:gap-12 xl:gap-16">
        <div className="min-w-0 lg:col-span-7">
          <Gallery images={product.images} name={product.name} soldOut={product.status !== "active"} mobileRatio={product.category === "wine-spirits" ? 1.25 : 1.05} />
        </div>

        <div className="min-w-0 lg:col-span-5">
          <div className="lg:sticky lg:top-28">
            <div className="lg:hidden">
              <Breadcrumbs items={[{ label: cat.name, href: cat.href }, { label: product.name }]} />
            </div>
            <p className="eyebrow mt-5 lg:mt-0">{product.occasion ? OCCASIONS[product.occasion].name : cat.name}</p>
            <h1 className="display mt-3 text-[2.25rem] leading-[1.05] md:text-[2.9rem]">{product.name}</h1>
            <p className="mt-4 text-[15px] leading-relaxed text-ink-2">{product.description}</p>
            <div className="mt-6">
              <PurchasePanel product={product} whatsappNumber={settings.whatsappNumber} />
            </div>

            <ul className="mt-8 space-y-3 border-t border-line pt-6 text-[13px] leading-relaxed text-ink-2">
              <li className="flex gap-3">
                <span className="w-20 flex-none text-ink">Delivery</span>
                <span>
                  {deliveryText} {settings.deliveryNote}
                </span>
              </li>
              <li className="flex gap-3">
                <span className="w-20 flex-none text-ink">Questions</span>
                <a
                  href={whatsappLink(settings.whatsappNumber, `Hello Moire Co., I have a question about "${product.name}".`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline decoration-line-strong underline-offset-4 hover:text-ink"
                >
                  Chat with us on WhatsApp
                </a>
              </li>
              <li className="flex gap-3">
                <span className="w-20 flex-none text-ink">Corporate</span>
                <Link href="/corporate/semi-curated" className="underline decoration-line-strong underline-offset-4 hover:text-ink">
                  Ordering in quantity? Request a quotation
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* What's inside + details */}
      <section className="mt-20 grid gap-12 border-t border-line pt-12 md:mt-28 md:grid-cols-12 md:pt-16" aria-label="Product information">
        {product.contents.length > 0 && (
          <div className="md:col-span-5">
            <h2 className="display text-[1.9rem] leading-tight md:text-[2.25rem]">What’s inside</h2>
            <ul className="mt-6 border-t border-line">
              {product.contents.map((c) => (
                <li key={c} className="flex items-baseline gap-4 border-b border-line py-3.5 text-[15px]">
                  <span className="h-px w-3 flex-none translate-y-[-4px] bg-champagne" aria-hidden="true" />
                  {c}
                </li>
              ))}
            </ul>
            {product.variants.some((v) => v.note) && (
              <p className="mt-4 text-[13px] text-ink-2">
                Upgrades: {product.variants.filter((v) => v.note).map((v) => `${v.name} — ${v.note}`).join("; ")}.
              </p>
            )}
          </div>
        )}
        {hasDetails && (
          <div className={`md:col-span-6 ${product.contents.length ? "md:col-start-7" : ""}`}>
            <h2 className="display text-[1.9rem] leading-tight md:text-[2.25rem]">Details</h2>
            <div className="mt-6 border-t border-line">
              {product.specs.length > 0 && (
                <Accordion title="Specifications" open>
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
          </div>
        )}
      </section>

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
          <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-10 md:gap-x-6 lg:grid-cols-4">
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
