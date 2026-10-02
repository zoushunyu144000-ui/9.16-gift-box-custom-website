import type { Enquiry, Festival, Order, Product, SiteSettings } from "@/lib/types";

export interface Store {
  /** "supabase" in production; "demo" when no database is configured (preview only). */
  readonly kind: "demo" | "supabase";

  listProducts(): Promise<Product[]>;
  getProductBySlug(slug: string): Promise<Product | null>;
  getProductById(id: string): Promise<Product | null>;
  saveProduct(product: Product): Promise<Product>;
  deleteProduct(id: string): Promise<void>;
  /**
   * Add `delta` to a product's stock (negative to deduct), never below 0.
   * No-op when the product doesn't track stock. Used after a website order is paid.
   */
  adjustStock(productId: string, delta: number): Promise<void>;

  listFestivals(): Promise<Festival[]>;
  saveFestival(festival: Festival): Promise<Festival>;
  deleteFestival(id: string): Promise<void>;

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
