import { ORDER_STATUS } from "@/lib/catalog";
import type { EnquiryStatus, OrderStatus, ProductStatus } from "@/lib/types";

export function PageTitle({ title, children, sub }: { title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div>
        <h1 className="text-[1.6rem] font-normal leading-tight tracking-[-0.01em] md:text-[1.9rem]">{title}</h1>
        {sub && <p className="mt-1 text-[14px] text-ink-2">{sub}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-3">{children}</div>}
    </div>
  );
}

const TONE: Record<string, string> = {
  good: "bg-[#e7efe3] text-success",
  warn: "bg-[#fbf0dc] text-warn",
  bad: "bg-[#f6e3e3] text-danger",
  neutral: "bg-stone text-ink-2",
};

export function Pill({ tone = "neutral", children }: { tone?: keyof typeof TONE; children: React.ReactNode }) {
  return <span className={`inline-flex items-center whitespace-nowrap px-2 py-0.5 text-[11px] font-medium tracking-wide ${TONE[tone]}`}>{children}</span>;
}

export function OrderStatusPill({ status }: { status: OrderStatus }) {
  const s = ORDER_STATUS[status];
  return <Pill tone={s.tone}>{s.label}</Pill>;
}

export const ENQUIRY_STATUS: Record<EnquiryStatus, { label: string; tone: keyof typeof TONE }> = {
  new: { label: "New", tone: "warn" },
  in_progress: { label: "In progress", tone: "neutral" },
  quoted: { label: "Quoted", tone: "neutral" },
  confirmed: { label: "Confirmed", tone: "good" },
  closed: { label: "Closed", tone: "neutral" },
};

export const PRODUCT_STATUS: Record<ProductStatus, { label: string; tone: keyof typeof TONE }> = {
  active: { label: "On sale", tone: "good" },
  sold_out: { label: "Unavailable", tone: "warn" },
  hidden: { label: "Hidden", tone: "neutral" },
};

export function Card({ title, children, className = "", action }: { title?: string; children: React.ReactNode; className?: string; action?: React.ReactNode }) {
  return (
    <section className={`border border-line bg-ivory ${className}`}>
      {title && (
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="text-[12px] font-medium uppercase tracking-[0.14em] text-ink-2">{title}</h2>
          {action}
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="border border-dashed border-line-strong bg-ivory px-6 py-14 text-center text-[14px] text-ink-2">{children}</div>;
}
