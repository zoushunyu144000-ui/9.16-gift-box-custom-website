import "server-only";
import { cookies } from "next/headers";

/**
 * The customer's commerce-backend session (a guest's checkout, or a signed-in member) lives in an
 * httpOnly cookie, so the bearer token never reaches browser JavaScript.
 */
const COOKIE = "moire_session";

export async function getSessionToken() {
  return (await cookies()).get(COOKIE)?.value ?? null;
}

export async function setSessionToken(token: string | null) {
  const jar = await cookies();
  if (!token) {
    jar.delete(COOKIE);
    return;
  }
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}
