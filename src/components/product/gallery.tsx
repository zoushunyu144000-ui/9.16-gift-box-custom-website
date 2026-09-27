"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import type { ProductImage as Img } from "@/lib/types";
import { sizedSrc } from "@/lib/images";
import { ProductImage } from "../product-image";

/**
 * Product gallery.
 * Mobile: swipeable, full-width, with a counter. Desktop: thumbnails + main image, click to zoom.
 * Handles 1–10+ images.
 */
export function Gallery({ images, name, soldOut, mobileRatio = 1.25 }: { images: Img[]; name: string; soldOut?: boolean; mobileRatio?: number }) {
  const [active, setActive] = useState(0);
  const [zoom, setZoom] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const list = images.length ? images : [{ src: "", alt: name }];

  // Sync mobile swipe position -> active index
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onScroll = () => {
      const i = Math.round(el.scrollLeft / el.clientWidth);
      setActive((prev) => (prev === i ? prev : i));
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZoom(false);
      if (e.key === "ArrowRight") setActive((i) => (i + 1) % list.length);
      if (e.key === "ArrowLeft") setActive((i) => (i - 1 + list.length) % list.length);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [zoom, list.length]);

  const go = (i: number) => {
    setActive(i);
    const el = scroller.current;
    if (el && el.offsetParent !== null) el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  };

  return (
    <div>
      {/* Mobile / tablet: swipe */}
      <div className="relative -mx-5 md:-mx-8 lg:hidden">
        <div ref={scroller} className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto" aria-label={`${name} images`}>
          {list.map((img, i) => (
            <div key={img.src + i} className="w-full flex-none snap-center">
              <ProductImage src={img.src} alt={img.alt} ratio={mobileRatio} sizes="100vw" priority={i === 0} imgClassName={soldOut ? "grade-muted" : "grade"} />
            </div>
          ))}
        </div>
        {list.length > 1 && (
          <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center gap-1.5">
            {list.map((_, i) => (
              <span key={i} className={`h-[3px] w-6 transition-colors ${i === active ? "bg-ink" : "bg-ink/20"}`} />
            ))}
          </div>
        )}
        {list.length > 1 && (
          <span className="absolute right-4 top-4 bg-ivory/90 px-2 py-0.5 text-[11px] tabular-nums tracking-wide">
            {active + 1} / {list.length}
          </span>
        )}
      </div>

      {/* Desktop */}
      <div className="hidden gap-4 lg:flex">
        {list.length > 1 && (
          <ul className="no-scrollbar flex max-h-[calc(100vh-9rem)] w-[76px] flex-none flex-col gap-3 overflow-y-auto" aria-label="Choose image">
            {list.map((img, i) => (
              <li key={img.src + i}>
                <button
                  type="button"
                  onClick={() => setActive(i)}
                  className={`block w-full border transition-colors ${i === active ? "border-ink" : "border-transparent hover:border-line-strong"}`}
                  aria-label={`Show image ${i + 1}`}
                  aria-current={i === active}
                >
                  <ProductImage src={img.src} alt="" ratio={1.25} sizes="80px" imgClassName="grade" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="group relative min-w-0 flex-1">
          <button type="button" onClick={() => setZoom(true)} className="block w-full cursor-zoom-in" aria-label="Enlarge image">
            <ProductImage
              key={list[active].src}
              src={list[active].src}
              alt={list[active].alt}
              ratio={1.25}
              sizes="(min-width: 1280px) 48vw, 55vw"
              priority
              imgClassName={soldOut ? "grade-muted" : "grade"}
            />
          </button>
          {list.length > 1 && (
            <div className="absolute inset-x-4 top-1/2 flex -translate-y-1/2 justify-between opacity-0 transition-opacity group-hover:opacity-100">
              <button type="button" onClick={() => setActive((active - 1 + list.length) % list.length)} className="grid h-10 w-10 place-items-center bg-ivory/90" aria-label="Previous image">
                <ChevronLeft className="h-4 w-4" strokeWidth={1.25} />
              </button>
              <button type="button" onClick={() => setActive((active + 1) % list.length)} className="grid h-10 w-10 place-items-center bg-ivory/90" aria-label="Next image">
                <ChevronRight className="h-4 w-4" strokeWidth={1.25} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Mobile thumbnails for quick jump when many images */}
      {list.length > 3 && (
        <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto lg:hidden">
          {list.map((img, i) => (
            <button key={img.src + i} type="button" onClick={() => go(i)} className={`w-14 flex-none border ${i === active ? "border-ink" : "border-transparent"}`} aria-label={`Show image ${i + 1}`}>
              <ProductImage src={img.src} alt="" ratio={1.25} sizes="60px" imgClassName="grade" />
            </button>
          ))}
        </div>
      )}

      {/* Zoom overlay */}
      {zoom && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-ivory" role="dialog" aria-modal="true" aria-label="Image viewer">
          <button type="button" onClick={() => setZoom(false)} className="absolute right-4 top-4 z-10 grid h-11 w-11 place-items-center" aria-label="Close">
            <X className="h-5 w-5" strokeWidth={1.25} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={sizedSrc(list[active].src, 2000)} alt={list[active].alt} className="max-h-[92vh] max-w-[92vw] object-contain" />
          {list.length > 1 && (
            <>
              <button type="button" onClick={() => setActive((active - 1 + list.length) % list.length)} className="absolute left-4 top-1/2 grid h-12 w-12 -translate-y-1/2 place-items-center border border-line-strong bg-ivory" aria-label="Previous image">
                <ChevronLeft className="h-5 w-5" strokeWidth={1.25} />
              </button>
              <button type="button" onClick={() => setActive((active + 1) % list.length)} className="absolute right-4 top-1/2 grid h-12 w-12 -translate-y-1/2 place-items-center border border-line-strong bg-ivory" aria-label="Next image">
                <ChevronRight className="h-5 w-5" strokeWidth={1.25} />
              </button>
              <p className="absolute bottom-5 left-1/2 -translate-x-1/2 text-[12px] tabular-nums text-ink-2">
                {active + 1} / {list.length}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
