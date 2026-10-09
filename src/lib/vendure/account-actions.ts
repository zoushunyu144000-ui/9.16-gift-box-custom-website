"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { errorMessage, isErrorResult, isVendureConfigured, shopApi } from "./client";
import { getSessionToken, setSessionToken } from "./session";

/**
 * What an account form shows after it is sent. `values` hands back what was typed (never passwords),
 * because React empties a form once its action has run.
 */
export type AccountFormState =
  | { error?: string; fieldErrors?: Record<string, string>; done?: boolean; message?: string; unverified?: boolean; values?: Record<string, string> }
  | undefined;

/** The named fields as typed, to give back with an error. */
function keep(form: FormData, ...keys: string[]) {
  return Object.fromEntries(keys.map((k) => [k, String(form.get(k) ?? "")]));
}

const email = z.string().trim().toLowerCase().email("Please enter a valid email").max(120);
// bcrypt, which the backend hashes passwords with, reads at most 72 bytes.
const newPassword = z.string().min(8, "Use at least 8 characters").max(72, "Use at most 72 characters");
const phone = z
  .string()
  .trim()
  .max(20)
  .regex(/^([+0-9 ()-]{8,20})?$/, "Please enter a valid phone number");
const name = (label: string) => z.string().trim().min(1, `Please enter your ${label}`).max(60);

const UNAVAILABLE: AccountFormState = { error: "Accounts aren’t available yet." };
const OFFLINE: AccountFormState = { error: "We couldn’t reach the shop just now. Please try again in a moment." };

function fieldErrors(error: z.ZodError) {
  const out: Record<string, string> = {};
  for (const issue of error.issues) out[String(issue.path[0])] ??= issue.message;
  return out;
}

/** Only same-site paths, so a crafted link can't send someone elsewhere after signing in. */
function safeNext(value: FormDataEntryValue | null) {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/account";
}

/** A short pause on failure slows down password guessing. */
const pause = () => new Promise((r) => setTimeout(r, 400));

const RESULT = `__typename ... on ErrorResult { errorCode message }`;

export async function signIn(_prev: AccountFormState, form: FormData): Promise<AccountFormState> {
  if (!isVendureConfigured) return UNAVAILABLE;
  const values = keep(form, "email");
  const parsed = z.object({ email, password: z.string().min(1, "Please enter your password").max(200) }).safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };
  let session: string | null;
  try {
    // Signing in from a guest session keeps whatever that session holds.
    const res = await shopApi<{ login: unknown }>(
      `mutation($u: String!, $p: String!) { login(username: $u, password: $p, rememberMe: true) { ${RESULT} } }`,
      { u: parsed.data.email, p: parsed.data.password },
      { token: await getSessionToken() },
    );
    if (isErrorResult(res.data.login)) {
      await pause();
      if (res.data.login.errorCode === "NOT_VERIFIED_ERROR") {
        await shopApi(`mutation($e: String!) { refreshCustomerVerification(emailAddress: $e) { __typename } }`, { e: parsed.data.email }).catch(() => undefined);
        return { error: "Please confirm your email address first. We’ve sent you a new link.", unverified: true, values };
      }
      return { error: "That email and password don’t match. Please try again.", values };
    }
    session = res.token;
  } catch (err) {
    console.error("[account] sign in failed", err);
    return { ...OFFLINE, values };
  }
  await setSessionToken(session);
  redirect(safeNext(form.get("next")));
}

export async function register(_prev: AccountFormState, form: FormData): Promise<AccountFormState> {
  if (!isVendureConfigured) return UNAVAILABLE;
  const values = keep(form, "firstName", "lastName", "email", "phone");
  const parsed = z
    .object({ firstName: name("first name"), lastName: z.string().trim().max(60), email, phone, password: newPassword })
    .safeParse({ ...values, password: form.get("password") ?? "" });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };
  const { firstName, lastName, phone: phoneNumber, password } = parsed.data;
  try {
    const { data } = await shopApi<{ registerCustomerAccount: unknown }>(
      `mutation($i: RegisterCustomerInput!) { registerCustomerAccount(input: $i) { ${RESULT} ... on PasswordValidationError { validationErrorMessage } } }`,
      { i: { emailAddress: parsed.data.email, firstName, lastName, phoneNumber: phoneNumber || undefined, password } },
    );
    const r = data.registerCustomerAccount;
    if (isErrorResult(r)) {
      const detail = (r as { validationErrorMessage?: string }).validationErrorMessage;
      return r.errorCode === "PASSWORD_VALIDATION_ERROR" ? { fieldErrors: { password: detail || errorMessage(r) }, values } : { error: errorMessage(r), values };
    }
  } catch (err) {
    console.error("[account] registration failed", err);
    return { ...OFFLINE, values };
  }
  // The same answer whether or not the address already has an account, so it can't be used to find out.
  return { done: true, message: parsed.data.email };
}

/** Confirms a new account from the link in its email, and signs the customer in. */
export async function verifyAccount(token: string): Promise<AccountFormState> {
  if (!isVendureConfigured) return UNAVAILABLE;
  if (!token || token.length > 200) return { error: "This link is incomplete. Please open it straight from the email." };
  let session: string | null;
  try {
    const res = await shopApi<{ verifyCustomerAccount: unknown }>(`mutation($t: String!) { verifyCustomerAccount(token: $t) { ${RESULT} } }`, { t: token });
    const r = res.data.verifyCustomerAccount;
    if (isErrorResult(r)) {
      if (r.errorCode === "VERIFICATION_TOKEN_EXPIRED_ERROR") return { error: "This link has expired. Sign in and we’ll send you a new one.", unverified: true };
      return { error: "This link has already been used or isn’t valid. If you’ve confirmed your email, just sign in." };
    }
    session = res.token;
  } catch (err) {
    console.error("[account] verification failed", err);
    return OFFLINE;
  }
  await setSessionToken(session);
  return { done: true };
}

export async function requestPasswordReset(_prev: AccountFormState, form: FormData): Promise<AccountFormState> {
  if (!isVendureConfigured) return UNAVAILABLE;
  const values = keep(form, "email");
  const parsed = email.safeParse(form.get("email"));
  if (!parsed.success) return { fieldErrors: { email: parsed.error.issues[0].message }, values };
  try {
    await shopApi(`mutation($e: String!) { requestPasswordReset(emailAddress: $e) { __typename } }`, { e: parsed.data });
  } catch (err) {
    console.error("[account] password reset request failed", err);
    return { ...OFFLINE, values };
  }
  return { done: true, message: parsed.data };
}

export async function resetPassword(_prev: AccountFormState, form: FormData): Promise<AccountFormState> {
  if (!isVendureConfigured) return UNAVAILABLE;
  const parsed = z
    .object({ token: z.string().min(1).max(200), password: newPassword, confirm: z.string() })
    .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "The passwords don’t match" })
    .safeParse({ token: form.get("token"), password: form.get("password"), confirm: form.get("confirm") });
  if (!parsed.success) {
    const errors = fieldErrors(parsed.error);
    return errors.token ? { error: "This link is incomplete. Please open it straight from the email." } : { fieldErrors: errors };
  }
  let session: string | null;
  try {
    const res = await shopApi<{ resetPassword: unknown }>(
      `mutation($t: String!, $p: String!) { resetPassword(token: $t, password: $p) { ${RESULT} ... on PasswordValidationError { validationErrorMessage } } }`,
      { t: parsed.data.token, p: parsed.data.password },
    );
    const r = res.data.resetPassword;
    if (isErrorResult(r)) {
      if (r.errorCode === "PASSWORD_VALIDATION_ERROR") return { fieldErrors: { password: (r as { validationErrorMessage?: string }).validationErrorMessage || errorMessage(r) } };
      return { error: "This reset link has expired or was already used. Please ask for a new one." };
    }
    session = res.token;
  } catch (err) {
    console.error("[account] password reset failed", err);
    return OFFLINE;
  }
  await setSessionToken(session);
  redirect("/account");
}

export async function signOut() {
  const token = await getSessionToken();
  if (token) await shopApi(`mutation { logout { success } }`, {}, { token }).catch(() => undefined);
  await setSessionToken(null);
  redirect("/");
}

/** Runs an operation for the signed-in member; sends anyone else to sign in. */
async function asMember<T>(run: (token: string) => Promise<T>): Promise<T> {
  const token = await getSessionToken();
  if (!token) redirect("/account/sign-in");
  return run(token);
}

export async function updateProfile(_prev: AccountFormState, form: FormData): Promise<AccountFormState> {
  if (!isVendureConfigured) return UNAVAILABLE;
  const values = keep(form, "firstName", "lastName", "phone");
  const parsed = z.object({ firstName: name("first name"), lastName: z.string().trim().max(60), phone }).safeParse(values);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };
  return asMember(async (token) => {
    try {
      const { firstName, lastName, phone: phoneNumber } = parsed.data;
      await shopApi(`mutation($i: UpdateCustomerInput!) { updateCustomer(input: $i) { id } }`, { i: { firstName, lastName, phoneNumber } }, { token });
    } catch (err) {
      console.error("[account] profile update failed", err);
      return { ...OFFLINE, values };
    }
    refresh();
    return { done: true, message: "Your details are saved.", values: { firstName: parsed.data.firstName, lastName: parsed.data.lastName, phone: parsed.data.phone } };
  });
}

export async function changePassword(_prev: AccountFormState, form: FormData): Promise<AccountFormState> {
  if (!isVendureConfigured) return UNAVAILABLE;
  const parsed = z
    .object({ current: z.string().min(1, "Please enter your current password").max(200), password: newPassword })
    .safeParse({ current: form.get("current"), password: form.get("password") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  return asMember(async (token) => {
    try {
      const { data } = await shopApi<{ updateCustomerPassword: unknown }>(
        `mutation($c: String!, $p: String!) { updateCustomerPassword(currentPassword: $c, newPassword: $p) { ${RESULT} ... on PasswordValidationError { validationErrorMessage } } }`,
        { c: parsed.data.current, p: parsed.data.password },
        { token },
      );
      const r = data.updateCustomerPassword;
      if (isErrorResult(r)) {
        await pause();
        if (r.errorCode === "INVALID_CREDENTIALS_ERROR") return { fieldErrors: { current: "That isn’t your current password" } };
        return { fieldErrors: { password: (r as { validationErrorMessage?: string }).validationErrorMessage || errorMessage(r) } };
      }
    } catch (err) {
      console.error("[account] password change failed", err);
      return OFFLINE;
    }
    return { done: true, message: "Your password is changed." };
  });
}

export async function requestEmailChange(_prev: AccountFormState, form: FormData): Promise<AccountFormState> {
  if (!isVendureConfigured) return UNAVAILABLE;
  const values = keep(form, "newEmail");
  const parsed = z
    .object({ newEmail: email, password: z.string().min(1, "Please enter your password").max(200) })
    .safeParse({ newEmail: form.get("newEmail"), password: form.get("password") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };
  return asMember(async (token) => {
    try {
      const { data } = await shopApi<{ requestUpdateCustomerEmailAddress: unknown }>(
        `mutation($p: String!, $e: String!) { requestUpdateCustomerEmailAddress(password: $p, newEmailAddress: $e) { ${RESULT} } }`,
        { p: parsed.data.password, e: parsed.data.newEmail },
        { token },
      );
      const r = data.requestUpdateCustomerEmailAddress;
      if (isErrorResult(r)) {
        await pause();
        if (r.errorCode === "INVALID_CREDENTIALS_ERROR") return { fieldErrors: { password: "That isn’t your password" }, values };
        if (r.errorCode === "EMAIL_ADDRESS_CONFLICT_ERROR") return { fieldErrors: { newEmail: "This email address already has an account" }, values };
        return { error: errorMessage(r), values };
      }
    } catch (err) {
      console.error("[account] email change request failed", err);
      return { ...OFFLINE, values };
    }
    return { done: true, message: `We’ve sent a link to ${parsed.data.newEmail}. Open it to finish changing your email.` };
  });
}

/** Finishes an email change from the link sent to the new address. */
export async function confirmEmailChange(token: string): Promise<AccountFormState> {
  if (!isVendureConfigured) return UNAVAILABLE;
  if (!token || token.length > 200) return { error: "This link is incomplete. Please open it straight from the email." };
  try {
    const { data } = await shopApi<{ updateCustomerEmailAddress: unknown }>(`mutation($t: String!) { updateCustomerEmailAddress(token: $t) { ${RESULT} } }`, { t: token }, { token: await getSessionToken() });
    if (isErrorResult(data.updateCustomerEmailAddress)) return { error: "This link has expired or was already used. You can ask for a new one from your account." };
  } catch (err) {
    console.error("[account] email change failed", err);
    return OFFLINE;
  }
  return { done: true };
}
