import type { Metadata } from "next";
import { CheckoutForm } from "@/components/checkout/checkout-form";
import { earliestDeliveryDate } from "@/lib/dates";
import { getPaymentProvider } from "@/lib/payments";
import { getStore } from "@/lib/store";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };

export default async function CheckoutPage() {
  const settings = await (await getStore()).getSettings();
  return (
    <CheckoutForm
      earliestDate={earliestDeliveryDate(settings.deliveryLeadDays)}
      deliveryNote={settings.deliveryNote}
      testMode={getPaymentProvider().testMode}
    />
  );
}
