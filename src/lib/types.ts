// Core domain types for the Moire Co. storefront.
// Keep these in sync with supabase/schema.sql.

export type CategorySlug = "festive" | "fixed-gifts" | "wine-spirits";

export type Occasion = "chinese-new-year" | "mid-autumn" | "dragon-boat" | "hari-raya";

/** active = purchasable; sold_out = visible but not purchasable; hidden = not shown on storefront */
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
  name: string;
  /** Full price in MYR for this variant (not a surcharge). */
  price: number;
  /** Optional one-line note shown under the option, e.g. what the upgrade adds. */
  note?: string;
  containsAlcohol?: boolean;
}

export interface Personalisation {
  enabled: boolean;
  /** Label shown to the customer, e.g. "Engraved name". */
  label: string;
  /** Short explanation of where the text appears. */
  helper?: string;
  maxLength: number;
  /** Additional charge per unit in MYR. 0 = included. */
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
  occasion?: Occasion | null;
  status: ProductStatus;
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
  containsAlcohol: boolean;
  /** Show in the homepage section for its category. */
  featured: boolean;
  /** Lower first. */
  sort: number;
  createdAt: string;
  updatedAt: string;
}

export interface SiteSettings {
  /** Which occasion leads the homepage and the Festive page. */
  activeOccasion: Occasion;
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
  personalisationFee: number;
  quantity: number;
  lineTotal: number;
  personalisation?: string;
  personalisationLabel?: string;
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
    method: PaymentMethod;
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
  giftMessage?: string;
  /** Display snapshot taken when added. Prices are always re-validated on the server at checkout. */
  snapshot: {
    name: string;
    image?: string;
    variantName?: string;
    unitPrice: number;
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
