"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { signInWithGoogle } from "@/lib/vendure/account-actions";

/** The parts of Google Identity Services (https://accounts.google.com/gsi/client) used here. */
interface GoogleIdentity {
  initialize(options: {
    client_id: string;
    callback: (response: { credential?: string }) => void;
    context?: "signin" | "signup" | "use";
    ux_mode?: "popup" | "redirect";
    itp_support?: boolean;
  }): void;
  renderButton(
    parent: HTMLElement,
    options: {
      type: "standard" | "icon";
      theme?: "outline" | "filled_blue" | "filled_black";
      size?: "large" | "medium" | "small";
      text?: "signin_with" | "signup_with" | "continue_with" | "signin";
      shape?: "rectangular" | "pill" | "circle" | "square";
      logo_alignment?: "left" | "center";
      width?: number;
    },
  ): void;
}

declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleIdentity } };
  }
}

/** Google's button is between 200 and 400 pixels wide. */
const buttonWidth = (el: HTMLElement) => Math.round(Math.min(400, Math.max(200, el.clientWidth)));

/**
 * "Continue with Google" (Google's own button), above the email form with an "or" between them.
 * Google hands back an ID token, which the server sends to the shop's backend to sign in.
 */
export function GoogleSignIn({ clientId, next, context }: { clientId: string; next?: string; context: "signin" | "signup" }) {
  const box = useRef<HTMLDivElement>(null);
  const width = useRef(0);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const onCredential = useCallback(
    ({ credential }: { credential?: string }) => {
      setError(undefined);
      if (!credential) {
        setError("We couldn’t sign you in with Google. Please try again, or use your email and password.");
        return;
      }
      startTransition(async () => {
        const result = await signInWithGoogle(credential, next);
        if (result?.error) setError(result.error);
      });
    },
    [next],
  );

  const render = useCallback(() => {
    const id = window.google?.accounts?.id;
    const el = box.current;
    if (!id || !el) return;
    id.initialize({ client_id: clientId, callback: onCredential, context, ux_mode: "popup", itp_support: true });
    width.current = buttonWidth(el);
    el.replaceChildren();
    id.renderButton(el, { type: "standard", theme: "outline", size: "large", text: "continue_with", shape: "rectangular", logo_alignment: "center", width: width.current });
  }, [clientId, context, onCredential]);

  // Follow the page's width (e.g. a phone turned sideways); Google's button has a fixed width once drawn.
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (width.current && Math.abs(buttonWidth(el) - width.current) > 8) render();
      }, 150);
    });
    observer.observe(el);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [render]);

  if (unavailable) return null;

  return (
    <div className="mt-8">
      <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onReady={render} onError={() => setUnavailable(true)} />
      <div ref={box} className={`flex min-h-[44px] w-full justify-center transition-opacity ${pending ? "pointer-events-none opacity-50" : ""}`} />
      <div aria-live="polite">
        {pending && <p className="mt-3 text-center text-[13px] text-ink-2">Signing you in…</p>}
        {error && (
          <p role="alert" className="mt-4 border border-danger/30 bg-danger/5 px-4 py-3 text-[14px] text-danger">
            {error}
          </p>
        )}
      </div>
      <div className="mt-8 flex items-center gap-4 text-[11px] uppercase tracking-[0.2em] text-ink-3" role="separator" aria-label="or">
        <span className="h-px flex-1 bg-line" aria-hidden="true" />
        or
        <span className="h-px flex-1 bg-line" aria-hidden="true" />
      </div>
    </div>
  );
}
