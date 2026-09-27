"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Search, X } from "lucide-react";
import { sizedSrc } from "@/lib/images";

interface Hit {
  slug: string;
  name: string;
  price: string;
  category: string;
  image?: string;
  soldOut: boolean;
}

const SUGGESTIONS = [
  { label: "Chinese New Year", href: "/festive?occasion=chinese-new-year" },
  { label: "Engraved gifts", href: "/search?q=engraved" },
  { label: "Wine & Spirits", href: "/wine-spirits" },
  { label: "Corporate orders", href: "/corporate" },
];

export function SearchOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 60);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal });
        if (res.ok) setHits((await res.json()).hits);
      } catch {
        /* aborted or offline */
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  const showHits = q.trim().length >= 2 ? hits : null;

  return (
    <div className={`fixed inset-0 z-50 ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
      <div className={`absolute inset-0 bg-ink/20 transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0"}`} onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        className={`absolute inset-x-0 top-0 max-h-[90dvh] overflow-y-auto border-b border-line bg-ivory transition-all duration-500 ease-out-soft ${
          open ? "translate-y-0 opacity-100" : "-translate-y-6 opacity-0"
        }`}
      >
        <div className="shell py-5 md:py-8">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (q.trim()) {
                onClose();
                router.push(`/search?q=${encodeURIComponent(q.trim())}`);
              }
            }}
            className="flex items-center gap-3 border-b border-ink pb-3"
            role="search"
          >
            <Search className="h-5 w-5 flex-none text-ink-2" strokeWidth={1.25} />
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              type="search"
              placeholder="Search gifts, hampers, wine…"
              className="display min-w-0 flex-1 bg-transparent text-[1.5rem] outline-none placeholder:text-ink-3 md:text-[2rem]"
              aria-label="Search products"
              enterKeyHint="search"
            />
            <button type="button" onClick={onClose} className="-mr-2 grid h-11 w-11 flex-none place-items-center" aria-label="Close search">
              <X className="h-5 w-5" strokeWidth={1.25} />
            </button>
          </form>

          <div className="pb-4 pt-6">
            {!showHits && (
              <div>
                <p className="label mb-4">Popular</p>
                <ul className="flex flex-wrap gap-2">
                  {SUGGESTIONS.map((s) => (
                    <li key={s.href}>
                      <Link href={s.href} onClick={onClose} className="inline-flex h-9 items-center border border-line px-4 text-[13px] transition-colors hover:border-champagne">
                        {s.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {showHits && (
              <div>
                <div className="mb-4 flex items-center justify-between">
                  <p className="label">{loading ? "Searching…" : `${showHits.length} ${showHits.length === 1 ? "result" : "results"}`}</p>
                  {showHits.length > 0 && (
                    <Link href={`/search?q=${encodeURIComponent(q.trim())}`} onClick={onClose} className="link-line">
                      View all <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.25} />
                    </Link>
                  )}
                </div>
                {showHits.length === 0 && !loading && (
                  <p className="text-ink-2">No gifts match “{q.trim()}”. Try a category, an occasion or a gift type.</p>
                )}
                <ul className="grid grid-cols-1 gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
                  {showHits.slice(0, 6).map((h) => (
                    <li key={h.slug} className="border-b border-line">
                      <Link href={`/products/${h.slug}`} onClick={onClose} className="group flex items-center gap-4 py-3">
                        <span className="relative h-16 w-[52px] flex-none overflow-hidden bg-cream">
                          {h.image && (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img src={sizedSrc(h.image, 120, 1.25)} alt="" className="h-full w-full object-cover" loading="lazy" />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] group-hover:text-bronze">{h.name}</span>
                          <span className="block text-[12px] text-ink-3">
                            {h.category} · {h.soldOut ? "Unavailable" : h.price}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
