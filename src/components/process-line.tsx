import { Star } from "./logo";

export const BESPOKE_STEPS = [
  { title: "Brief", text: "Style, quantity, date and delivery address" },
  { title: "Proposal", text: "We prepare a proposal for your review" },
  { title: "Confirmation", text: "You review and confirm the proposal" },
  { title: "Production", text: "Your gifts are prepared and packed" },
  { title: "Delivery", text: "Delivered to your chosen addresses" },
];

/**
 * The fully customised process as five boxes (client, Oct 2026: boxes instead of a long
 * text list). Every other step is filled with the gold accent so the row reads at a glance.
 */
export function ProcessLine({ className = "", layout = "row" }: { className?: string; layout?: "row" | "column" }) {
  const row = layout === "row";
  return (
    <div className={className}>
      <p className="label mb-6">How fully customised orders work</p>
      <ol className={`grid gap-2.5 ${row ? "sm:grid-cols-2 md:grid-cols-5 md:gap-3" : ""}`}>
        {BESPOKE_STEPS.map((s, i) => {
          const filled = i % 2 === 1;
          const last = i === BESPOKE_STEPS.length - 1;
          return (
            <li
              key={s.title}
              className={`flex flex-col px-5 py-4 md:min-h-[9.5rem] md:px-5 md:py-5 ${filled ? "bg-champagne text-ink" : "border border-line bg-ivory"}`}
            >
              <span className={`flex items-center gap-2 text-[11px] font-medium tabular-nums tracking-[0.16em] ${filled ? "text-ink/70" : "text-bronze"}`}>
                {String(i + 1).padStart(2, "0")}
                {last && <Star className="h-2.5 w-2.5" />}
              </span>
              <p className="display mt-2 text-[1.3rem] leading-tight">{s.title}</p>
              <p className={`mt-1 text-[13px] leading-relaxed ${filled ? "text-ink/80" : "text-ink-2"}`}>{s.text}</p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
