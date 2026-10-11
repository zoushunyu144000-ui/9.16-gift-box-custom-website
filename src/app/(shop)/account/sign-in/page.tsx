import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountShell } from "@/components/account/account-shell";
import { GoogleSignIn } from "@/components/account/google-sign-in";
import { SignInForm } from "@/components/account/account-forms";
import { getMember } from "@/lib/vendure/account";

/** "Continue with Google" shows when set (the same OAuth client ID as the backend's GOOGLE_CLIENT_ID). */
const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim();

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default async function SignInPage({ searchParams }: PageProps<"/account/sign-in">) {
  const { next } = await searchParams;
  const target = typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : undefined;
  if (await getMember()) redirect(target ?? "/account");
  return (
    <AccountShell title="Sign in" intro="See your orders and points, and check out faster.">
      {googleClientId && <GoogleSignIn clientId={googleClientId} next={target} context="signin" />}
      <SignInForm next={target} />
      <p className="mt-10 border-t border-line pt-6 text-[14px] text-ink-2">
        New here?{" "}
        <Link href="/account/register" className="text-ink underline underline-offset-4">
          Create an account
        </Link>
        . You can also check out as a guest.
      </p>
    </AccountShell>
  );
}
