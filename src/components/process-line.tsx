import { Star } from "./logo";

export const BESPOKE_STEPS = [
  { title: "Brief", text: "Style, quantity, date and delivery address" },
  { title: "Proposal", text: "We prepare a proposal for your review" },
  { title: "Confirmation", text: "You review and confirm the proposal" },
  { title: "Production", text: "Your gifts are prepared and packed" },
  { title: "Delivery", text: "Delivered to your chosen addresses" },
];

/**
 * The fully customised process as one continuous champagne line that ends in the
 * star of the mark (Line & Light). The line draws itself when it comes into view.
 */
export function ProcessLine({ className = "", layout = "row" }: { className?: string; layout?: "row" | "column" }) {
  const row = layout === "row";
  return (
    <div className={className}>
      <p className="label mb-7">How fully customised orders work</p>
      <ol className={`relative grid ${row ? "gap-8 md:grid-cols-5 md:gap-6" : "gap-7"}`}>
        {/* the line */}
        <span
          className={`absolute left-[5px] top-2 hidden h-px w-[calc(100%-10px)] bg-champagne ${row ? "md:block" : ""}`}
          data-reveal="line"
          aria-hidden="true"
        />
        <span className={`absolute bottom-3 left-[5px] top-2 w-px bg-champagne/70 ${row ? "md:hidden" : ""}`} aria-hidden="true" />
        {BESPOKE_STEPS.map((s, i) => {
          const last = i === BESPOKE_STEPS.length - 1;
          return (
            <li key={s.title} className={`relative pl-9 ${row ? "md:pl-0 md:pt-9" : ""}`}>
              <span className="absolute left-0 top-[3px] grid h-[11px] w-[11px] place-items-center bg-inherit" aria-hidden="true">
                {last ? (
                  <Star className="h-[15px] w-[15px] text-champagne" />
                ) : (
                  <span className="block h-[6px] w-[6px] rotate-45 border border-champagne bg-ivory" />
                )}
              </span>
              <p className={`display ${row ? "text-[1.3rem]" : "text-[1.25rem]"} leading-tight`}>{s.title}</p>
              <p className="mt-1 text-[14px] leading-relaxed text-ink-2">{s.text}</p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
