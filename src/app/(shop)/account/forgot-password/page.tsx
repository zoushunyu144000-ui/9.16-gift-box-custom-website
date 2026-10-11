import type { Metadata } from "next";
import Link from "next/link";
import { AccountShell } from "@/components/account/account-shell";
import { ForgotPasswordForm } from "@/components/account/account-forms";

export const metadata: Metadata = { title: "Reset your password", robots: { index: false } };

export default function ForgotPasswordPage() {
  return (
    <AccountShell title="Reset your password" intro="Enter your account’s email and we’ll send you a link to choose a new password.">
      <ForgotPasswordForm />
      <p className="mt-10 border-t border-line pt-6 text-[14px] text-ink-2">
        Remembered it?{" "}
        <Link href="/account/sign-in" className="text-ink underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </AccountShell>
  );
}
