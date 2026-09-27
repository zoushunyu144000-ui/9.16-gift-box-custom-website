import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Server secret used to sign order links, payment callbacks and the admin session.
 * Set APP_SECRET in production. A fixed fallback is used only so the preview runs
 * without configuration.
 */
const SECRET = process.env.APP_SECRET || "moire-preview-secret-change-me";
export const usingFallbackSecret = !process.env.APP_SECRET;

export function sign(value: string) {
  return createHmac("sha256", SECRET).update(value).digest("base64url");
}

export function verify(value: string, signature: string | null | undefined) {
  if (!signature) return false;
  const expected = Buffer.from(sign(value));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Access token for a public order page — prevents guessing other customers' orders. */
export function orderAccessToken(orderId: string) {
  return sign(`order:${orderId}`).slice(0, 24);
}

export function verifyOrderAccess(orderId: string, token: string | null | undefined) {
  if (!token) return false;
  const expected = orderAccessToken(orderId);
  return expected.length === token.length && timingSafeEqual(Buffer.from(expected), Buffer.from(token));
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function randomCode(len: number) {
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

/** e.g. MC-270926-7KQ4 */
export function newOrderId(prefix = "MC") {
  const d = new Date();
  const kl = new Date(d.getTime() + 8 * 3600 * 1000); // Malaysia time
  const stamp = `${String(kl.getUTCFullYear()).slice(2)}${String(kl.getUTCMonth() + 1).padStart(2, "0")}${String(kl.getUTCDate()).padStart(2, "0")}`;
  return `${prefix}-${stamp}-${randomCode(4)}`;
}

/** Signed snapshot so order pages still work if the preview's temporary storage is recycled. */
export function sealSnapshot<T>(data: T) {
  const body = Buffer.from(JSON.stringify(data)).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function openSnapshot<T>(sealed: string | null | undefined): T | null {
  if (!sealed) return null;
  const [body, sig] = sealed.split(".");
  if (!body || !verify(body, sig)) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}
