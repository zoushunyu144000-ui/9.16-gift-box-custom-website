import type { Metadata } from "next";
import { AccountShell } from "@/components/account/account-shell";
import { EmailLink } from "@/components/account/account-forms";
import { confirmEmailChange } from "@/lib/vendure/account-actions";

export const metadata: Metadata = { title: "Confirm your new email", robots: { index: false }, referrer: "no-referrer" };

export default async function VerifyEmailChangePage({ searchParams }: PageProps<"/account/verify-email">) {
  const { token } = await searchParams;
  return (
    <AccountShell title="Confirm your new email">
      <EmailLink run={confirmEmailChange} token={typeof token === "string" ? token : ""} success="Your email address is changed." doneHref="/account" />
    </AccountShell>
  );
}
