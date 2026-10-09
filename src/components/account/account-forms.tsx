"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import {
  changePassword,
  register,
  requestEmailChange,
  requestPasswordReset,
  resetPassword,
  signIn,
  updateProfile,
  type AccountFormState,
} from "@/lib/vendure/account-actions";
import { Field } from "../form-field";

function FormMessage({ state }: { state: AccountFormState }) {
  if (state?.error) {
    return (
      <p role="alert" className="border border-danger/30 bg-danger/5 px-4 py-3 text-[14px] text-danger">
        {state.error}
      </p>
    );
  }
  if (state?.done && state.message) {
    return (
      <p role="status" className="border border-line bg-cream/60 px-4 py-3 text-[14px]">
        {state.message}
      </p>
    );
  }
  return null;
}

const err = (state: AccountFormState, key: string) => state?.fieldErrors?.[key];
/** What was typed before the form was sent (React empties forms after their action runs). */
const typed = (state: AccountFormState, key: string, fallback = "") => state?.values?.[key] ?? fallback;

export function SignInForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(signIn, undefined);
  return (
    <form action={action} className="mt-8 space-y-5" noValidate>
      <FormMessage state={state} />
      {next && <input type="hidden" name="next" value={next} />}
      <Field id="email" label="Email" error={err(state, "email")}>
        <input id="email" name="email" type="email" inputMode="email" autoComplete="email" required defaultValue={typed(state, "email")} className="field" aria-invalid={!!err(state, "email")} />
      </Field>
      <Field id="password" label="Password" error={err(state, "password")}>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="field" aria-invalid={!!err(state, "password")} />
      </Field>
      <div className="flex items-center justify-between gap-4">
        <button className="btn btn-primary" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </button>
        <Link href="/account/forgot-password" className="text-[14px] underline underline-offset-4">
          Forgot your password?
        </Link>
      </div>
    </form>
  );
}

export function RegisterForm() {
  const [state, action, pending] = useActionState(register, undefined);
  if (state?.done) {
    return (
      <div role="status" className="mt-8 border border-line bg-cream/60 px-6 py-6">
        <p className="display text-[1.6rem] leading-tight">Check your email</p>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
          We’ve sent a link to <strong className="font-medium text-ink">{state.message}</strong>. Open it to confirm your email address and finish creating your account.
        </p>
        <p className="mt-3 text-[13px] text-ink-3">
          Nothing after a few minutes? Check your spam folder. If you’ve shopped with us as a member before, you may already have an account —{" "}
          <Link href="/account/sign-in" className="underline underline-offset-4">
            sign in
          </Link>{" "}
          or{" "}
          <Link href="/account/forgot-password" className="underline underline-offset-4">
            reset your password
          </Link>
          .
        </p>
      </div>
    );
  }
  return (
    <form action={action} className="mt-8 space-y-5" noValidate>
      <FormMessage state={state} />
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="firstName" label="First name" error={err(state, "firstName")}>
          <input id="firstName" name="firstName" autoComplete="given-name" required defaultValue={typed(state, "firstName")} className="field" aria-invalid={!!err(state, "firstName")} />
        </Field>
        <Field id="lastName" label="Last name" error={err(state, "lastName")}>
          <input id="lastName" name="lastName" autoComplete="family-name" defaultValue={typed(state, "lastName")} className="field" aria-invalid={!!err(state, "lastName")} />
        </Field>
      </div>
      <Field id="email" label="Email" error={err(state, "email")}>
        <input id="email" name="email" type="email" inputMode="email" autoComplete="email" required defaultValue={typed(state, "email")} className="field" aria-invalid={!!err(state, "email")} />
      </Field>
      <Field id="phone" label="Mobile number (optional)" error={err(state, "phone")} hint="For delivery updates">
        <input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="012 345 6789" defaultValue={typed(state, "phone")} className="field" aria-invalid={!!err(state, "phone")} />
      </Field>
      <Field id="password" label="Password" error={err(state, "password")} hint="At least 8 characters">
        <input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} className="field" aria-invalid={!!err(state, "password")} />
      </Field>
      <p className="text-[13px] text-ink-2">
        By creating an account you agree to our{" "}
        <Link href="/terms" className="underline underline-offset-4">
          terms of sale
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="underline underline-offset-4">
          privacy policy
        </Link>
        .
      </p>
      <button className="btn btn-primary" disabled={pending}>
        {pending ? "Creating your account…" : "Create account"}
      </button>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, undefined);
  if (state?.done) {
    return (
      <p role="status" className="mt-8 border border-line bg-cream/60 px-5 py-4 text-[15px] leading-relaxed">
        If <strong className="font-medium">{state.message}</strong> has an account, we’ve sent it a link to choose a new password. The link works for a limited time.
      </p>
    );
  }
  return (
    <form action={action} className="mt-8 space-y-5" noValidate>
      <FormMessage state={state} />
      <Field id="email" label="Email" error={err(state, "email")}>
        <input id="email" name="email" type="email" inputMode="email" autoComplete="email" required defaultValue={typed(state, "email")} className="field" aria-invalid={!!err(state, "email")} />
      </Field>
      <button className="btn btn-primary" disabled={pending}>
        {pending ? "Sending…" : "Send reset link"}
      </button>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPassword, undefined);
  return (
    <form action={action} className="mt-8 space-y-5" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="token" value={token} />
      <Field id="password" label="New password" error={err(state, "password")} hint="At least 8 characters">
        <input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} className="field" aria-invalid={!!err(state, "password")} />
      </Field>
      <Field id="confirm" label="Repeat the new password" error={err(state, "confirm")}>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" required className="field" aria-invalid={!!err(state, "confirm")} />
      </Field>
      <button className="btn btn-primary" disabled={pending}>
        {pending ? "Saving…" : "Save new password"}
      </button>
      {state?.error && (
        <p className="text-[14px]">
          <Link href="/account/forgot-password" className="underline underline-offset-4">
            Ask for a new link
          </Link>
        </p>
      )}
    </form>
  );
}

export function ProfileForm({ member }: { member: { firstName: string; lastName: string; phone: string } }) {
  const [state, action, pending] = useActionState(updateProfile, undefined);
  return (
    <form action={action} className="space-y-5" noValidate>
      <FormMessage state={state} />
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="firstName" label="First name" error={err(state, "firstName")}>
          <input id="firstName" name="firstName" autoComplete="given-name" defaultValue={typed(state, "firstName", member.firstName)} required className="field" aria-invalid={!!err(state, "firstName")} />
        </Field>
        <Field id="lastName" label="Last name" error={err(state, "lastName")}>
          <input id="lastName" name="lastName" autoComplete="family-name" defaultValue={typed(state, "lastName", member.lastName)} className="field" aria-invalid={!!err(state, "lastName")} />
        </Field>
      </div>
      <Field id="phone" label="Mobile number" error={err(state, "phone")}>
        <input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" defaultValue={typed(state, "phone", member.phone)} className="field" aria-invalid={!!err(state, "phone")} />
      </Field>
      <button className="btn btn-outline" disabled={pending}>
        {pending ? "Saving…" : "Save details"}
      </button>
    </form>
  );
}

export function PasswordForm() {
  const [state, action, pending] = useActionState(changePassword, undefined);
  return (
    <form action={action} className="space-y-5" noValidate>
      <FormMessage state={state} />
      <Field id="current" label="Current password" error={err(state, "current")}>
        <input id="current" name="current" type="password" autoComplete="current-password" required className="field" aria-invalid={!!err(state, "current")} />
      </Field>
      <Field id="new-password" label="New password" error={err(state, "password")} hint="At least 8 characters">
        <input id="new-password" name="password" type="password" autoComplete="new-password" required minLength={8} className="field" aria-invalid={!!err(state, "password")} />
      </Field>
      <button className="btn btn-outline" disabled={pending}>
        {pending ? "Saving…" : "Change password"}
      </button>
    </form>
  );
}

export function EmailForm() {
  const [state, action, pending] = useActionState(requestEmailChange, undefined);
  return (
    <form action={action} className="space-y-5" noValidate>
      <FormMessage state={state} />
      <Field id="newEmail" label="New email" error={err(state, "newEmail")}>
        <input id="newEmail" name="newEmail" type="email" inputMode="email" autoComplete="email" required defaultValue={typed(state, "newEmail")} className="field" aria-invalid={!!err(state, "newEmail")} />
      </Field>
      <Field id="email-password" label="Your password" error={err(state, "password")}>
        <input id="email-password" name="password" type="password" autoComplete="current-password" required className="field" aria-invalid={!!err(state, "password")} />
      </Field>
      <button className="btn btn-outline" disabled={pending}>
        {pending ? "Sending…" : "Send confirmation link"}
      </button>
    </form>
  );
}

/**
 * Opens a link from an account email (confirm account, confirm new email): runs it once on arrival,
 * then sends the customer on. Runs from the page rather than on the server render so link
 * previewers that only fetch the page don't use up the link.
 */
export function EmailLink({ run, token, success, doneHref }: { run: (token: string) => Promise<AccountFormState>; token: string; success: string; doneHref: string }) {
  const router = useRouter();
  const started = useRef(false);
  const [result, setResult] = useState<AccountFormState>(undefined);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    startTransition(async () => {
      const r = await run(token);
      setResult(r);
      if (r?.done) {
        router.replace(doneHref);
        router.refresh();
      }
    });
  }, [run, token, doneHref, router]);

  if (!result) {
    return (
      <p role="status" className="mt-8 text-[15px] text-ink-2">
        One moment…
      </p>
    );
  }
  if (result.done) {
    return (
      <p role="status" className="mt-8 text-[15px]">
        {success}
      </p>
    );
  }
  return (
    <div className="mt-8 space-y-6">
      <FormMessage state={result} />
      <Link href="/account/sign-in" className="btn btn-primary">
        Sign in
      </Link>
    </div>
  );
}
