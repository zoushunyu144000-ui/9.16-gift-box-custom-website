import type { Metadata } from "next";
import { AccountShell } from "@/components/account/account-shell";
import { ResetPasswordForm } from "@/components/account/account-forms";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false }, referrer: "no-referrer" };

export default async function ResetPasswordPage({ searchParams }: PageProps<"/account/reset-password">) {
  const { token } = await searchParams;
  return (
    <AccountShell title="Choose a new password">
      <ResetPasswordForm token={typeof token === "string" ? token : ""} />
    </AccountShell>
  );
}
