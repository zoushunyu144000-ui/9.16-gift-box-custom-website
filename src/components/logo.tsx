import Image from "next/image";
import { BRAND } from "@/lib/brand";

/** All logo usages go through Monogram / Logo; the asset files are configured in src/lib/brand.ts. */
export function Monogram({ className = "", title = BRAND.name }: { className?: string; title?: string }) {
  return (
    <Image
      src={BRAND.monogram.src}
      alt={title}
      width={BRAND.monogram.width}
      height={BRAND.monogram.height}
      className={`block w-auto shrink-0 ${className}`}
      unoptimized
    />
  );
}

export function Logo({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={`inline-flex items-center ${compact ? "gap-1 lg:gap-2" : "gap-3"} ${className}`}>
      <Monogram className={compact ? "h-[18px] lg:h-8" : "h-10"} />
      <Image
        src={BRAND.wordmark.src}
        alt={BRAND.wordmark.alt}
        width={BRAND.wordmark.width}
        height={BRAND.wordmark.height}
        className={`block w-auto shrink-0 ${compact ? "h-[7px] lg:h-[10px]" : "h-[11px]"}`}
        unoptimized
      />
    </span>
  );
}

/** Four-point star from the mark — used sparingly as punctuation. */
export function Star({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="currentColor">
      <path d="M12 0 L14.6 9.4 L24 12 L14.6 14.6 L12 24 L9.4 14.6 L0 12 L9.4 9.4 Z" />
    </svg>
  );
}
