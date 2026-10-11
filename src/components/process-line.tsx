import { Box, FileText, MessageCircleMore, PenTool, Receipt, Settings, type LucideIcon } from "lucide-react";

export const BESPOKE_STEPS: { title: string; text: string; icon: LucideIcon }[] = [
  { title: "Brief", text: "We understand your budget, quantity, style and gifting needs.", icon: MessageCircleMore },
  { title: "Concept Proposal", text: "We develop the gifting direction around your brand and occasion.", icon: FileText },
  { title: "Quotation", text: "We finalise the proposed products, quantities and details for your quotation.", icon: Receipt },
  { title: "Design Proposal", text: "We present the full design, from packaging and layout to products and every detail.", icon: PenTool },
  { title: "3D Mockup", text: "Your approved design is brought to life through a detailed 3D mockup.", icon: Box },
  { title: "Production", text: "Once approved, we bring your gifts into full production.", icon: Settings },
];

/**
 * The fully customised process, after the client's mockup (Oct 2026): six steps in one row on
 * desktop — a thin gold line runs through round outlined icons, the step number sits under each
 * icon, then the title in serif capitals and a short line of text, with thin vertical dividers
 * between steps. On phones and tablets the steps stack, the gold line running down through the icons.
 */
export function ProcessLine({ className = "" }: { className?: string }) {
  return (
    <div className={className}>
      <h2 id="process-heading" className="display text-center text-[2rem] leading-tight md:text-[2.5rem]">
        How it works
      </h2>
      <ol className="relative mt-10 grid lg:mt-14 lg:grid-cols-6">
        {/* Gold line: vertical through the icons when stacked, horizontal from the first icon to the last on desktop. */}
        <span className="absolute bottom-10 left-[27px] top-7 w-px bg-champagne/70 lg:hidden" aria-hidden="true" />
        <span className="absolute left-[8.33%] right-[8.33%] top-8 hidden h-px bg-champagne/70 lg:block" aria-hidden="true" />
        {BESPOKE_STEPS.map((s, i) => {
          const Icon = s.icon;
          const number = String(i + 1).padStart(2, "0");
          return (
            <li
              key={s.title}
              className="relative grid grid-cols-[56px_1fr] gap-x-5 pb-8 last:pb-0 lg:flex lg:flex-col lg:items-center lg:px-4 lg:pb-0 lg:text-center xl:px-5"
              data-reveal=""
              style={{ "--reveal-delay": `${i * 90}ms` } as React.CSSProperties}
            >
              {i > 0 && <span className="absolute bottom-0 left-0 top-[104px] hidden w-px bg-line lg:block" aria-hidden="true" />}
              <div className="flex flex-col items-center">
                <span className="relative grid h-14 w-14 place-items-center rounded-full border border-champagne bg-ivory text-bronze lg:h-16 lg:w-16" aria-hidden="true">
                  <Icon className="h-6 w-6 lg:h-7 lg:w-7" strokeWidth={1.1} />
                </span>
                <span className="relative mt-2 bg-ivory px-1 text-[13px] font-medium tracking-[0.18em] text-bronze lg:mt-3">{number}</span>
              </div>
              <div className="pt-2 lg:mt-5 lg:pt-0">
                <h3 className="display text-[1.15rem] uppercase leading-tight tracking-[0.06em] lg:text-[1.05rem] xl:text-[1.15rem]">{s.title}</h3>
                <p className="mt-2 max-w-[40ch] text-[13.5px] leading-relaxed text-ink-2 lg:mx-auto lg:text-[13px]">{s.text}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
