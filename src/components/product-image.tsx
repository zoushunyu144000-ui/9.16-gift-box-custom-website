"use client";

import { useState } from "react";
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
}: {
  src?: string;
  alt: string;
  ratio?: number;
  sizes?: string;
  priority?: boolean;
  className?: string;
  imgClassName?: string;
}) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  return (
    <div className={`relative overflow-hidden bg-cream ${className}`} style={ratio ? { aspectRatio: `1 / ${ratio}` } : undefined}>
      {!src || failed ? (
        <div className="absolute inset-0 grid place-items-center bg-cream" aria-label={alt} role="img">
          <Monogram className="h-10 w-auto text-sand" />
        </div>
      ) : (
        /* eslint-disable-next-line @next/next/no-img-element -- placeholder CDN handles resizing; uploads are pre-optimised */
        <img
          src={sizedSrc(src, 960, ratio)}
          srcSet={srcSet(src, WIDTHS, ratio)}
          sizes={sizes}
          alt={alt}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : undefined}
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          ref={(el) => {
            if (el?.complete && el.naturalWidth > 0) setLoaded(true);
          }}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${loaded ? "opacity-100" : "opacity-0"} ${imgClassName}`}
        />
      )}
    </div>
  );
}
