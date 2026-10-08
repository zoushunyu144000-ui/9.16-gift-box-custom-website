import { getCatalog, getFestivals, getSettings } from "@/lib/vendure/catalog";
import type { Store } from "./types";

const MANAGED_IN_BACKEND = "Products, festivals, settings, orders and enquiries are managed in the commerce backend's dashboard.";
const unsupported = async (): Promise<never> => {
  throw new Error(MANAGED_IN_BACKEND);
};

/**
 * The commerce backend (Vendure) as the storefront's store. Pages only read from it here; orders,
 * payments and enquiries go through the backend's own APIs (src/lib/vendure), and staff edit
 * everything in its dashboard.
 */
export const vendureStore: Store = {
  kind: "vendure",

  async listProducts() {
    return (await getCatalog()).products;
  },
  async getProductBySlug(slug) {
    return (await getCatalog()).products.find((p) => p.slug === slug) ?? null;
  },
  async getProductById(id) {
    return (await getCatalog()).products.find((p) => p.id === id) ?? null;
  },
  listFestivals: getFestivals,
  getSettings,

  saveProduct: unsupported,
  deleteProduct: unsupported,
  adjustStock: unsupported,
  saveFestival: unsupported,
  deleteFestival: unsupported,
  saveSettings: unsupported,
  createOrder: unsupported,
  async getOrder() {
    return null;
  },
  saveOrder: unsupported,
  async listOrders() {
    return [];
  },
  createEnquiry: unsupported,
  async getEnquiry() {
    return null;
  },
  saveEnquiry: unsupported,
  async listEnquiries() {
    return [];
  },
  saveUpload: unsupported,
};
