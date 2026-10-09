import "server-only";
import { getCapabilities } from "./capabilities";
import { getCatalog } from "./catalog";
import { errorMessage, isErrorResult, shopApi } from "./client";

interface Contact {
  name: string;
  company?: string;
  email?: string;
  phone: string;
}

/** A corporate enquiry as the storefront's forms send it (see /api/enquiries). */
export type EnquiryRequest =
  | { type: "semi-curated"; contact: Contact; items: { productId: string; quantity: number }[]; [detail: string]: unknown }
  | { type: "bespoke"; contact: Contact; [detail: string]: unknown };

/** Sends a corporate enquiry to the commerce backend, where staff follow it up in the dashboard. */
export async function submitVendureEnquiry(request: EnquiryRequest): Promise<{ ok: true; code: string } | { ok: false; status: number; error: string }> {
  const caps = await getCapabilities();
  if (!caps.mutations.has("submitEnquiry")) {
    return { ok: false, status: 503, error: "We can’t take requests online just now. Please contact us on WhatsApp." };
  }
  const { type, contact, ...details } = request;
  let items: { productVariantId: string; quantity: number }[] | undefined;
  if (request.type === "semi-curated") {
    const { products } = await getCatalog();
    const chosen = request.items.map((i) => {
      const p = products.find((x) => x.id === i.productId && x.status !== "hidden");
      const variantId = p?.defaultVariant?.id ?? p?.variants[0]?.id;
      return variantId ? { productVariantId: variantId, quantity: i.quantity } : null;
    });
    if (chosen.some((i) => !i)) return { ok: false, status: 409, error: "One of the selected gifts is no longer available." };
    items = chosen as { productVariantId: string; quantity: number }[];
    delete details.items;
  }
  const { data } = await shopApi<{ submitEnquiry: { code?: string; errorCode?: string; message?: string } }>(
    `mutation($input: SubmitEnquiryInput!) { submitEnquiry(input: $input) { ... on EnquiryReceipt { code } ... on ErrorResult { errorCode message } } }`,
    {
      input: {
        type,
        contact: { name: contact.name, company: contact.company || undefined, email: contact.email || "", phone: contact.phone },
        items,
        details,
      },
    },
  );
  const r = data.submitEnquiry;
  if (isErrorResult(r)) return { ok: false, status: 422, error: errorMessage(r) };
  return r.code ? { ok: true, code: r.code } : { ok: false, status: 502, error: "We couldn't send your request. Please try again or contact us on WhatsApp." };
}
