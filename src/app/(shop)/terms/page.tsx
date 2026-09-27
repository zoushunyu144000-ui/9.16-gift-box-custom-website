import type { Metadata } from "next";
import { PolicyPage } from "@/components/policy-page";

export const metadata: Metadata = { title: "Terms of sale" };

export default function TermsPage() {
  return (
    <PolicyPage title="Terms of sale" updated="27 September 2026">
      <p>These terms apply to orders placed on this website with Moire Co. (“we”, “us”). By placing an order you agree to them.</p>
      <h2>Orders and prices</h2>
      <ul>
        <li>All prices are in Malaysian Ringgit (RM). Delivery is shown separately at checkout.</li>
        <li>Your order is confirmed once payment has been received.</li>
        <li>Product photographs are for illustration; seasonal contents may vary slightly. If an item becomes unavailable, we will replace it with one of equal or higher value, or contact you.</li>
      </ul>
      <h2>Payment</h2>
      <p>Payment is made online by FPX, card or e-wallet through our payment provider. We do not store your card details.</p>
      <h2>Personalisation</h2>
      <p>Please check names and messages carefully before ordering. We engrave and print exactly as entered.</p>
      <h2>Alcohol</h2>
      <p>Alcohol is sold only to persons aged 21 and above. By ordering alcohol you confirm you meet this requirement.</p>
      <h2>Delivery, returns and refunds</h2>
      <p>See our Delivery & returns policy.</p>
      <h2>Contact</h2>
      <p>For questions about an order, contact us on WhatsApp with your order number.</p>
    </PolicyPage>
  );
}
