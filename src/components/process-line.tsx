import { ClipboardCheck, FilePenLine, Gift, MessagesSquare, Truck, type LucideIcon } from "lucide-react";
import { Star } from "./logo";

export const BESPOKE_STEPS: { title: string; text: string; icon: LucideIcon }[] = [
  { title: "Brief", text: "Style, quantity, date and delivery address", icon: FilePenLine },
  { title: "Proposal", text: "We prepare a proposal for your review", icon: MessagesSquare },
  { title: "Confirmation", text: "You review and confirm the proposal", icon: ClipboardCheck },
  { title: "Production", text: "Your gifts are prepared and packed", icon: Gift },
  { title: "Delivery", text: "Delivered to your chosen addresses", icon: Truck },
];

/**
 * The fully customised process, after the client's reference (Oct 2026): a thin gold line with a
 * diamond at each step and a star at the last; each step shows its number, a line icon, the title
 * and one line of text, and steps 1, 3 and 5 sit on a soft champagne card. Read top to bottom on
 * every screen; from md up the heading sits beside the steps, like the form section below it.
 */
export function ProcessLine({ className = "" }: { className?: string }) {
  return (
    <div className={`grid gap-8 md:grid-cols-12 md:gap-8 ${className}`}>
      <h2 id="process-heading" className="display text-[2rem] leading-tight md:col-span-5 md:text-[2.5rem]">
        How fully customised orders work
      </h2>
      <ol className="relative md:col-span-6 md:col-start-7">
        <span className="absolute bottom-10 left-[7px] top-10 w-px bg-champagne/70" aria-hidden="true" />
        {BESPOKE_STEPS.map((s, i) => {
          const last = i === BESPOKE_STEPS.length - 1;
          const Icon = s.icon;
          return (
            <li
              key={s.title}
              className="relative pl-7 [&+&]:mt-2 md:pl-9"
              data-reveal=""
              style={{ "--reveal-delay": `${i * 90}ms` } as React.CSSProperties}
            >
              <span className="absolute left-0 top-1/2 grid h-[15px] w-[15px] -translate-y-1/2 place-items-center bg-ivory text-champagne" aria-hidden="true">
                {last ? <Star className="h-3.5 w-3.5" /> : <span className="h-[7px] w-[7px] rotate-45 border border-champagne" />}
              </span>
              <div className={`flex items-center gap-3.5 rounded-lg px-4 py-5 sm:gap-5 md:px-6 md:py-6 ${i % 2 === 0 ? "bg-paper" : ""}`}>
                <p className="w-10 flex-none text-center md:w-12">
                  <span className="block text-[9px] font-medium uppercase tracking-[0.24em] text-ink-3">Step</span>
                  <span className="display mt-1 block text-[1.75rem] leading-none text-bronze md:text-[2.1rem]">{String(i + 1).padStart(2, "0")}</span>
                </p>
                <span className="h-11 w-px flex-none bg-champagne/50 md:h-14" aria-hidden="true" />
                <Icon className="h-7 w-7 flex-none text-bronze md:h-9 md:w-9" strokeWidth={1.1} aria-hidden="true" />
                <div className="min-w-0">
                  <h3 className="display text-[1.3rem] leading-tight md:text-[1.65rem]">{s.title}</h3>
                  <p className="mt-1 text-[13.5px] leading-snug text-ink-2 md:text-[15px]">{s.text}</p>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
