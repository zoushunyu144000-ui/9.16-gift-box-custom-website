import type { Metadata } from "next";
import { PolicyPage } from "@/components/policy-page";
import { formatRM } from "@/lib/catalog";
import { getStore } from "@/lib/store";

export const metadata: Metadata = { title: "Delivery & returns" };

export default async function DeliveryPage() {
  const s = await (await getStore()).getSettings();
  return (
    <PolicyPage title="Delivery & returns" updated="27 September 2026">
      <h2>Delivery</h2>
      <p>
        Delivery is charged at <strong>{formatRM(s.deliveryFee)}</strong> per order
        {s.freeDeliveryThreshold != null ? `, and is free for orders of ${formatRM(s.freeDeliveryThreshold)} or more` : ""}. You can choose a preferred
        delivery date at checkout; the earliest date available is {s.deliveryLeadDays} day{s.deliveryLeadDays === 1 ? "" : "s"} after your order.
      </p>
      <p>{s.deliveryNote}</p>
      <ul>
        <li>We deliver to the address and recipient given at checkout. Please make sure the phone number is reachable on the delivery date.</li>
        <li>Orders containing alcohol can only be delivered to someone aged 21 or older, who may be asked for ID.</li>
        <li>Fresh items such as fruit are packed close to the delivery date.</li>
      </ul>
      <h2>Changes and cancellations</h2>
      <p>If you need to change an address or date, contact us with your order number as soon as possible. Personalised and engraved items cannot be changed once production has started.</p>
      <h2>Returns</h2>
      <p>
        Because our gifts include food, drink and personalised items, we can’t accept returns for change of mind. If an item arrives damaged,
        incorrect or missing, please contact us within 48 hours of delivery with your order number and photos, and we will arrange a replacement or refund.
      </p>
      <h2>Corporate orders</h2>
      <p>Delivery, lead times and terms for corporate orders are confirmed in your quotation or proposal.</p>
    </PolicyPage>
  );
}
