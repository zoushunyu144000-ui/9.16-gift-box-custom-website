import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/admin/login-form";
import { Monogram } from "@/components/logo";
import { isAdmin, usingDemoPassword, DEMO_ADMIN_PASSWORD } from "@/lib/admin/auth";

export const metadata: Metadata = { title: "Admin sign in", robots: { index: false } };

export default async function LoginPage() {
  if (await isAdmin()) redirect("/admin");
  return (
    <div className="grid min-h-dvh place-items-center bg-cream px-5">
      <div className="w-full max-w-sm border border-line bg-ivory p-8 md:p-10">
        <Monogram className="h-10 w-auto text-champagne" />
        <h1 className="display mt-6 text-[2rem] leading-tight">Store admin</h1>
        <p className="mt-2 text-[14px] text-ink-2">Sign in to manage products, orders and settings.</p>
        <LoginForm />
        {usingDemoPassword && (
          <p className="mt-6 border border-dashed border-line-strong px-3 py-2 text-[12px] text-ink-2">
            Preview password: <code className="font-medium text-ink">{DEMO_ADMIN_PASSWORD}</code>. Set ADMIN_PASSWORD before launch.
          </p>
        )}
      </div>
    </div>
  );
}
