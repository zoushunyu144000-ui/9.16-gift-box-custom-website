import "server-only";
import { shopApi } from "./client";

/**
 * What the connected backend offers. Shops install different plugins (delivery dates, hosted
 * payments, loyalty…), so the storefront asks the Shop API's schema once and only uses what exists.
 */
export interface Capabilities {
  orderFields: Set<string>;
  customerFields: Set<string>;
  fulfillmentFields: Set<string>;
  mutations: Set<string>;
  queries: Set<string>;
}

const QUERY = /* GraphQL */ `
  query StorefrontCapabilities {
    order: __type(name: "OrderCustomFields") { fields { name } }
    customer: __type(name: "CustomerCustomFields") { fields { name } }
    fulfillment: __type(name: "FulfillmentCustomFields") { fields { name } }
    mutation: __type(name: "Mutation") { fields { name } }
    query: __type(name: "Query") { fields { name } }
  }
`;

type Fields = { fields: { name: string }[] } | null;
let cache: { at: number; value: Promise<Capabilities> } | null = null;

export function getCapabilities(): Promise<Capabilities> {
  if (cache && Date.now() - cache.at < 5 * 60_000) return cache.value;
  const names = (t: Fields) => new Set((t?.fields ?? []).map((f) => f.name));
  const value = shopApi<{ order: Fields; customer: Fields; fulfillment: Fields; mutation: Fields; query: Fields }>(QUERY).then(({ data }) => ({
    orderFields: names(data.order),
    customerFields: names(data.customer),
    fulfillmentFields: names(data.fulfillment),
    mutations: names(data.mutation),
    queries: names(data.query),
  }));
  value.catch(() => (cache = null));
  cache = { at: Date.now(), value };
  return value;
}
