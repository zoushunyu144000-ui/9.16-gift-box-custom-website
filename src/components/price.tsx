import { formatRM } from "@/lib/catalog";

/** A price, with the earlier price crossed out when it is on sale. */
export function Price({ price, compareAt, decimals }: { price: number; compareAt?: number; decimals?: boolean }) {
  const sale = compareAt != null && compareAt > price;
  return (
    <>
      {sale && (
        <s className="mr-2 text-ink-3 decoration-1">
          <span className="sr-only">Was </span>
          {formatRM(compareAt, { decimals })}
        </s>
      )}
      <span className={sale ? "text-bronze" : undefined}>
        {sale && <span className="sr-only">now </span>}
        {formatRM(price, { decimals })}
      </span>
    </>
  );
}
