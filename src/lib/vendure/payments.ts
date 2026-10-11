import "server-only";
import type { PaymentMethod } from "@/lib/types";
import { getCapabilities } from "./capabilities";
import { shopApi } from "./client";
import { getSessionToken, setSessionToken } from "./session";

/** A Shop API call made in the customer's session. */
export type SessionCall = <T>(query: string, variables?: Record<string, unknown>) => Promise<T>;

/** The backend's test payment method (no money; refused on a live shop), paid on the stand-in /pay page. */
const TEST_METHOD = "test-payment";

/** The address customers reach the shop at, for links the payment gateway sends them back to. */
export function publicOrigin(req: Request) {
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || new URL(req.url).origin;
}

/**
 * Where the customer pays for their order, which must be waiting for payment: the first of the
 * shop's payment methods that opens a gateway's hosted page (CHIP, Billplz…), else, where the shop
 * still allows test payments, the stand-in test payment page.
 */
export async function paymentPageUrl(call: SessionCall, orderCode: string, origin: string, preferred?: PaymentMethod): Promise<{ url: string } | { error: string }> {
  const caps = await getCapabilities();
  const { eligiblePaymentMethods } = await call<{ eligiblePaymentMethods: { code: string; isEligible: boolean }[] }>(`{ eligiblePaymentMethods { code isEligible } }`);
  const eligible = eligiblePaymentMethods.filter((m) => m.isEligible);
  if (caps.mutations.has("createHostedPayment")) {
    const back = `${origin}/order/${orderCode}`;
    for (const method of eligible.filter((m) => m.code !== TEST_METHOD)) {
      const res = await call<{ createHostedPayment: { url?: string; errorCode?: string; message?: string } }>(
        `mutation($input: CreateHostedPaymentInput!) { createHostedPayment(input: $input) { ... on HostedPaymentRedirect { url } ... on ErrorResult { errorCode message } } }`,
        { input: { paymentMethodCode: method.code, returnUrl: back, cancelUrl: back, preferredMethod: preferred } },
      );
      const { url, errorCode, message } = res.createHostedPayment;
      if (url) return { url };
      // Not a hosted gateway method (e.g. bank transfer): try the next one. A gateway's own failure is the answer.
      if (errorCode !== "INELIGIBLE_PAYMENT_METHOD_ERROR") return { error: message || "The payment page couldn’t be opened. Please try again." };
    }
  }
  if (eligible.some((m) => m.code === TEST_METHOD)) return { url: `/pay/${orderCode}` };
  return { error: "Online payment isn’t available just now. Please try again later, or contact us on WhatsApp." };
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
