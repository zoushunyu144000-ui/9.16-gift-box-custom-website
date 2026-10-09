import type { Metadata } from "next";
import { CheckoutForm } from "@/components/checkout/checkout-form";
import { earliestDeliveryDate } from "@/lib/dates";
import { getPaymentProvider } from "@/lib/payments";
import { getStore, isVendureConfigured } from "@/lib/store";
import { getMember } from "@/lib/vendure/account";
import { getCapabilities } from "@/lib/vendure/capabilities";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };

export default async function CheckoutPage() {
  const [settings, member, hostedPayments] = await Promise.all([
    (await getStore()).getSettings(),
    getMember(),
    isVendureConfigured ? getCapabilities().then((caps) => caps.mutations.has("createHostedPayment"), () => false) : false,
  ]);
  return (
    <CheckoutForm
      earliestDate={earliestDeliveryDate(settings.deliveryLeadDays)}
      deliveryNote={settings.deliveryNote}
      // With the commerce backend, payment is live once it has a gateway plugin; else the test page stands in.
      testMode={isVendureConfigured ? !hostedPayments : getPaymentProvider().testMode}
      accounts={isVendureConfigured}
      member={member && { name: member.name, email: member.email, phone: member.phone }}
    />
  );
}
