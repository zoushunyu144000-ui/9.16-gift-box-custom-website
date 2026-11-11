import type { Metadata } from "next";
import { OrderView } from "@/components/checkout/order-view";
import { getStore, isVendureConfigured } from "@/lib/store";

export const metadata: Metadata = { title: "Your order", robots: { index: false } };

export default async function OrderPage({ params, searchParams }: PageProps<"/order/[id]">) {
  const { id } = await params;
  const { t, wa } = await searchParams;
  const settings = await (await getStore()).getSettings();
  return (
    <OrderView
      orderId={id}
      token={typeof t === "string" ? t : ""}
      backend={isVendureConfigured}
      whatsappNumber={settings.whatsappNumber}
      openWhatsApp={wa === "1"}
    />
  );
}
