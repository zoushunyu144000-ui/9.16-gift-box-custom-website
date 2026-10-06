import { Star } from "./logo";

export const BESPOKE_STEPS = [
  { title: "Brief", text: "Style, quantity, date and delivery address" },
  { title: "Proposal", text: "We prepare a proposal for your review" },
  { title: "Confirmation", text: "You review and confirm the proposal" },
  { title: "Production", text: "Your gifts are prepared and packed" },
  { title: "Delivery", text: "Delivered to your chosen addresses" },
];

/**
 * The fully customised process as a timeline (client, Oct 2026): a thin gold line with a
 * diamond at each step and a star at the last, every other step set in a gold box.
 * Phones read it top to bottom; from md up it runs left to right.
 */
export function ProcessLine({ className = "" }: { className?: string }) {
  return (
    <div className={className}>
      <p className="label mb-6">How fully customised orders work</p>
      <ol className="relative grid max-w-xl md:max-w-none md:grid-cols-5 md:gap-3">
        <span className="absolute bottom-3 left-[7px] top-3 w-px bg-champagne md:hidden" aria-hidden="true" />
        <span className="absolute left-0 right-0 top-[7px] hidden h-px bg-champagne md:block" aria-hidden="true" />
        {BESPOKE_STEPS.map((s, i) => {
          const filled = i % 2 === 1;
          const last = i === BESPOKE_STEPS.length - 1;
          return (
            <li key={s.title} className="relative py-1.5 pl-8 md:py-0 md:pl-0 md:pt-8">
              <span
                className="absolute left-0 top-1/2 flex h-[15px] w-[15px] -translate-y-1/2 items-center justify-center bg-ivory text-champagne md:left-3 md:top-0 md:translate-y-0"
                aria-hidden="true"
              >
                {last ? <Star className="h-3 w-3" /> : <span className="h-[7px] w-[7px] rotate-45 border border-champagne" />}
              </span>
              <div className={`px-3 py-3 md:h-full md:px-4 md:py-4 ${filled ? "rounded-md bg-champagne text-ivory" : ""}`}>
                <p className="display text-[1.35rem] leading-tight">{s.title}</p>
                <p className={`mt-1 text-[14px] leading-relaxed ${filled ? "text-ivory/90" : "text-ink-2"}`}>{s.text}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
