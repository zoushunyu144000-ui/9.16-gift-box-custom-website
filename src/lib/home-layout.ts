import type { ProductImage } from "./types";

/**
 * The homepage slideshow and the three blocks under the festive section, as the back office saves them on the
 * commerce backend (Channel custom fields `homeSlides` and `homeBlocks`, JSON texts). Anything missing or
 * malformed is ignored so the page falls back to its built-in photographs and copy and never breaks.
 */

export type BlockKey = "corporate" | "wine" | "fixed";
export const BLOCK_KEYS: BlockKey[] = ["corporate", "wine", "fixed"];

export interface HomeBlockSetting {
  enabled: boolean;
  eyebrow: string;
  title: string;
  text: string;
  cta: string;
  /** Empty = the built-in photograph. */
  src: string;
  alt: string;
}

export interface HomeBlocksSetting {
  order: BlockKey[];
  blocks: Partial<Record<BlockKey, HomeBlockSetting>>;
}

/** The built-in copy, in the client's approved wording (Oct 2026). */
export const BLOCK_COPY: Record<BlockKey, { eyebrow: string; title: string; text: string; cta: string; href: string }> = {
  corporate: {
    eyebrow: "For business",
    title: "Corporate Gifting",
    text: "Semi-curated / Fully customised — Personalised gifts tailored to your brand and efficient bulk orders.",
    cta: "Explore corporate gifting",
    href: "/corporate",
  },
  wine: {
    eyebrow: "Cheers to you",
    title: "Wine Gift Series",
    text: "A refined selection of ready-to-gift wine sets, thoughtfully paired for every occasion.",
    cta: "Explore wine gift boxes",
    href: "/wine-gift-boxes",
  },
  fixed: {
    eyebrow: "Ready to gift",
    title: "Signature Fixed Gifts",
    text: "Beautifully curated and ready to gift.",
    cta: "Explore fixed gifts",
    href: "/fixed-gifts",
  },
};

/** Today's date in Malaysia as YYYY-MM-DD. */
export function malaysiaToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Whether the festive section is inside the period the shop set (back office → Homepage): from the first day to the
 * last day, both included. An empty or malformed date means no limit on that side.
 */
export function festiveWindowOpen(start: string | null | undefined, end: string | null | undefined, today: string = malaysiaToday()): boolean {
  const from = start && DAY.test(start.trim()) ? start.trim() : null;
  const to = end && DAY.test(end.trim()) ? end.trim() : null;
  return (!from || today >= from) && (!to || today <= to);
}

/** A photograph address: a full http(s) URL or a path on this site. Nothing else is shown. */
export function isImageAddress(value: unknown): value is string {
  return typeof value === "string" && value.length <= 500 && (/^https?:\/\/[^\s]+$/i.test(value) || /^\/(?!\/)[^\s]*$/.test(value));
}

function readJson(value: unknown): unknown {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");

/** The slideshow: valid photographs only, at most five. Empty = use the built-in photographs. */
export function parseHomeSlides(value: unknown): { src: string; alt: string }[] {
  const raw = readJson(value);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> => isRecord(item) && isImageAddress(item.src))
    .slice(0, 5)
    .map((item) => ({ src: item.src as string, alt: text(item.alt, 120) }));
}

export function parseHomeBlocks(value: unknown): HomeBlocksSetting | null {
  const raw = readJson(value);
  if (!isRecord(raw)) return null;
  const seen = Array.isArray(raw.order) ? raw.order.filter((k, i, all): k is BlockKey => (BLOCK_KEYS as unknown[]).includes(k) && all.indexOf(k) === i) : [];
  const order = [...seen, ...BLOCK_KEYS.filter((k) => !seen.includes(k))];
  const blocks: Partial<Record<BlockKey, HomeBlockSetting>> = {};
  if (isRecord(raw.blocks)) {
    for (const key of BLOCK_KEYS) {
      const b = raw.blocks[key];
      if (!isRecord(b)) continue;
      blocks[key] = {
        enabled: b.enabled !== false,
        eyebrow: text(b.eyebrow, 60),
        title: text(b.title, 80),
        text: text(b.text, 300),
        cta: text(b.cta, 40),
        src: isImageAddress(b.src) ? b.src : "",
        alt: text(b.alt, 120),
      };
    }
  }
  return { order, blocks };
}

/** What one block shows: the saved text where there is some, the built-in copy otherwise. */
export function resolveBlock(key: BlockKey, setting: HomeBlockSetting | undefined, builtInImage: ProductImage) {
  const copy = BLOCK_COPY[key];
  return {
    enabled: setting?.enabled !== false,
    eyebrow: setting?.eyebrow || copy.eyebrow,
    title: setting?.title || copy.title,
    text: setting?.text || copy.text,
    cta: setting?.cta || copy.cta,
    href: copy.href,
    image: setting?.src ? { ...builtInImage, src: setting.src, alt: setting.alt || setting.title || copy.title } : builtInImage,
  };
}
