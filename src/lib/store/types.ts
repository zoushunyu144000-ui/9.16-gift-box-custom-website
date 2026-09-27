import type { Enquiry, Order, Product, SiteSettings } from "@/lib/types";

export interface Store {
  /** "supabase" in production; "demo" when no database is configured (preview only). */
  readonly kind: "demo" | "supabase";

  listProducts(): Promise<Product[]>;
  getProductBySlug(slug: string): Promise<Product | null>;
  getProductById(id: string): Promise<Product | null>;
  saveProduct(product: Product): Promise<Product>;
  deleteProduct(id: string): Promise<void>;

  getSettings(): Promise<SiteSettings>;
  saveSettings(settings: SiteSettings): Promise<SiteSettings>;

  createOrder(order: Order): Promise<Order>;
  getOrder(id: string): Promise<Order | null>;
  saveOrder(order: Order): Promise<Order>;
  listOrders(): Promise<Order[]>;

  createEnquiry(enquiry: Enquiry): Promise<Enquiry>;
  getEnquiry(id: string): Promise<Enquiry | null>;
  saveEnquiry(enquiry: Enquiry): Promise<Enquiry>;
  listEnquiries(): Promise<Enquiry[]>;

  /** Store an (already optimised) image and return its public URL. */
  saveUpload(fileName: string, data: Buffer, contentType: string): Promise<string>;
}
