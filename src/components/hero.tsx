"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import type { ProductImage as Img } from "@/lib/types";
import { ProductImage } from "./product-image";
import { Emph } from "./moire";
import { MoireField } from "./moire";

/**
 * Homepage opening. Type on the paper, photograph bled to the right edge.
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

  return (
    <section className="relative overflow-hidden lg:min-h-[min(calc(100svh-76px),880px)]" aria-label="Introduction">
      {/* Photograph */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-cream sm:aspect-[5/4] lg:absolute lg:inset-y-0 lg:left-[44%] lg:right-0 lg:aspect-auto">
        {slides.map((s, i) => (
          <div key={s.src} className={`absolute inset-0 transition-opacity duration-[1600ms] ease-in-out ${i === index ? "opacity-100" : "opacity-0"}`} aria-hidden={i !== index}>
            <ProductImage
              src={s.src}
              alt={s.alt}
              className="!absolute inset-0 h-full w-full"
              sizes="(min-width: 1024px) 56vw, 100vw"
              priority={i === 0}
              imgClassName={`grade scale-[1.06] transition-transform duration-[12000ms] ease-out ${i === index ? "!scale-100" : ""}`}
            />
          </div>
        ))}
        {slides.length > 1 && (
          <div className="absolute bottom-5 right-5 flex gap-2" role="tablist" aria-label="Hero images">
            {slides.map((s, i) => (
              <button key={s.src} type="button" role="tab" aria-selected={i === index} aria-label={`Show image ${i + 1}`} onClick={() => setIndex(i)} className="grid h-6 w-8 place-items-center">
                <span className={`block h-px w-full transition-colors ${i === index ? "bg-ivory" : "bg-ivory/40"}`} />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Type */}
      <div className="shell relative lg:flex lg:min-h-[min(calc(100svh-76px),880px)] lg:items-center">
        <MoireField className="pointer-events-none absolute -bottom-[38%] -left-[18%] hidden h-[620px] w-[620px] text-champagne lg:block" opacity={0.28} />
        <div className="relative pb-12 pt-7 md:pb-20 md:pt-12 lg:w-[40%] lg:py-24">
          <p className="flex items-center gap-4 text-[11px] font-medium uppercase tracking-[0.24em] text-bronze animate-fade-up">
            <span className="h-px w-10 bg-champagne" aria-hidden="true" />
            {eyebrow}
          </p>
          <h1 className="display mt-4 text-[2.9rem] leading-[0.98] tracking-[-0.02em] animate-fade-up [animation-delay:120ms] xs:text-[3.3rem] md:mt-6 md:text-[4.4rem] lg:text-[4.6rem] xl:text-[5.6rem]">
            <Emph text={title} />
          </h1>
          <p className="mt-5 max-w-[34ch] text-[15px] leading-relaxed text-ink-2 animate-fade-up [animation-delay:240ms] md:mt-7 md:text-[16px]">{text}</p>
          <div className="mt-7 flex flex-wrap items-center gap-x-8 gap-y-5 animate-fade-up [animation-delay:360ms] md:mt-10">
            <Link href="/festive" className="btn btn-primary">
              Shop the collection
            </Link>
            <Link href="/corporate" className="link-line">
              Corporate orders <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.25} />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
