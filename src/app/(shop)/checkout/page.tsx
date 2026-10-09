import type { Metadata } from "next";
import { CheckoutForm } from "@/components/checkout/checkout-form";
import { earliestDeliveryDate } from "@/lib/dates";
import { getPaymentProvider } from "@/lib/payments";
import { getStore, isVendureConfigured } from "@/lib/store";
import { getMember } from "@/lib/vendure/account";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };

export default async function CheckoutPage() {
  const [settings, member] = await Promise.all([(await getStore()).getSettings(), getMember()]);
  return (
    <CheckoutForm
      earliestDate={earliestDeliveryDate(settings.deliveryLeadDays)}
      deliveryNote={settings.deliveryNote}
      testMode={getPaymentProvider().testMode}
      accounts={isVendureConfigured}
      member={member && { name: member.name, email: member.email, phone: member.phone }}
    />
  );
}
