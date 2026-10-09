import type { Metadata } from "next";
import { AccountShell } from "@/components/account/account-shell";
import { EmailLink } from "@/components/account/account-forms";
import { verifyAccount } from "@/lib/vendure/account-actions";

export const metadata: Metadata = { title: "Confirm your email", robots: { index: false }, referrer: "no-referrer" };

export default async function VerifyPage({ searchParams }: PageProps<"/account/verify">) {
  const { token } = await searchParams;
  return (
    <AccountShell title="Confirm your email">
      <EmailLink run={verifyAccount} token={typeof token === "string" ? token : ""} success="Your email is confirmed. Welcome!" doneHref="/account" />
    </AccountShell>
  );
}
