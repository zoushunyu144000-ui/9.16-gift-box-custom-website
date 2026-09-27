import Link from "next/link";
import { Monogram } from "@/components/logo";

export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center bg-ivory px-6 text-center">
      <div>
        <Monogram className="mx-auto h-12 w-auto text-champagne" />
        <p className="eyebrow mt-8">Page not found</p>
        <h1 className="display mt-4 text-[2.4rem] leading-tight md:text-[3rem]">This page isn’t here</h1>
        <p className="mx-auto mt-3 max-w-[40ch] text-ink-2">The link may be out of date, or the gift is no longer available.</p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href="/" className="btn btn-primary">Back to home</Link>
          <Link href="/festive" className="btn btn-outline">Festive Collection</Link>
        </div>
      </div>
    </div>
  );
}
