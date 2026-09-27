import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sign, verify } from "../security";

const COOKIE = "moire_admin";
const MAX_AGE = 60 * 60 * 12; // 12 hours

/**
 * Single-owner admin login. Set ADMIN_PASSWORD in production.
 * The preview falls back to a documented demo password so the client can explore the admin.
 */
export const DEMO_ADMIN_PASSWORD = "moire-preview";
export const usingDemoPassword = !process.env.ADMIN_PASSWORD;
const PASSWORD = process.env.ADMIN_PASSWORD || DEMO_ADMIN_PASSWORD;

export function checkPassword(input: string) {
  const a = Buffer.from(sign(`pw:${input}`));
  const b = Buffer.from(sign(`pw:${PASSWORD}`));
  return a.length === b.length && a.equals(b);
}

export async function createSession() {
  const exp = Date.now() + MAX_AGE * 1000;
  const value = `${exp}`;
  (await cookies()).set(COOKIE, `${value}.${sign(`admin:${value}`)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

export async function isAdmin() {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return false;
  const [exp, sig] = raw.split(".");
  if (!exp || !verify(`admin:${exp}`, sig)) return false;
  return Number(exp) > Date.now();
}

/** Use at the top of every admin page and server action. */
export async function requireAdmin() {
  if (!(await isAdmin())) redirect("/admin/login");
}
