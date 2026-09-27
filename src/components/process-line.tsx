import { Star } from "./logo";

export const BESPOKE_STEPS = [
  { title: "Brief", text: "Style, quantity, date and delivery address" },
  { title: "Proposal", text: "We prepare a proposal for your review" },
  { title: "Confirmation", text: "You review and confirm the proposal" },
  { title: "Production", text: "Your gifts are prepared and packed" },
  { title: "Delivery", text: "Delivered to your chosen addresses" },
];

export function ProcessLine({ className = "" }: { className?: string }) {
  return (
    <div className={className}>
      <p className="label mb-6">How fully customised orders work</p>
      <ol className="relative grid gap-8 md:grid-cols-5 md:gap-6">
        <span className="absolute left-[5px] top-2 hidden h-px w-[calc(100%-10px)] bg-champagne/60 md:block" aria-hidden="true" />
        <span className="absolute bottom-2 left-[5px] top-2 w-px bg-champagne/60 md:hidden" aria-hidden="true" />
        {BESPOKE_STEPS.map((s, i) => (
          <li key={s.title} className="relative pl-8 md:pl-0 md:pt-8">
            <span className="absolute left-0 top-[3px] block h-[11px] w-[11px] border border-champagne bg-ivory md:top-[3px]" aria-hidden="true">
              {i === BESPOKE_STEPS.length - 1 && <Star className="absolute -inset-[3px] h-[15px] w-[15px] text-champagne" />}
            </span>
            <p className="text-[12px] tabular-nums text-ink-3">0{i + 1}</p>
            <p className="display mt-1 text-[1.25rem]">{s.title}</p>
            <p className="mt-1 text-[14px] leading-relaxed text-ink-2">{s.text}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
