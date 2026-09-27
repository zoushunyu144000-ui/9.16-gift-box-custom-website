import raw from "@/data/unsplash-raw.json";
import type { ProductImage } from "./types";

type RawEntry = [path: string, name: string, username: string, w: number, h: number, premium: string, color: string];
const table = raw as unknown as Record<string, RawEntry>;

/**
 * Placeholder photography from Unsplash (free licence).
 * Every product uses its own photographs — nothing is reused across products.
 * Replace by uploading real product photography in /admin.
 */
export function unsplash(id: string, alt: string): ProductImage {
  const entry = table[id];
  if (!entry) throw new Error(`Unknown placeholder image ${id}`);
  const [path, name, username, width, height] = entry;
  return {
    src: `https://images.unsplash.com/${path}`,
    alt,
    width,
    height,
    credit: `${name} (@${username}) on Unsplash`,
  };
}

export function isUnsplash(src: string) {
  return src.startsWith("https://images.unsplash.com/");
}

/** Build a sized URL. Unsplash supports on-the-fly resizing, cropping and WebP/AVIF. */
export function sizedSrc(src: string, width: number, ratio?: number) {
  if (!isUnsplash(src)) return src;
  const params = new URLSearchParams({ w: String(width), q: "75", auto: "format" });
  if (ratio) {
    params.set("h", String(Math.round(width * ratio)));
    params.set("fit", "crop");
    params.set("crop", "entropy");
  }
  return `${src}?${params.toString()}`;
}

export function srcSet(src: string, widths: number[], ratio?: number) {
  if (!isUnsplash(src)) return undefined;
  return widths.map((w) => `${sizedSrc(src, w, ratio)} ${w}w`).join(", ");
}
