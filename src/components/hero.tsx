"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ProductImage as Img } from "@/lib/types";
import { ProductImage } from "./product-image";

/**
 * Homepage opening. A direct premium-gifting message beside one clear photograph.
 * Supports several slides (slow cross-fade) so seasonal imagery can rotate later.
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
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % slides.length), 7000);
    return () => clearInterval(t);
  }, [slides.length]);

  const plainTitle = title.replaceAll("*", "");

  return (
    <section className="bg-cream py-4 sm:py-5 lg:py-7" aria-label="Introduction">
      <div className="shell">
        <div className="grid overflow-hidden border border-line bg-ivory lg:min-h-[520px] lg:grid-cols-12">
          <div className="relative aspect-[16/10] overflow-hidden bg-mount lg:order-2 lg:col-span-7 lg:aspect-auto">
            {slides.map((s, i) => (
              <div key={s.src} className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${i === index ? "opacity-100" : "opacity-0"}`} aria-hidden={i !== index}>
                <ProductImage
                  src={s.src}
                  alt={s.alt}
                  className="!absolute inset-0 h-full w-full"
                  sizes="(min-width: 1024px) 58vw, 100vw"
                  priority={i === 0}
                  imgClassName="grade"
                />
              </div>
            ))}
            {slides.length > 1 && (
              <div className="absolute bottom-4 right-4 flex gap-2" role="tablist" aria-label="Hero images">
                {slides.map((s, i) => (
                  <button key={s.src} type="button" role="tab" aria-selected={i === index} aria-label={`Show image ${i + 1}`} onClick={() => setIndex(i)} className="grid h-8 w-8 place-items-center">
                    <span className={`block h-px w-full transition-colors ${i === index ? "bg-ivory" : "bg-ivory/40"}`} />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center px-7 py-9 sm:px-10 sm:py-12 lg:order-1 lg:col-span-5 lg:px-12 xl:px-16">
            <div className="max-w-[30rem]">
              <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-bronze animate-fade-up">{eyebrow}</p>
              <h1 className="display mt-4 text-[2.35rem] leading-[1.04] tracking-[-0.015em] animate-fade-up [animation-delay:100ms] sm:text-[2.8rem] lg:text-[3.4rem] xl:text-[3.8rem]">
                {plainTitle}
              </h1>
              <p className="mt-4 max-w-[36ch] text-[15px] leading-relaxed text-ink-2 animate-fade-up [animation-delay:180ms]">{text}</p>
              <div className="mt-7 animate-fade-up [animation-delay:260ms]">
                <Link href="/festive" className="btn bg-bronze text-ivory hover:bg-champagne hover:text-ink">
                  Explore the collection
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
