import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PolicyPage } from "@/components/policy-page";

export const metadata: Metadata = { title: "Delivery & returns" };

const FAQS = [
  {
    q: "When will my order be delivered?",
    a: "Your selected delivery date will be confirmed with you before dispatch. This is normally 3–5 days after you place your order. For customised and corporate orders, delivery timelines may vary depending on the order quantity and production schedule.",
  },
  {
    q: "Can I request a specific delivery date?",
    a: "Yes. You may let us know your preferred delivery date through WhatsApp when placing your order. We will do our best to accommodate your requested date, subject to availability.",
  },
  {
    q: "Can I change my delivery address after placing an order?",
    a: "Please contact us as soon as possible if you need to update your delivery address. Changes may not be possible once your order has been dispatched.",
  },
  {
    q: "Can I send to multiple addresses?",
    a: "Yes. You may send us your delivery addresses through WhatsApp when placing your order. Additional delivery charges may apply depending on the number and location of the addresses.",
  },
];

/**
 * Client's wording (Oct 2026): where we deliver is shown in full, with same-day and Sunday
 * dispatch set apart; each question shows on its own and opens to its answer.
 */
export default function DeliveryPage() {
  return (
    <PolicyPage title="Delivery & returns" updated="8 October 2026">
      <h2 className="!mt-0">Where we deliver</h2>
      <dl className="divide-y divide-line border-y border-line">
        <div className="flex justify-between gap-6 py-3">
          <dt className="text-ink">KL &amp; Selangor</dt>
          <dd>Lalamove</dd>
        </div>
        <div className="flex justify-between gap-6 py-3">
          <dt className="text-ink">Outstation</dt>
          <dd>Courier</dd>
        </div>
      </dl>
      <div className="mt-6 space-y-4 bg-champagne/80 px-5 py-5 text-ink md:px-6">
        <div>
          <h3 className="!m-0 font-medium">Same-day delivery</h3>
          <p className="mt-1">Orders confirmed before 3pm are available to dispatch via Lalamove on the same day.</p>
        </div>
        <div>
          <h3 className="!m-0 font-medium">Sunday</h3>
          <p className="mt-1">We do not dispatch orders on Sundays. Orders placed on Sunday will be processed on the next working day.</p>
        </div>
      </div>

      <div className="mt-10 space-y-2">
        {FAQS.map((f) => (
          <details key={f.q} className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 bg-paper px-5 py-4 font-medium leading-snug text-ink transition-colors hover:bg-cream md:px-6 [&::-webkit-details-marker]:hidden">
              {f.q}
              <ArrowRight className="h-4 w-4 flex-none text-bronze transition-transform duration-300 group-open:rotate-90" strokeWidth={1.25} aria-hidden="true" />
            </summary>
            <p className="px-5 pb-3 pt-4 md:px-6">{f.a}</p>
          </details>
        ))}
      </div>

      <p className="mt-10 text-[14px]">
        Cancellations, refunds and damaged or incorrect items are covered in our{" "}
        <Link href="/terms" className="text-ink underline decoration-champagne underline-offset-4 hover:text-bronze">
          Terms of sale
        </Link>
        .
      </p>
    </PolicyPage>
  );
}
