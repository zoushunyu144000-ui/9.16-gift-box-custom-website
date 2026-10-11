import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountShell } from "@/components/account/account-shell";
import { GoogleSignIn } from "@/components/account/google-sign-in";
import { RegisterForm } from "@/components/account/account-forms";
import { getMember } from "@/lib/vendure/account";

/** "Continue with Google" shows when set (the same OAuth client ID as the backend's GOOGLE_CLIENT_ID). */
const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim();

export const metadata: Metadata = { title: "Create an account", robots: { index: false } };

export default async function RegisterPage() {
  if (await getMember()) redirect("/account");
  return (
    <AccountShell title="Create an account" intro="Keep your orders in one place, and check out faster next time.">
      {googleClientId && <GoogleSignIn clientId={googleClientId} context="signup" />}
      <RegisterForm />
      <p className="mt-10 border-t border-line pt-6 text-[14px] text-ink-2">
        Already have an account?{" "}
        <Link href="/account/sign-in" className="text-ink underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </AccountShell>
  );
}
