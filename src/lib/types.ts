// Core domain types for the Moire Co. storefront.
// Keep these in sync with supabase/schema.sql.

export type CategorySlug = "festive" | "fixed-gifts" | "wine-spirits";

/**
 * A festival inside the Festive Collection (Chinese New Year, Hari Raya, …).
 * Stored as data (Admin → Festivals), not hard-coded, so the client can rename,
 * add, hide and reorder festivals. Products point to one with `festivalId`.
 */
export interface Festival {
  /** Stable id used by products. Never changes after creation. */
  id: string;
  name: string;
  /** URL segment: /festive/{slug} */
  slug: string;
  description?: string;
  coverImage?: ProductImage | null;
  /** false = hidden from the storefront (its products stay in the catalogue). */
  active: boolean;
  /** Lower first. */
  sort: number;
  updatedAt?: string;
}

/**
 * active = purchasable; sold_out = visible but not purchasable; hidden = not shown on storefront.
 * A product with stock <= 0 is also treated as sold out (see isSoldOut in catalog.ts).
 */
export type ProductStatus = "active" | "sold_out" | "hidden";

export interface ProductImage {
  /** Absolute URL (Unsplash placeholder, Supabase Storage, or /api/uploads/...) */
  src: string;
  alt: string;
  /** Intrinsic ratio of the source, used to pick sensible crops. */
  width?: number;
  height?: number;
  /** Photo credit for placeholder imagery. Remove when real photography is uploaded. */
  credit?: string;
}

export interface ProductVariant {
  id: string;
  /** Backend (Vendure) SKU; names are linked to their gift by it. */
  sku?: string;
  name: string;
  /** Full price in MYR for this variant (not a surcharge). */
  price: number;
  /** Optional one-line note shown under the option, e.g. what the upgrade adds. */
  note?: string;
  containsAlcohol?: boolean;
}

/**
 * Personalised name. Every product offers one (DEFAULT_PERSONALISATION in catalog.ts);
 * a product's own settings replace the default when enabled.
 */
export interface Personalisation {
  enabled: boolean;
  /** Label shown to the customer, e.g. "Personalised name". */
  label: string;
  /** Short explanation of where the name appears, e.g. "Engraved on the lid." */
  helper?: string;
  /** Characters allowed per name. */
  maxLength: number;
  /** Charge per name in MYR. 0 = no charge shown. */
  fee: number;
}

export interface SpecRow {
  label: string;
  value: string;
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  category: CategorySlug;
  /** Festival this product belongs to (Festive Collection only). References Festival.id. */
  festivalId?: string | null;
  status: ProductStatus;
  /**
   * Units in stock. Website orders deduct automatically once paid; the client adjusts it
   * manually in Admin for WhatsApp / Instagram / in-person sales. null/undefined = not tracked.
   */
  stock?: number | null;
  /** Shown when status is sold_out, e.g. "Season ended". */
  availabilityNote?: string;
  /** Base price in MYR. When variants exist, the first variant should match this. */
  price: number;
  /** One-line summary for cards. */
  summary: string;
  /** Longer description for the product page. */
  description: string;
  contents: string[];
  specs: SpecRow[];
  allergens?: string;
  storage?: string;
  images: ProductImage[];
  variants: ProductVariant[];
  personalisation?: Personalisation | null;
  /** Backend (Vendure) variant of a product without options: what goes in the order. */
  defaultVariant?: { id: string; sku: string };
  /** The backend says this product can't be personalised (every product can in demo mode). */
  noPersonalisation?: boolean;
  containsAlcohol: boolean;
  /** Show in the homepage section for its category. */
  featured: boolean;
  /** Lower first. */
  sort: number;
  createdAt: string;
  updatedAt: string;
}

export interface SiteSettings {
  /** Which festival (Festival.id) leads the homepage Festive section. */
  activeFestivalId: string;
  festiveTitle: string;
  festiveIntro: string;
  /** Hero copy */
  heroEyebrow: string;
  heroTitle: string;
  heroText: string;
  /** Flat delivery fee in MYR. */
  deliveryFee: number;
  /** Orders at or above this subtotal get free delivery. null = never. */
  freeDeliveryThreshold: number | null;
  /** Minimum days between order and the earliest selectable delivery date. */
  deliveryLeadDays: number;
  deliveryNote: string;
  /** International format without +, e.g. 60123456789 */
  whatsappNumber: string;
  contactEmail: string;
  /** Shown in the footer and on the confirmation page. */
  businessHours: string;
  /** Show the preview/test-mode notice in the footer and checkout. */
  showPreviewNotice: boolean;
  /** Personalised names can be ordered. Off = every product shows the option as “Coming soon”. */
  personalisationLive?: boolean;
}

export type PaymentMethod = "fpx" | "card" | "ewallet";

export type OrderStatus =
  | "pending_payment"
  | "payment_failed"
  | "paid"
  | "preparing"
  | "out_for_delivery"
  | "completed"
  | "cancelled";

export interface OrderItem {
  productId: string;
  slug: string;
  name: string;
  variantId?: string;
  variantName?: string;
  image?: string;
  unitPrice: number;
  /** Charge per name (see personalisationCount). */
  personalisationFee: number;
  quantity: number;
  /** unitPrice × quantity, plus personalisationFee × personalisationCount. */
  lineTotal: number;
  /** Name(s) in capitals. Bulk orders list them in order: "1. JASON 2. EMILY". */
  personalisation?: string;
  personalisationLabel?: string;
  /** How many names the customer paid for. */
  personalisationCount?: number;
  giftMessage?: string;
  containsAlcohol: boolean;
}

export interface Address {
  line1: string;
  line2?: string;
  postcode: string;
  city: string;
  state: string;
}

export interface Order {
  id: string;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
  customer: { name: string; email: string; phone: string };
  recipient: { name: string; phone: string };
  address: Address;
  deliveryDate?: string;
  deliveryNotes?: string;
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  payment: {
    /** "online" when a hosted gateway took the payment and didn't say which method was used. */
    method: PaymentMethod | "online";
    provider: string;
    reference?: string;
    paidAt?: string;
    failureReason?: string;
  };
  ageConfirmed: boolean;
  internalNotes?: string;
}

export type EnquiryType = "semi-curated" | "bespoke";
export type EnquiryStatus = "new" | "in_progress" | "quoted" | "confirmed" | "closed";

export interface EnquiryItem {
  productId: string;
  name: string;
  unitPrice: number;
  quantity: number;
}

export interface Enquiry {
  id: string;
  type: EnquiryType;
  status: EnquiryStatus;
  createdAt: string;
  updatedAt: string;
  contact: { name: string; company?: string; email: string; phone: string };
  /** semi-curated only */
  items?: EnquiryItem[];
  customisation?: {
    companyNameOnCard?: string;
    cardMessage?: string;
    logoOnPackaging?: boolean;
    notes?: string;
  };
  /** bespoke only */
  style?: string;
  budgetPerGift?: string;
  quantity?: number;
  deliveryDate?: string;
  deliveryAddress?: string;
  multipleAddresses?: boolean;
  notes?: string;
  internalNotes?: string;
}

export interface CartLine {
  /** Stable key derived from product + variant + personalisation + message */
  key: string;
  productId: string;
  slug: string;
  variantId?: string;
  quantity: number;
  personalisation?: string;
  /** Number of names, charged per name. Only set with `personalisation`. */
  personalisationCount?: number;
  giftMessage?: string;
  /** Display snapshot taken when added. Prices are always re-validated on the server at checkout. */
  snapshot: {
    name: string;
    image?: string;
    variantName?: string;
    /** Price of one item, without names. */
    unitPrice: number;
    /** Charge per name. */
    personalisationFee?: number;
    personalisationLabel?: string;
    containsAlcohol: boolean;
  };
}

/** Server-validated view of a cart line. */
export interface QuotedLine {
  key: string;
  ok: boolean;
  problem?: string;
  item?: OrderItem;
}

export interface Quote {
  lines: QuotedLine[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  containsAlcohol: boolean;
  hasProblems: boolean;
}
