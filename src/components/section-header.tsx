import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function SectionHeader({
  eyebrow,
  title,
  intro,
  href,
  linkLabel,
  className = "",
}: {
  eyebrow?: string;
  title: string;
  intro?: string;
  href?: string;
  linkLabel?: string;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-5 md:flex-row md:items-end md:justify-between md:gap-10 ${className}`}>
      <div className="max-w-2xl">
        {eyebrow && <p className="eyebrow mb-4">{eyebrow}</p>}
        <h2 className="display text-[2rem] leading-[1.08] md:text-[2.75rem]">{title}</h2>
        {intro && <p className="mt-4 max-w-[52ch] text-[15px] leading-relaxed text-ink-2">{intro}</p>}
      </div>
      {href && (
        <Link href={href} className="link-line flex-none self-start md:self-auto">
          {linkLabel ?? "View all"} <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.25} />
        </Link>
      )}
    </div>
  );
}
