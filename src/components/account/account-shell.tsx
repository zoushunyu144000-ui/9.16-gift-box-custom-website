import { notFound } from "next/navigation";
import { isVendureConfigured } from "@/lib/store";

/** Narrow page for the sign-in, registration and password pages. Accounts exist only with the commerce backend. */
export function AccountShell({ title, intro, children }: { title: string; intro?: React.ReactNode; children: React.ReactNode }) {
  if (!isVendureConfigured) notFound();
  return (
    <div className="shell max-w-[480px] pt-12 md:pt-20">
      <p className="eyebrow">My account</p>
      <h1 className="display mt-4 text-[2.4rem] leading-[1.05] md:text-[2.9rem]">{title}</h1>
      {intro && <div className="mt-3 text-[15px] leading-relaxed text-ink-2">{intro}</div>}
      {children}
    </div>
  );
}
