import "server-only";
import { cache } from "react";
import type { OrderStatus } from "@/lib/types";
import { getCapabilities } from "./capabilities";
import { NAMES_SKU } from "./catalog";
import { isVendureConfigured, shopApi } from "./client";
import { orderStatus } from "./orders";
import { getSessionToken } from "./session";

/** A signed-in customer (member) of the shop. */
export interface Member {
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  phone: string;
  /** Points balance when the shop runs the loyalty programme, else null. */
  loyaltyPoints: number | null;
}

export interface MemberOrder {
  code: string;
  placedAt: string;
  status: OrderStatus;
  total: number;
  items: { name: string; quantity: number; image?: string }[];
}

export interface LoyaltyEntry {
  id: string;
  createdAt: string;
  points: number;
  reason: string;
  note: string | null;
  orderCode: string | null;
}

export interface LoyaltySettings {
  pointsPerRinggit: number;
  pointValueSen: number;
  minRedeemPoints: number;
  maxRedeemPercent: number;
}

type VCustomer = {
  firstName: string;
  lastName: string;
  emailAddress: string;
  phoneNumber: string | null;
  customFields?: { loyaltyPoints?: number | null };
};

/** The signed-in member, or null for guests (and when the shop has no commerce backend). One lookup per request. */
export const getMember = cache(async (): Promise<Member | null> => {
  if (!isVendureConfigured) return null;
  const token = await getSessionToken();
  if (!token) return null;
  const caps = await getCapabilities();
  const points = caps.customerFields.has("loyaltyPoints");
  try {
    const { data } = await shopApi<{ activeCustomer: VCustomer | null }>(
      `{ activeCustomer { firstName lastName emailAddress phoneNumber ${points ? "customFields { loyaltyPoints }" : ""} } }`,
      {},
      { token },
    );
    const c = data.activeCustomer;
    if (!c) return null;
    return {
      firstName: c.firstName,
      lastName: c.lastName,
      name: [c.firstName, c.lastName].filter(Boolean).join(" "),
      email: c.emailAddress,
      phone: c.phoneNumber ?? "",
      loyaltyPoints: points ? (c.customFields?.loyaltyPoints ?? 0) : null,
    };
  } catch (err) {
    console.error("[account] member lookup failed", err);
    return null;
  }
});

type VOrderSummary = {
  code: string;
  state: string;
  orderPlacedAt: string | null;
  createdAt: string;
  totalWithTax: number;
  payments: { state: string }[] | null;
  lines: { quantity: number; featuredAsset: { source: string } | null; productVariant: { sku: string; product: { name: string; featuredAsset: { source: string } | null } } }[];
};

/** The member's placed orders, newest first. */
export async function getMemberOrders(take = 50): Promise<MemberOrder[]> {
  const token = await getSessionToken();
  if (!token) return [];
  const { data } = await shopApi<{ activeCustomer: { orders: { items: VOrderSummary[] } } | null }>(
    `query($take: Int!) { activeCustomer { orders(options: { filter: { active: { eq: false } }, sort: { orderPlacedAt: DESC }, take: $take }) {
      items { code state orderPlacedAt createdAt totalWithTax payments { state }
        lines { quantity featuredAsset { source } productVariant { sku product { name featuredAsset { source } } } } }
    } } }`,
    { take },
    { token },
  );
  return (data.activeCustomer?.orders.items ?? []).map((o) => ({
    code: o.code,
    placedAt: o.orderPlacedAt ?? o.createdAt,
    status: orderStatus(o),
    total: o.totalWithTax / 100,
    items: o.lines
      .filter((l) => l.productVariant.sku !== NAMES_SKU)
      .map((l) => ({ name: l.productVariant.product.name, quantity: l.quantity, image: (l.featuredAsset ?? l.productVariant.product.featuredAsset)?.source })),
  }));
}

/** The loyalty programme's rules and the member's points history, when the shop runs one. */
export async function getMemberLoyalty(): Promise<{ settings: LoyaltySettings; history: LoyaltyEntry[] } | null> {
  const caps = await getCapabilities();
  if (!caps.queries.has("loyaltyHistory") || !caps.queries.has("loyaltySettings")) return null;
  const token = await getSessionToken();
  if (!token) return null;
  try {
    const { data } = await shopApi<{ loyaltySettings: LoyaltySettings; loyaltyHistory: { items: LoyaltyEntry[] } }>(
      `{ loyaltySettings { pointsPerRinggit pointValueSen minRedeemPoints maxRedeemPercent }
         loyaltyHistory(options: { take: 20 }) { items { id createdAt points reason note orderCode } } }`,
      {},
      { token },
    );
    return { settings: data.loyaltySettings, history: data.loyaltyHistory.items };
  } catch (err) {
    console.error("[account] loyalty lookup failed", err);
    return null;
  }
}
