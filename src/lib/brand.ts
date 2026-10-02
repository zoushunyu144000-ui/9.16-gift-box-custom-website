/**
 * Brand assets in one place. The logo is the client's finished artwork (transparent PNG,
 * trimmed). To swap it, replace /public/brand/moire-logo.png and update width/height to the
 * new file's pixel size — every header, footer, menu, admin and fallback logo reads from here.
 */
export const BRAND = {
  name: "Moire Co.",
  logo: { src: "/brand/moire-logo.png", width: 800, height: 374, alt: "Moire" },
} as const;
