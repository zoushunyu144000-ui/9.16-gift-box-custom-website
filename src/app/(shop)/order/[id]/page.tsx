import type { Metadata } from "next";
import { OrderView } from "@/components/checkout/order-view";
import { isVendureConfigured } from "@/lib/store";

export const metadata: Metadata = { title: "Your order", robots: { index: false } };

export default async function OrderPage({ params, searchParams }: PageProps<"/order/[id]">) {
  const { id } = await params;
  const { t } = await searchParams;
  return <OrderView orderId={id} token={typeof t === "string" ? t : ""} backend={isVendureConfigured} />;
}
