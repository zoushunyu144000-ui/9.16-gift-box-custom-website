import type { Product } from "@/lib/types";
import { ProductCard } from "./product-card";

/**
 * Editorial product layout: groups of five — one large photograph with a smaller
 * companion, then a row of three — alternating sides, so a collection reads like
 * a spread rather than a spreadsheet. Every product still shows image, name and price.
 * Mobile: the large piece runs full width, the rest sit two across.
 */
export function EditorialGrid({ products, priorityCount = 2, showOccasion = false }: { products: Product[]; priorityCount?: number; showOccasion?: boolean }) {
  const groups: Product[][] = [];
  for (let i = 0; i < products.length; i += 5) groups.push(products.slice(i, i + 5));

  return (
    <div className="space-y-16 md:space-y-28">
      {groups.map((g, gi) => {
        const flip = gi % 2 === 1;
        const [lead, companion, ...row] = g;
        return (
          <div key={gi} className="space-y-12 md:space-y-24">
            <div className="grid grid-cols-2 gap-x-4 gap-y-12 md:grid-cols-12 md:gap-x-6">
              <div className={`col-span-2 md:col-span-7 ${flip ? "md:order-2 md:col-start-6" : ""}`}>
                <ProductCard
                  product={lead}
                  frame="bare"
                  size="lg"
                  ratio={1.2}
                  priority={gi === 0 && priorityCount > 0}
                  showOccasion={showOccasion}
                  sizes="(min-width: 768px) 56vw, 100vw"
                />
              </div>
              {companion && (
                <div className={`col-span-1 md:col-span-4 md:self-end ${flip ? "md:order-1 md:col-start-1" : "md:col-start-9"}`}>
                  <ProductCard product={companion} priority={gi === 0 && priorityCount > 1} showOccasion={showOccasion} revealDelay={120} sizes="(min-width: 768px) 30vw, 50vw" />
                </div>
              )}
              {/* On mobile, the first item of the row joins the companion to make a pair */}
              {row[0] && (
                <div className="col-span-1 md:hidden">
                  <ProductCard product={row[0]} showOccasion={showOccasion} sizes="50vw" />
                </div>
              )}
            </div>
            {row.length > 0 && (
              <div className="grid grid-cols-2 gap-x-4 gap-y-12 md:grid-cols-3 md:gap-x-6">
                {row.map((p, i) => (
                  <div key={p.id} className={`${i === 0 ? "hidden md:block" : ""} ${i === 1 ? "md:mt-20" : ""}`}>
                    <ProductCard product={p} showOccasion={showOccasion} revealDelay={i * 90} sizes="(min-width: 768px) 30vw, 50vw" />
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
