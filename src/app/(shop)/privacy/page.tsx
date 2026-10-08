import type { Metadata } from "next";
import { PolicyPage } from "@/components/policy-page";

export const metadata: Metadata = { title: "Privacy policy" };

export default function PrivacyPage() {
  return (
    <PolicyPage title="Privacy policy" updated="27 September 2026" draft>
      <p>This policy explains how Moire Co. handles personal data collected through this website, in line with the Personal Data Protection Act 2010 (Malaysia).</p>
      <h2>What we collect</h2>
      <ul>
        <li>Your name, email and phone number when you order or enquire.</li>
        <li>Recipient name, phone number and delivery address.</li>
        <li>Personalisation text and gift messages you enter.</li>
        <li>Payment status and reference from our payment provider. We do not receive or store card details.</li>
      </ul>
      <h2>How we use it</h2>
      <p>To process and deliver your order, contact you about it, prepare corporate quotations, and meet our legal obligations. We do not sell your data.</p>
      <h2>Who we share it with</h2>
      <p>Only with service providers needed to fulfil your order — such as our payment provider, delivery partners and website hosting.</p>
      <h2>Your choices</h2>
      <p>You may ask to access or correct your personal data by contacting us.</p>
      <h2>Your bag</h2>
      <p>Your shopping bag is stored in your own browser so it is kept between visits. It is not shared with us until you check out.</p>
    </PolicyPage>
  );
}
