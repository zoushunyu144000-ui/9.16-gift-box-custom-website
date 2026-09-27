"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ProductImage as Img } from "@/lib/types";
import { ProductImage } from "./product-image";

/** Homepage opening: one integrated gifting scene, one message and one action. */
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
    <section className="overflow-hidden bg-ivory" aria-label="Introduction">
      <div className="relative">
        <div className="relative aspect-[16/10] overflow-hidden bg-mount sm:aspect-[16/9] lg:absolute lg:inset-0 lg:aspect-auto">
            {slides.map((s, i) => (
              <div key={s.src} className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${i === index ? "opacity-100" : "opacity-0"}`} aria-hidden={i !== index}>
                <ProductImage
                  src={s.src}
                  alt={s.alt}
                  className="!absolute inset-0 h-full w-full"
                  sizes="100vw"
                  priority={i === 0}
                  imgClassName="grade object-[55%_center] lg:object-center"
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
        <div className="hero-scrim pointer-events-none absolute inset-0 hidden lg:block" aria-hidden="true" />

        <div className="shell relative flex items-center py-9 sm:py-11 lg:min-h-[570px] lg:py-16 xl:min-h-[610px]">
          <div className="max-w-[31rem]">
              <p className="text-[11px] font-medium uppercase tracking-[0.17em] text-bronze">{eyebrow}</p>
              <h1 className="display mt-4 text-[2.3rem] leading-[1.08] sm:text-[2.65rem] lg:text-[3.25rem] xl:text-[3.55rem]">
                {plainTitle}
              </h1>
              <p className="mt-4 max-w-[36ch] text-[15px] leading-[1.65] text-ink-2">{text}</p>
              <div className="mt-7">
                <Link href="/festive" className="home-cta bg-bronze text-ivory hover:bg-champagne hover:text-ink">
                  Explore the collection
                </Link>
              </div>
          </div>
        </div>
      </div>
    </section>
  );
}
