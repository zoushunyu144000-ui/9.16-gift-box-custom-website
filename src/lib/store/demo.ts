import { promises as fs } from "node:fs";
import path from "node:path";
import { seedFestivals, seedProducts, seedSettings } from "@/data/seed";
import type { Enquiry, Festival, Order, Product, SiteSettings } from "@/lib/types";
import { normalizeProduct, normalizeSettings } from "./normalize";
import type { Store } from "./types";

/**
 * Demo store — used automatically when Supabase is not configured.
 *
 * Data lives in a JSON file. Locally this is `.data/` in the project and persists.
 * On serverless hosting (Vercel) it is written to /tmp, which is per-instance and
 * temporary: fine for a client preview, NOT for real trading. Connect Supabase before launch.
 */

interface State {
  version: number;
  products: Product[];
  festivals: Festival[];
  settings: SiteSettings;
  orders: Order[];
  enquiries: Enquiry[];
}

const STATE_VERSION = 2;

export const DATA_DIR = process.env.DATA_DIR || (process.env.VERCEL ? "/tmp/moire-data" : path.join(process.cwd(), ".data"));
const FILE = path.join(DATA_DIR, "store.json");
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");

function fresh(): State {
  return {
    version: STATE_VERSION,
    products: structuredClone(seedProducts),
    festivals: structuredClone(seedFestivals),
    settings: structuredClone(seedSettings),
    orders: [],
    enquiries: [],
  };
}

let memory: State | null = null;
let writing: Promise<void> = Promise.resolve();

async function load(): Promise<State> {
  try {
    const raw = await fs.readFile(FILE, "utf8");
    const parsed = JSON.parse(raw) as State;
    if (parsed.version === 1) {
      // v1 → v2: festivals become data; products keep their festival via festivalId.
      parsed.products = parsed.products.map(normalizeProduct);
      parsed.festivals = structuredClone(seedFestivals);
      parsed.settings = { ...seedSettings, ...normalizeSettings(parsed.settings) };
      parsed.version = STATE_VERSION;
    }
    if (parsed.version !== STATE_VERSION) throw new Error("stale");
    memory = parsed;
  } catch {
    if (!memory) memory = fresh();
  }
  return memory;
}

async function persist(state: State) {
  memory = state;
  writing = writing.then(async () => {
    try {
      await fs.mkdir(DATA_DIR, { recursive: true });
      const tmp = `${FILE}.${process.pid}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(state));
      await fs.rename(tmp, FILE);
    } catch (err) {
      console.warn("[demo-store] could not persist state", err);
    }
  });
  await writing;
}

async function mutate<T>(fn: (s: State) => T): Promise<T> {
  const state = await load();
  const result = fn(state);
  await persist(state);
  return result;
}

function upsert<T extends { id: string }>(list: T[], item: T) {
  const i = list.findIndex((x) => x.id === item.id);
  if (i === -1) list.push(item);
  else list[i] = item;
}

export const demoStore: Store = {
  kind: "demo",

  async listProducts() {
    return (await load()).products;
  },
  async getProductBySlug(slug) {
    return (await load()).products.find((p) => p.slug === slug) ?? null;
  },
  async getProductById(id) {
    return (await load()).products.find((p) => p.id === id) ?? null;
  },
  async saveProduct(product) {
    return mutate((s) => {
      upsert(s.products, product);
      return product;
    });
  },
  async deleteProduct(id) {
    await mutate((s) => {
      s.products = s.products.filter((p) => p.id !== id);
    });
  },
  async adjustStock(productId, delta) {
    await mutate((s) => {
      const p = s.products.find((x) => x.id === productId);
      if (!p || typeof p.stock !== "number") return;
      p.stock = Math.max(0, p.stock + delta);
      p.updatedAt = new Date().toISOString();
    });
  },

  async listFestivals() {
    return (await load()).festivals;
  },
  async saveFestival(festival) {
    return mutate((s) => {
      upsert(s.festivals, festival);
      return festival;
    });
  },
  async deleteFestival(id) {
    await mutate((s) => {
      s.festivals = s.festivals.filter((f) => f.id !== id);
    });
  },

  async getSettings() {
    return { ...seedSettings, ...normalizeSettings((await load()).settings) };
  },
  async saveSettings(settings) {
    return mutate((s) => {
      s.settings = settings;
      return settings;
    });
  },

  async createOrder(order) {
    return mutate((s) => {
      s.orders.unshift(order);
      return order;
    });
  },
  async getOrder(id) {
    return (await load()).orders.find((o) => o.id === id) ?? null;
  },
  async saveOrder(order) {
    return mutate((s) => {
      upsert(s.orders, order);
      return order;
    });
  },
  async listOrders() {
    return [...(await load()).orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async createEnquiry(enquiry) {
    return mutate((s) => {
      s.enquiries.unshift(enquiry);
      return enquiry;
    });
  },
  async getEnquiry(id) {
    return (await load()).enquiries.find((e) => e.id === id) ?? null;
  },
  async saveEnquiry(enquiry) {
    return mutate((s) => {
      upsert(s.enquiries, enquiry);
      return enquiry;
    });
  },
  async listEnquiries() {
    return [...(await load()).enquiries].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async saveUpload(fileName, data) {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    await fs.writeFile(path.join(UPLOAD_DIR, fileName), data);
    return `/api/uploads/${encodeURIComponent(fileName)}`;
  },
};
