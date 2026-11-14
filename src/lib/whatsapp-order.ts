import { formatRM, personalisationHeading, whatsappLink } from "./catalog";
import { formatDate } from "./dates";
import type { Order } from "./types";

/**
 * Orders are placed on WhatsApp (client, 11-11): the customer fills in the bag and checkout as usual, and
 * the last step, instead of paying online, places the order and opens WhatsApp with it written out. The shop
 * confirms the order there and sends payment details; staff then confirm the payment in the back office.
 *
 * false brings back online payment (CHIP), once the shop's account is approved.
 */
export const ORDER_ON_WHATSAPP = true;

/** Long lists of names are cut in the message; the order page and the back office have them in full. */
const MAX_NAMES_CHARS = 400;

/** The order as the WhatsApp message the customer sends the shop. */
export function whatsappOrderMessage(order: Order, orderUrl: string) {
  const money = (n: number) => formatRM(n, { decimals: true });
  const out: string[] = [`Hello Moire, I'd like to place this order:`, `Order ${order.id}`, ""];

  for (const i of order.items) {
    const name = i.variantName ? `${i.name} (${i.variantName})` : i.name;
    out.push(`${i.quantity} × ${name} — ${money(i.lineTotal)}`);
    if (i.leatherColourName) out.push(`   Name tag: ${i.leatherColourName}`);
    if (i.personalisation) {
      const names = i.personalisation.length > MAX_NAMES_CHARS ? `${i.personalisation.slice(0, MAX_NAMES_CHARS)}… (full list on the order page)` : i.personalisation;
      out.push(`   ${personalisationHeading(i.personalisationLabel, i.personalisationCount)}: ${names}`);
    }
    if (i.giftMessage) out.push(`   Gift message: ${i.giftMessage}`);
  }

  out.push("", `Subtotal: ${money(order.subtotal)}`);
  for (const d of order.discounts ?? []) out.push(`${d.description}: −${money(Math.abs(d.amount))}`);
  out.push(`Delivery: ${order.deliveryFee ? money(order.deliveryFee) : "Free"}`, `Total: ${money(order.total)}`, "");

  const a = order.address;
  out.push(
    `Deliver to: ${order.recipient.name}, ${order.recipient.phone}`,
    [a.line1, a.line2, `${a.postcode} ${a.city}, ${a.state}`].filter(Boolean).join(", "),
  );
  if (order.deliveryDate) out.push(`Preferred date: ${formatDate(order.deliveryDate, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`);
  if (order.deliveryNotes) out.push(`Notes: ${order.deliveryNotes}`);

  out.push("", `My details: ${order.customer.name}, ${order.customer.phone}, ${order.customer.email}`, "", `Order page: ${orderUrl}`);
  return out.join("\n");
}

export function whatsappOrderLink(whatsappNumber: string, order: Order, orderUrl: string) {
  return whatsappLink(whatsappNumber, whatsappOrderMessage(order, orderUrl));
}
