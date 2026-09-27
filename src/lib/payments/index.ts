import "server-only";
import type { Order } from "@/lib/types";

/**
 * Payment provider abstraction.
 *
 * The client has not yet chosen a gateway (REQUIREMENTS.md: FPX / Card / E-wallet, provider TBD).
 * The preview uses the built-in test provider, which simulates the gateway's hosted payment page.
 *
 * To go live, implement a provider for the chosen gateway (e.g. Billplz, Stripe, iPay88, Curlec):
 *   1. start(): create a bill / checkout session for order.total (in sen) and return its hosted URL.
 *   2. Add a webhook route (e.g. /api/payments/<provider>/webhook) that verifies the gateway
 *      signature, then calls markOrderPaid / markOrderFailed from lib/orders.ts.
 *   3. Set PAYMENT_PROVIDER=<provider> and the gateway's keys in the environment.
 * Always confirm payment server-to-server (webhook or status API) — never trust the browser redirect alone.
 */
export interface PaymentProvider {
  id: string;
  testMode: boolean;
  start(order: Order, ctx: { origin: string; accessToken: string }): Promise<{ redirectUrl: string; reference?: string }>;
}

const mockProvider: PaymentProvider = {
  id: "test",
  testMode: true,
  async start(order, { accessToken }) {
    return { redirectUrl: `/pay/${order.id}?t=${accessToken}`, reference: `TEST-${order.id}` };
  },
};

export function getPaymentProvider(): PaymentProvider {
  const id = process.env.PAYMENT_PROVIDER || "test";
  switch (id) {
    case "test":
      return mockProvider;
    default:
      console.warn(`[payments] Unknown PAYMENT_PROVIDER "${id}", falling back to test mode`);
      return mockProvider;
  }
}
