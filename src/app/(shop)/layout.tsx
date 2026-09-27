import { CartDrawer } from "@/components/cart/cart-drawer";
import { CartProvider } from "@/components/cart/cart-context";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { RevealObserver } from "@/components/reveal";
import { formatRM } from "@/lib/catalog";
import { getStore } from "@/lib/store";

export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const settings = await (await getStore()).getSettings();
  const deliveryNote =
    settings.freeDeliveryThreshold != null
      ? `Delivery ${formatRM(settings.deliveryFee)}, free on orders from ${formatRM(settings.freeDeliveryThreshold)}.`
      : `Delivery ${formatRM(settings.deliveryFee)} is added at checkout.`;

  return (
    <CartProvider>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:bg-ink focus:px-4 focus:py-2 focus:text-ivory">
        Skip to content
      </a>
      <Header />
      <main id="main">{children}</main>
      <Footer settings={settings} />
      <CartDrawer deliveryNote={deliveryNote} />
      <RevealObserver />
    </CartProvider>
  );
}
