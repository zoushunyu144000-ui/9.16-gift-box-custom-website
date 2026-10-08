import type { Metadata } from "next";
import { CircleX, HandCoins, PackageX, Signature, type LucideIcon } from "lucide-react";
import { PolicyPage } from "@/components/policy-page";

export const metadata: Metadata = { title: "Terms of sale" };

const TERMS: { title: string; text: string; icon: LucideIcon }[] = [
  {
    title: "Cancellations & refunds",
    text: "As our gifts may be prepared or personalised specifically for your order, cancellations may not be accepted once production has commenced.",
    icon: HandCoins,
  },
  {
    title: "Personalised & customised orders",
    text: "Personalised and customised orders are prepared specifically according to the details provided by the customer. Please ensure that all names, spelling and personalisation details are correct before submitting your order. Once production has commenced, changes may not be possible.",
    icon: Signature,
  },
  {
    title: "Damage / incorrect items",
    text: "If your order arrives damaged or contains an incorrect item, please contact us within 24 hours of receiving your order with your order number and clear photos of the item and packaging. After reviewing the issue, we will arrange an appropriate resolution where applicable.",
    icon: PackageX,
  },
  {
    title: "Incorrect information provided",
    text: "Customers are responsible for providing accurate delivery and personalisation details. Moire Co. is not responsible for delays or failed deliveries caused by incorrect or incomplete information provided at checkout.",
    icon: CircleX,
  },
];

/** Client's wording (Oct 2026), set as numbered points with a line icon each, after the reference they sent. */
export default function TermsPage() {
  return (
    <PolicyPage title="Terms of sale" updated="8 October 2026">
      <ol className="divide-y divide-line bg-paper px-5 md:px-8">
        {TERMS.map((t, i) => {
          const Icon = t.icon;
          return (
            <li key={t.title} className="m-0 py-7 pl-0 before:hidden md:py-8">
              <Icon className="h-7 w-7 text-bronze" strokeWidth={1.1} aria-hidden="true" />
              <h2 className="!mb-2 !mt-4 !font-sans !text-[12px] font-medium uppercase !leading-snug tracking-[0.16em] text-ink">
                {i + 1}. {t.title}
              </h2>
              <p>{t.text}</p>
            </li>
          );
        })}
      </ol>
    </PolicyPage>
  );
}
