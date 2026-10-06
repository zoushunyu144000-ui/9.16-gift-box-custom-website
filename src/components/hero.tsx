"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ProductImage as Img } from "@/lib/types";
import { ProductImage } from "./product-image";

/**
 * Homepage opening: one full-height photograph (portrait on phones) that cross-fades
 * through a few gifting scenes with a slow push-in, a short headline and Shop Now.
 * The headline comes from Admin → Settings; " / " starts a new line.
 */
export function Hero({ title, slides, href }: { title: string; slides: Img[]; href: string }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (slides.length < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % slides.length), 6000);
    return () => clearInterval(t);
  }, [slides.length]);

  const lines = title.replaceAll("*", "").split(/\s*\/\s*/);

  return (
    <section className="relative overflow-hidden bg-mount" aria-label="Introduction">
      <div className="relative h-[calc(100svh-4rem)] max-h-[760px] min-h-[520px] lg:h-[calc(100svh-76px)] lg:max-h-[820px]">
        {slides.map((s, i) => (
          <div
            key={s.src}
            className={`hero-slide absolute inset-0 transition-opacity duration-[1400ms] ease-in-out ${i === index ? "opacity-100" : "opacity-0"}`}
            data-active={i === index ? "" : undefined}
            aria-hidden={i !== index}
          >
            <ProductImage
              src={s.src}
              alt={s.alt}
              className="!absolute inset-0 h-full w-full"
              sizes="100vw"
              priority={i === 0}
              imgClassName="grade object-[62%_center] md:object-center"
            />
          </div>
        ))}
        <div className="hero-scrim pointer-events-none absolute inset-0" aria-hidden="true" />

        <div className="absolute inset-x-0 top-[16%] px-6 text-center md:top-[18%]">
          {/* Serif capitals, light and widely spaced, with a thin gold rule between the lines. */}
          <h1 className="display text-[1.65rem] font-medium uppercase leading-[1.25] indent-[0.16em] tracking-[0.16em] text-ink sm:text-[2.15rem] lg:text-[2.8rem] lg:indent-[0.18em] lg:tracking-[0.18em]">
            {lines.map((l, i) => (
              <span key={i} className="block">
                {i > 0 && <span className="mx-auto my-3 block h-px w-10 bg-champagne md:my-4 md:w-14" aria-hidden="true" />}
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
