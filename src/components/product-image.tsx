"use client";

import { useEffect, useRef, useState } from "react";
import { sizedSrc, srcSet } from "@/lib/images";
import { Monogram } from "./logo";

const WIDTHS = [360, 540, 720, 960, 1280, 1600];

/**
 * Responsive image with a quiet fallback when an image fails to load.
 * `ratio` is height / width (4:5 → 1.25). Unsplash placeholders are cropped server-side;
 * uploaded images are cropped with object-fit.
 */
export function ProductImage({
  src,
  alt,
  ratio,
  sizes = "(min-width: 1024px) 25vw, 50vw",
  priority = false,
  className = "",
  imgClassName = "",
  contain = false,
}: {
  src?: string;
  alt: string;
  ratio?: number;
  sizes?: string;
  priority?: boolean;
  className?: string;
  imgClassName?: string;
  /** Show the whole photograph inside the frame instead of cropping it to fill; the frame itself has no background. */
  contain?: boolean;
}) {
  const crop = contain ? undefined : ratio;
  // 0: a resized copy from the image server; 1: the original file, when a resized copy can't be made
  // (e.g. the server's disk is full); 2: nothing loaded, show the monogram.
  const [attempt, setAttempt] = useState(0);
  const failed = attempt === 2;
  const img = useRef<HTMLImageElement>(null);
  // Moves on once per failed attempt, however many times that failure is reported.
  const fail = (from: number) => setAttempt((a) => (a === from ? a + 1 : a));

  // An image that failed before the page became interactive fired its error event too early to be seen.
  useEffect(() => {
    const el = img.current;
    if (el && el.complete && el.naturalWidth === 0) fail(attempt);
  }, [attempt]);

  return (
    <div className={`relative overflow-hidden ${contain ? "" : "bg-cream"} ${className}`} style={ratio ? { aspectRatio: `1 / ${ratio}` } : undefined}>
      {!src || failed ? (
        <div className="absolute inset-0 grid place-items-center bg-cream" aria-label={alt} role="img">
          <Monogram className="h-10 w-auto text-champagne" />
        </div>
      ) : (
        /* eslint-disable-next-line @next/next/no-img-element -- placeholder CDN handles resizing; uploads are pre-optimised */
        <img
          ref={img}
          src={attempt === 0 ? sizedSrc(src, 960, crop) : src}
          srcSet={attempt === 0 ? srcSet(src, WIDTHS, crop) : undefined}
          sizes={sizes}
          alt={alt}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : undefined}
          decoding="async"
          onError={() => fail(attempt)}
          className={`absolute inset-0 h-full w-full ${contain ? "object-contain" : "object-cover"} ${imgClassName}`}
        />
      )}
    </div>
  );
}
