import "server-only";
import type { PaymentMethod } from "@/lib/types";
import { getCapabilities } from "./capabilities";
import { shopApi } from "./client";
import { getSessionToken, setSessionToken } from "./session";

/** A Shop API call made in the customer's session. */
export type SessionCall = <T>(query: string, variables?: Record<string, unknown>) => Promise<T>;

/** The address customers reach the shop at, for links the payment gateway sends them back to. */
export function publicOrigin(req: Request) {
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || new URL(req.url).origin;
}

/**
 * Where the customer pays for their order, which must be waiting for payment: the gateway's hosted
 * page (CHIP, Billplz…) when the shop has one, else the stand-in test payment page.
 */
export async function paymentPageUrl(call: SessionCall, orderCode: string, origin: string, preferred?: PaymentMethod): Promise<{ url: string } | { error: string }> {
  const caps = await getCapabilities();
  const testPage = { url: `/pay/${orderCode}` };
  if (!caps.mutations.has("createHostedPayment")) return testPage;
  const { eligiblePaymentMethods } = await call<{ eligiblePaymentMethods: { code: string; isEligible: boolean }[] }>(`{ eligiblePaymentMethods { code isEligible } }`);
  const hosted = eligiblePaymentMethods.find((m) => m.isEligible && m.code !== "test-payment");
  if (!hosted) return testPage;
  const back = `${origin}/order/${orderCode}`;
  const res = await call<{ createHostedPayment: { url?: string; message?: string } }>(
    `mutation($input: CreateHostedPaymentInput!) { createHostedPayment(input: $input) { ... on HostedPaymentRedirect { url } ... on ErrorResult { errorCode message } } }`,
    { input: { paymentMethodCode: hosted.code, returnUrl: back, cancelUrl: back, preferredMethod: preferred } },
  );
  const { url, message } = res.createHostedPayment;
  return url ? { url } : { error: message || "The payment page couldn’t be opened. Please try again." };
}

/** "Try payment again": a new payment page for the same order, as long as it is still waiting for payment. */
export async function retryPayment(orderCode: string, origin: string): Promise<{ url: string } | { error: string; status: number }> {
  let token = await getSessionToken();
  if (!token) return { error: "We couldn’t find this order in your session. Please check out again from your bag.", status: 404 };
  const call: SessionCall = async (query, variables = {}) => {
    const res = await shopApi<never>(query, variables, { token });
    token = res.token;
    return res.data;
  };
  const { activeOrder } = await call<{ activeOrder: { code: string; state: string } | null }>(`{ activeOrder { code state } }`);
  if (activeOrder?.code !== orderCode || activeOrder.state !== "ArrangingPayment") {
    return { error: "This order can no longer be paid. Please check out again from your bag.", status: 409 };
  }
  const page = await paymentPageUrl(call, orderCode, origin);
  await setSessionToken(token);
  return "url" in page ? page : { error: page.error, status: 502 };
}
