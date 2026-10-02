import Image from "next/image";
import { BRAND } from "@/lib/brand";

/** All logo usages go through Monogram / Logo; the asset file is configured in src/lib/brand.ts. */
function BrandImage({ className, alt, sizes }: { className: string; alt: string; sizes: string }) {
  return (
    <Image
      src={BRAND.logo.src}
      alt={alt}
      width={BRAND.logo.width}
      height={BRAND.logo.height}
      sizes={sizes}
      className={`block w-auto shrink-0 ${className}`}
    />
  );
}

/** The client's logo on its own, sized by the caller (admin sidebar, image fallbacks, 404). */
export function Monogram({ className = "", title = BRAND.name }: { className?: string; title?: string }) {
  return <BrandImage className={className} alt={title} sizes="160px" />;
}

export function Logo({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={`inline-flex items-center ${className}`}>
      <BrandImage
        className={compact ? "h-9 lg:h-12" : "h-16"}
        alt={BRAND.logo.alt}
        sizes={compact ? "(min-width: 1024px) 104px, 78px" : "140px"}
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
