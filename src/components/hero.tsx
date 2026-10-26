"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ProductImage as Img } from "@/lib/types";
import { ProductImage } from "./product-image";

/**
 * Homepage opening.
 * Phones (client, Oct 2026): one photograph (the back office's, else the site's ivory gift box) with
 * Explore the collection on it and no words; the headline is there for screen readers only.
 * Tablets and desktops: the slideshow of full-height photographs with a slow push-in, the headline and
 * Shop Now laid over it.
 * " / " in a headline starts a new line; "*" is ignored.
 */
export function Hero({
  title,
  slides,
  href,
  mobile,
}: {
  title: string;
  slides: Img[];
  href: string;
  mobile: { image: Img; title: string };
}) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (slides.length < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % slides.length), 6000);
    return () => clearInterval(t);
  }, [slides.length]);

  const linesOf = (text: string) => text.replaceAll("*", "").split(/\s*\/\s*/);

  return (
    <section className="relative overflow-hidden bg-ivory md:bg-mount" aria-label="Introduction">
      {/* Phones: one photograph with Explore the collection on it, no words (client, Oct 2026). */}
      <div className="relative md:hidden">
        <h1 className="sr-only">{linesOf(mobile.title).join(" ")}</h1>
        <ProductImage src={mobile.image.src} alt={mobile.image.alt} ratio={1} sizes="100vw" priority imgClassName="object-center" />
        <div className="absolute bottom-[7%] left-0 px-[max(1.25rem,env(safe-area-inset-left))]">
          <Link href={href} className="home-cta bg-bronze text-ivory hover:bg-champagne hover:text-ink">
            Explore the collection
          </Link>
        </div>
      </div>

      {/* Tablets and desktops: serif capitals, light and widely spaced, with a thin gold rule between the lines. */}
      <div className="relative hidden md:block md:h-[calc(100svh-4rem)] md:max-h-[760px] md:min-h-[520px] lg:h-[calc(100svh-76px)] lg:max-h-[820px]">
        {slides.map((s, i) => (
          <div
            key={s.src}
            className={`hero-slide absolute inset-0 overflow-hidden transition-opacity duration-[1400ms] ease-in-out ${i === index ? "opacity-100" : "opacity-0"}`}
            data-active={i === index ? "" : undefined}
            aria-hidden={i !== index}
          >
            <ProductImage src={s.src} alt={s.alt} className="!absolute inset-0 h-full w-full" sizes="100vw" priority={i === 0} imgClassName="object-center" />
          </div>
        ))}

        <div className="absolute inset-x-0 top-[18%] px-6 text-center">
          <h1 className="display text-[2.15rem] font-medium uppercase leading-[1.25] indent-[0.16em] tracking-[0.16em] text-ink lg:text-[2.8rem] lg:indent-[0.18em] lg:tracking-[0.18em]">
            {linesOf(title).map((l, i) => (
              <span key={i} className="block">
                {i > 0 && <span className="mx-auto my-4 block h-px w-14 bg-champagne" aria-hidden="true" />}
                {l}
              </span>
            ))}
          </h1>
        </div>

        <div className="absolute inset-x-0 bottom-[12%] flex justify-center px-6">
          <Link href={href} className="home-cta min-w-[11rem] bg-ivory text-ink shadow-[0_1px_0_rgb(31_28_24/0.06)] hover:bg-champagne hover:text-ink">
            SHOP NOW
          </Link>
        </div>

        {slides.length > 1 && (
          <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-1" role="tablist" aria-label="Hero images">
            {slides.map((s, i) => (
              <button key={s.src} type="button" role="tab" aria-selected={i === index} aria-label={`Show image ${i + 1}`} onClick={() => setIndex(i)} className="grid h-8 w-7 place-items-center">
                <span className={`block h-px w-full transition-colors ${i === index ? "bg-ink/70" : "bg-ink/25"}`} />
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
