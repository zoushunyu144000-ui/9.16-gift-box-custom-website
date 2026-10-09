import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountShell } from "@/components/account/account-shell";
import { RegisterForm } from "@/components/account/account-forms";
import { getMember } from "@/lib/vendure/account";

export const metadata: Metadata = { title: "Create an account", robots: { index: false } };

export default async function RegisterPage() {
  if (await getMember()) redirect("/account");
  return (
    <AccountShell title="Create an account" intro="Keep your orders in one place, and check out faster next time.">
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
