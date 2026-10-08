import Link from "next/link";
import type { SiteSettings } from "@/lib/types";
import { Logo } from "./logo";

export function Footer({ settings }: { settings: SiteSettings }) {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-line bg-cream">
      {/* Kept short and plain on every screen (client, Oct 2026): logo beside three short link columns,
          one line of fine print, no ring pattern behind. */}
      <div className="shell grid gap-6 py-8 md:grid-cols-12 md:items-start md:gap-8 md:py-10">
        <Link href="/" aria-label="Moire Co. — home" className="md:col-span-3">
          <Logo compact />
        </Link>

        <div className="grid grid-cols-3 gap-4 md:col-span-8 md:col-start-5 md:gap-8">
          <FooterCol
            title="Shop"
            links={[
              ["Festive", "/festive"],
              ["Fixed Gifts", "/fixed-gifts"],
              ["Wine Gift Boxes", "/wine-gift-boxes"],
            ]}
          />
          <FooterCol
            title="Corporate"
            links={[
              ["Overview", "/corporate"],
              ["Semi-customised", "/fixed-gifts"],
              ["Fully customised", "/corporate/bespoke"],
            ]}
          />
          <FooterCol
            title="Help"
            links={[
              ["Delivery & returns", "/delivery"],
              ["Terms of sale", "/terms"],
              ["Privacy policy", "/privacy"],
            ]}
          />
        </div>
      </div>
      <div className="border-t border-line">
        <div className="shell flex flex-wrap items-center gap-x-4 gap-y-1 py-4 text-[11px] leading-relaxed text-ink-3 md:gap-x-6">
          <p>© {year} Moire Co.</p>
          <p>FPX · Card · E-wallet</p>
          {settings.contactEmail && <a href={`mailto:${settings.contactEmail}`}>{settings.contactEmail}</a>}
          {settings.businessHours && <p>{settings.businessHours}</p>}
          {settings.showPreviewNotice && <p className="md:ml-auto">Preview build: sample products, test-mode checkout.</p>}
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div className="min-w-0">
      <p className="label mb-2.5 !text-[10px] md:mb-3 md:!text-[11px]">{title}</p>
      <ul className="space-y-1.5 text-[12.5px] leading-snug md:space-y-2 md:text-[13.5px]">
        {links.map(([label, href]) => (
          <li key={href}>
            <Link href={href} className="text-ink-2 transition-colors hover:text-ink">
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
