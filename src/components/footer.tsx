import Link from "next/link";
import type { SiteSettings } from "@/lib/types";
import { Logo } from "./logo";
import { MoireField } from "./moire";

export function Footer({ settings }: { settings: SiteSettings }) {
  const year = new Date().getFullYear();
  return (
    <footer className="relative overflow-hidden border-t border-line bg-cream">
      <MoireField className="pointer-events-none absolute -bottom-[420px] -right-[260px] h-[760px] w-[760px] text-champagne" opacity={0.28} />
      {/* Compact on phones: logo, then the three link columns side by side (client, Oct 2026). */}
      <div className="shell relative grid gap-8 py-10 md:grid-cols-12 md:gap-8 md:py-16">
        <div className="md:col-span-4">
          <Link href="/" aria-label="Moire Co. — home">
            <Logo />
          </Link>
          <p className="mt-4 max-w-[34ch] text-[13px] leading-relaxed text-ink-2 md:mt-5 md:text-[14px]">
            Festive gift boxes, everyday gifts, wine gift boxes and corporate gifting from Kuala Lumpur.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4 md:col-span-7 md:col-start-6 md:gap-8">
          <FooterCol
            title="Shop"
            links={[
              ["Festive Collection", "/festive"],
              ["Fixed Gift Collection", "/fixed-gifts"],
              ["Wine Gift Boxes", "/wine-gift-boxes"],
              ["Search", "/search"],
            ]}
          />
          <FooterCol
            title="Corporate Orders"
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
              ["Your bag", "/cart"],
            ]}
          />
        </div>
      </div>
      <div className="relative border-t border-line">
        <div className="shell flex flex-col gap-2 py-5 text-[12px] text-ink-3 md:flex-row md:items-center md:justify-between md:py-6">
          <p>© {year} Moire Co. All rights reserved.</p>
          <p className="flex flex-wrap gap-x-4 gap-y-1">
            <span>Secure payment: FPX · Card · E-wallet</span>
            {settings.contactEmail && <a href={`mailto:${settings.contactEmail}`}>{settings.contactEmail}</a>}
            {settings.businessHours && <span>{settings.businessHours}</span>}
          </p>
        </div>
        {settings.showPreviewNotice && (
          <p className="shell pb-6 text-[11px] leading-relaxed text-ink-3">
            Preview build — products, prices and photography are samples, and checkout runs in test mode. No real payments are taken.
          </p>
        )}
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div className="min-w-0">
      <p className="label mb-3 !text-[10px] md:mb-4 md:!text-[11px]">{title}</p>
      <ul className="space-y-2 text-[12.5px] leading-snug md:space-y-2.5 md:text-[14px]">
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
