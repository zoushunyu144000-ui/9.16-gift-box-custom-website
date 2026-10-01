/**
 * Brand assets in one place. The client will supply a new logo: replace the files in
 * /public/brand (or point these paths at the new files and update width/height to the
 * new artwork's pixel size) — every header, footer, menu and admin logo reads from here.
 */
export const BRAND = {
  name: "Moire Co.",
  /** The symbol on its own (admin sidebar, compact uses). */
  monogram: { src: "/brand/moire-monogram.png", width: 1143, height: 594 },
  /** The "MOIRE CO." lettering set beside the monogram. */
  wordmark: { src: "/brand/moire-wordmark.png", width: 736, height: 65, alt: "MOIRE CO." },
} as const;
