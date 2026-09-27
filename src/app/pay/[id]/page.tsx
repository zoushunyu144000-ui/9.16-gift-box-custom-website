import type { Metadata } from "next";
import { TestGateway } from "@/components/checkout/test-gateway";

export const metadata: Metadata = { title: "Secure payment (test mode)", robots: { index: false } };

export default async function PayPage({ params, searchParams }: PageProps<"/pay/[id]">) {
  const { id } = await params;
  const { t } = await searchParams;
  return <TestGateway orderId={id} token={typeof t === "string" ? t : ""} />;
}
