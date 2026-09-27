"use client";

import { useActionState } from "react";
import { loginAction } from "@/lib/admin/actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, undefined);
  return (
    <form action={action} className="mt-8 space-y-4">
      <div>
        <label htmlFor="password" className="field-label">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="field" aria-invalid={!!state?.error} />
        {state?.error && <p className="field-error">{state.error}</p>}
      </div>
      <button className="btn btn-primary w-full" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}
