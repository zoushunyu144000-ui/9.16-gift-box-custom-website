"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ProductImage as Img } from "@/lib/types";
import { ProductImage } from "./product-image";

/**
 * Homepage opening: photographs that cross-fade through a few gifting scenes.
 * Phones: a landscape photograph with the season, headline, a line of text and Explore the
 * collection below it (client, Oct 2026). Tablets and desktops: one full-height photograph with
 * a slow push-in, the headline and Shop Now laid over it.
 * The texts come from the back office; " / " in the headline starts a new line.
 */
export function Hero({ eyebrow, title, text, slides, href }: { eyebrow: string; title: string; text: string; slides: Img[]; href: string }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (slides.length < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % slides.length), 6000);
    return () => clearInterval(t);
  }, [slides.length]);

  const lines = title.replaceAll("*", "").split(/\s*\/\s*/);

  const dots = (className: string, line: (active: boolean) => string) =>
    slides.length > 1 && (
      <div className={className} role="tablist" aria-label="Hero images">
        {slides.map((s, i) => (
          <button key={s.src} type="button" role="tab" aria-selected={i === index} aria-label={`Show image ${i + 1}`} onClick={() => setIndex(i)} className="grid h-8 w-7 place-items-center">
            <span className={`block h-px w-full transition-colors ${line(i === index)}`} />
          </button>
        ))}
      </div>
    );

  return (
    <section className="relative overflow-hidden bg-ivory md:bg-mount" aria-label="Introduction">
      <div className="relative md:h-[calc(100svh-4rem)] md:max-h-[760px] md:min-h-[520px] lg:h-[calc(100svh-76px)] lg:max-h-[820px]">
        <div className="relative aspect-[16/10] overflow-hidden bg-mount md:absolute md:inset-0 md:aspect-auto">
          {slides.map((s, i) => (
            <div
              key={s.src}
              className={`hero-slide absolute inset-0 transition-opacity duration-[1400ms] ease-in-out ${i === index ? "opacity-100" : "opacity-0"}`}
              data-active={i === index ? "" : undefined}
              aria-hidden={i !== index}
            >
              <ProductImage src={s.src} alt={s.alt} className="!absolute inset-0 h-full w-full" sizes="100vw" priority={i === 0} imgClassName="object-center" />
            </div>
          ))}
          {dots("absolute bottom-2 right-3 flex gap-1 md:hidden", (active) => (active ? "bg-ivory" : "bg-ivory/45"))}
        </div>

        {/* Phones: the words sit under the photograph. */}
        <div className="shell py-9 md:hidden">
          <p className="text-[11px] font-medium uppercase tracking-[0.17em] text-bronze">{eyebrow}</p>
          <h1 className="display mt-4 text-[2.3rem] leading-[1.08]">
            {lines.map((l, i) => (
              <span key={i} className="block">
                {l}
              </span>
            ))}
          </h1>
          <p className="mt-4 max-w-[36ch] text-[15px] leading-[1.65] text-ink-2">{text}</p>
          <div className="mt-7">
            <Link href={href} className="home-cta bg-bronze text-ivory hover:bg-champagne hover:text-ink">
              Explore the collection
            </Link>
          </div>
        </div>

        {/* Tablets and desktops: serif capitals, light and widely spaced, with a thin gold rule between the lines. */}
        <div className="absolute inset-x-0 top-[18%] hidden px-6 text-center md:block">
          <h1 className="display text-[2.15rem] font-medium uppercase leading-[1.25] indent-[0.16em] tracking-[0.16em] text-ink lg:text-[2.8rem] lg:indent-[0.18em] lg:tracking-[0.18em]">
            {lines.map((l, i) => (
              <span key={i} className="block">
                {i > 0 && <span className="mx-auto my-4 block h-px w-14 bg-champagne" aria-hidden="true" />}
                {l}
              </span>
            ))}
          </h1>
        </div>

        <div className="absolute inset-x-0 bottom-[12%] hidden justify-center px-6 md:flex">
          <Link href={href} className="home-cta min-w-[11rem] bg-ivory text-ink shadow-[0_1px_0_rgb(31_28_24/0.06)] hover:bg-champagne hover:text-ink">
            SHOP NOW
          </Link>
        </div>

        {dots("absolute bottom-4 left-1/2 hidden -translate-x-1/2 gap-1 md:flex", (active) => (active ? "bg-ink/70" : "bg-ink/25"))}
      </div>
    </section>
  );
}
