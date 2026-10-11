import { NextResponse, type NextRequest } from "next/server";

/**
 * A signed-in member who opens the sign-in or registration page (the header's account icon links
 * to sign-in) goes straight to their account. Doing it here, before the page renders, avoids a
 * blank frame while a redirect from inside the streamed page is followed. The pages check again
 * themselves (getMember), so this is only the fast path: any doubt lets the request through.
 */
export async function proxy(request: NextRequest) {
  const api = process.env.VENDURE_SHOP_API_URL;
  const token = request.cookies.get("moire_session")?.value;
  if (!api || !token) return NextResponse.next();
  try {
    const headers: Record<string, string> = { "content-type": "application/json", authorization: `Bearer ${token}` };
    if (process.env.VENDURE_CHANNEL_TOKEN) headers["vendure-token"] = process.env.VENDURE_CHANNEL_TOKEN;
    const res = await fetch(api, { method: "POST", headers, body: JSON.stringify({ query: "{ activeCustomer { id } }" }), cache: "no-store", signal: AbortSignal.timeout(3000) });
    const body = (await res.json().catch(() => null)) as { data?: { activeCustomer: { id: string } | null } } | null;
    if (!body?.data?.activeCustomer) return NextResponse.next();
  } catch {
    return NextResponse.next();
  }
  const next = request.nextUrl.pathname === "/account/sign-in" ? request.nextUrl.searchParams.get("next") : null;
  const target = next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/account";
  return NextResponse.redirect(new URL(target, request.url));
}

export const config = {
  // Only visitors with a shop session (a guest's bag or a member) can be members.
  matcher: [
    { source: "/account/sign-in", has: [{ type: "cookie", key: "moire_session" }] },
    { source: "/account/register", has: [{ type: "cookie", key: "moire_session" }] },
  ],
};
