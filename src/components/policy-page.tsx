import { Breadcrumbs } from "./breadcrumbs";

export function PolicyPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div className="shell pt-6 md:pt-10">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: title }]} />
      <div className="mx-auto mt-10 max-w-2xl md:mt-16">
        <h1 className="display text-[2.4rem] leading-[1.05] md:text-[3.2rem]">{title}</h1>
        <p className="mt-3 text-[13px] text-ink-3">Last updated {updated}</p>
        <p className="mt-6 border border-dashed border-line-strong bg-cream/60 px-4 py-3 text-[13px] text-ink-2">
          Draft for review — this text is a starting template and must be confirmed by Moire Co. before launch.
        </p>
        <div className="prose-moire mt-10 text-[15px] leading-relaxed text-ink-2 [&_strong]:text-ink">{children}</div>
      </div>
    </div>
  );
}
