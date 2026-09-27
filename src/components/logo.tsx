import Image from "next/image";

export function Monogram({ className = "", title = "Moire Co." }: { className?: string; title?: string }) {
  return (
    <Image
      src="/brand/moire-monogram.png"
      alt={title}
      width={1143}
      height={594}
      className={`block w-auto shrink-0 ${className}`}
      unoptimized
    />
  );
}

export function Logo({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={`inline-flex items-center ${compact ? "gap-2" : "gap-3"} ${className}`}>
      <Monogram className={compact ? "h-8" : "h-10"} />
      <Image
        src="/brand/moire-wordmark.png"
        alt="MOIRE CO."
        width={736}
        height={65}
        className={`block w-auto shrink-0 ${compact ? "h-[10px]" : "h-[11px]"}`}
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
