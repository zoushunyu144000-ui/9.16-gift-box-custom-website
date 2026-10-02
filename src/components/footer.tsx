import Link from "next/link";
import { whatsappLink } from "@/lib/catalog";
import type { SiteSettings } from "@/lib/types";
import { Logo } from "./logo";
import { MoireField } from "./moire";

export function Footer({ settings }: { settings: SiteSettings }) {
  const year = new Date().getFullYear();
  return (
    <footer className="relative overflow-hidden border-t border-line bg-cream">
      <MoireField className="pointer-events-none absolute -bottom-[420px] -right-[260px] h-[760px] w-[760px] text-champagne" opacity={0.28} />
      <div className="shell relative grid gap-12 py-14 md:grid-cols-12 md:gap-8 md:py-20">
        <div className="md:col-span-4">
          <Link href="/" aria-label="Moire Co. — home">
            <Logo />
          </Link>
          <p className="mt-5 max-w-[34ch] text-[14px] leading-relaxed text-ink-2">
            Festive gift boxes, everyday gifts, wine gift boxes and corporate gifting from Kuala Lumpur.
          </p>
          <a
            href={whatsappLink(settings.whatsappNumber, "Hello Moire Co., I have a question about a gift.")}
            target="_blank"
            rel="noopener noreferrer"
            className="link-line mt-6"
          >
            Chat on WhatsApp
          </a>
        </div>

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
            ["Semi-customised", "/corporate/semi-curated"],
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
      <div className="relative border-t border-line">
        <div className="shell flex flex-col gap-3 py-6 text-[12px] text-ink-3 md:flex-row md:items-center md:justify-between">
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
    <div className="md:col-span-2 md:col-start-auto [&:nth-child(2)]:md:col-start-7">
      <p className="label mb-4">{title}</p>
      <ul className="space-y-2.5 text-[14px]">
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
