"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, Search, X } from "lucide-react";
import { Logo } from "./logo";
import { useCart } from "./cart/cart-context";
import { SearchOverlay } from "./search-overlay";

export const NAV = [
  { href: "/festive", label: "Festive" },
  { href: "/fixed-gifts", label: "Fixed Gift Collection" },
  { href: "/wine-spirits", label: "Wine & Spirits" },
  { href: "/corporate", label: "Corporate Orders" },
];

export function Header() {
  const pathname = usePathname();
  const { count, ready, openDrawer } = useCart();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [lastPath, setLastPath] = useState(pathname);

  // Close overlays on navigation (adjusting state during render, per React guidance)
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setMenuOpen(false);
    setSearchOpen(false);
  }

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      <header
        className={`sticky top-0 z-40 border-b transition-colors duration-300 ${
          scrolled ? "border-line bg-ivory/95 backdrop-blur-md" : "border-transparent bg-ivory"
        }`}
      >
        <div className="shell grid h-16 grid-cols-[1fr_auto_1fr] items-center lg:h-[76px] lg:grid-cols-[auto_1fr_auto] lg:gap-10">
          {/* Mobile: menu */}
          <div className="flex items-center lg:hidden">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="-ml-2 grid h-11 w-11 place-items-center"
              aria-label="Open menu"
              aria-expanded={menuOpen}
            >
              <Menu className="h-5 w-5" strokeWidth={1.25} />
            </button>
          </div>

          <Link href="/" className="justify-self-center lg:justify-self-start" aria-label="Moire Co. — home">
            <Logo compact />
          </Link>

          <nav className="hidden items-center justify-center gap-9 lg:flex xl:gap-12" aria-label="Main">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`relative py-2 text-[12px] font-medium uppercase tracking-[0.16em] transition-colors hover:text-bronze ${
                  isActive(item.href) ? "text-ink" : "text-ink-2"
                }`}
              >
                {item.label}
                <span
                  className={`absolute -bottom-px left-0 h-px bg-champagne transition-all duration-500 ${isActive(item.href) ? "w-full" : "w-0"}`}
                />
              </Link>
            ))}
          </nav>

          <div className="flex items-center justify-end gap-1 md:gap-2">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="grid h-11 w-11 place-items-center transition-colors hover:text-bronze"
              aria-label="Search"
            >
              <Search className="h-[19px] w-[19px]" strokeWidth={1.25} />
            </button>
            <button
              type="button"
              onClick={openDrawer}
              className="-mr-2 flex h-11 items-center gap-2 px-2 transition-colors hover:text-bronze"
              aria-label={`Shopping bag, ${ready ? count : 0} items`}
            >
              <BagIcon />
              <span className="min-w-[1ch] text-[13px] tabular-nums">{ready ? count : 0}</span>
            </button>
          </div>
        </div>
      </header>

      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} isActive={isActive} />
      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}

function BagIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[19px] w-[19px]" fill="none" stroke="currentColor" strokeWidth="1.25" aria-hidden="true">
      <path d="M4.5 8.5h15l-1 12.5h-13z" />
      <path d="M8.5 8.5V7a3.5 3.5 0 0 1 7 0v1.5" />
    </svg>
  );
}

function MobileMenu({ open, onClose, isActive }: { open: boolean; onClose: () => void; isActive: (h: string) => boolean }) {
  return (
    <div className={`fixed inset-0 z-50 lg:hidden ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
      <div
        className={`absolute inset-0 bg-ink/20 transition-opacity duration-500 ${open ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        className={`absolute inset-y-0 left-0 flex w-full max-w-[420px] flex-col border-r border-line bg-ivory transition-transform duration-500 ease-out-soft ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-16 items-center justify-between px-5">
          <Logo compact />
          <button type="button" onClick={onClose} className="-mr-2 grid h-11 w-11 place-items-center" aria-label="Close menu">
            <X className="h-5 w-5" strokeWidth={1.25} />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-5 pb-10 pt-6" aria-label="Mobile">
          <ul className="border-t border-line">
            {NAV.map((item, i) => (
              <li key={item.href} className="border-b border-line">
                <Link
                  href={item.href}
                  className="flex items-center justify-between py-5"
                  style={{ transitionDelay: open ? `${80 + i * 40}ms` : "0ms" }}
                >
                  <span className={`display text-[1.65rem] leading-none ${isActive(item.href) ? "text-bronze" : ""}`}>{item.label}</span>
                  <span className="text-ink-3">→</span>
                </Link>
              </li>
            ))}
          </ul>
          <ul className="mt-8 space-y-4 text-[14px] text-ink-2">
            <li>
              <Link href="/corporate/semi-curated">Semi-curated corporate orders</Link>
            </li>
            <li>
              <Link href="/corporate/bespoke">Fully customised gifts</Link>
            </li>
            <li>
              <Link href="/delivery">Delivery & returns</Link>
            </li>
            <li>
              <Link href="/cart">Shopping bag</Link>
            </li>
          </ul>
        </nav>
      </div>
    </div>
  );
}
