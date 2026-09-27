"use client";

import Link from "next/link";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="grid min-h-[70dvh] place-items-center px-6 text-center">
      <div>
        <p className="eyebrow">Something went wrong</p>
        <h1 className="display mt-4 text-[2.2rem] leading-tight">We couldn’t load this page</h1>
        <p className="mx-auto mt-3 max-w-[40ch] text-ink-2">Please try again. If the problem continues, contact us on WhatsApp.</p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <button type="button" onClick={reset} className="btn btn-primary">Try again</button>
          <Link href="/" className="btn btn-outline">Back to home</Link>
        </div>
      </div>
    </div>
  );
}
