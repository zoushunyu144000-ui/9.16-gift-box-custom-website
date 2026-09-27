"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ProductImage as Img } from "@/lib/types";
import { ProductImage } from "./product-image";
import { Star } from "./logo";

/**
 * Homepage hero. Supports several slides (cross-fade every 7s) so seasonal imagery can be
 * rotated later without layout changes. With one slide it stays still.
 */
export function Hero({
  eyebrow,
  title,
  text,
  slides,
}: {
  eyebrow: string;
  title: string;
  text: string;
  slides: Img[];
}) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (slides.length < 2) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % slides.length), 7000);
    return () => clearInterval(t);
  }, [slides.length]);

  return (
    <section className="relative overflow-hidden" aria-label="Introduction">
      <div className="shell grid items-stretch gap-8 pb-14 pt-4 md:pb-20 lg:grid-cols-12 lg:gap-0 lg:pb-24 lg:pt-8">
        {/* Image */}
        <div className="relative order-1 lg:order-2 lg:col-span-7 lg:col-start-6">
          <div className="relative aspect-[4/3] w-full overflow-hidden bg-cream lg:aspect-[5/4] xl:aspect-[4/3]">
            {slides.map((s, i) => (
              <div
                key={s.src}
                className={`absolute inset-0 transition-opacity duration-[1600ms] ease-in-out ${i === index ? "opacity-100" : "opacity-0"}`}
                aria-hidden={i !== index}
              >
                <ProductImage
                  src={s.src}
                  alt={s.alt}
                  className="!absolute inset-0 h-full w-full"
                  sizes="(min-width: 1024px) 58vw, 100vw"
                  priority={i === 0}
                  imgClassName={`scale-[1.04] transition-transform duration-[9000ms] ease-out ${i === index ? "!scale-100" : ""}`}
                />
              </div>
            ))}
          </div>
          {slides.length > 1 && (
            <div className="absolute bottom-4 right-4 flex gap-2" role="tablist" aria-label="Hero images">
              {slides.map((s, i) => (
                <button
                  key={s.src}
                  type="button"
                  role="tab"
                  aria-selected={i === index}
                  aria-label={`Show image ${i + 1}`}
                  onClick={() => setIndex(i)}
                  className="grid h-6 w-8 place-items-center"
                >
                  <span className={`block h-px w-full transition-colors ${i === index ? "bg-ink" : "bg-ink/25"}`} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Copy */}
        <div className="relative z-10 order-2 flex flex-col justify-center lg:order-1 lg:col-span-5 lg:pr-12">
          <p className="eyebrow animate-fade-up">{eyebrow}</p>
          <h1 className="display mt-5 text-[2.6rem] leading-[1.02] animate-fade-up [animation-delay:120ms] xs:text-[3rem] md:text-[4rem] lg:text-[4.25rem] xl:text-[5rem]">
            {title}
          </h1>
          <p className="mt-6 max-w-[40ch] text-[15px] leading-relaxed text-ink-2 animate-fade-up [animation-delay:240ms] md:text-base">{text}</p>
          <div className="mt-9 flex flex-col gap-3 animate-fade-up [animation-delay:360ms] xs:flex-row">
            <Link href="/festive" className="btn btn-primary">
              Shop Festive
            </Link>
            <Link href="/corporate" className="btn btn-outline">
              Corporate Orders
            </Link>
          </div>
        </div>
      </div>

      {/* The line & the light: one continuous champagne stroke ending in the star of the mark. */}
      <svg
        className="pointer-events-none absolute bottom-3 left-0 hidden h-24 w-[62%] text-champagne lg:block"
        viewBox="0 0 800 100"
        preserveAspectRatio="none"
        aria-hidden="true"
        fill="none"
      >
        <path
          d="M -10 88 C 180 88 300 40 470 46 C 600 50 690 70 780 40"
          stroke="currentColor"
          strokeWidth="1"
          pathLength={1}
          strokeDasharray="1"
          className="animate-draw"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <Star className="pointer-events-none absolute bottom-[63px] left-[calc(60.45%-6px)] hidden h-3 w-3 text-champagne animate-twinkle lg:block" />
    </section>
  );
}
