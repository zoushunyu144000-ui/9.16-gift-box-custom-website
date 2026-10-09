import { CartDrawer } from "@/components/cart/cart-drawer";
import { CartProvider } from "@/components/cart/cart-context";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { RevealObserver } from "@/components/reveal";
import { WhatsAppButton } from "@/components/whatsapp-button";
import { formatRM } from "@/lib/catalog";
import { getStore, isVendureConfigured } from "@/lib/store";

export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const settings = await (await getStore()).getSettings();
  const deliveryNote = settings.deliveryByAddress
    ? "Delivery is priced for your address at checkout."
    : settings.freeDeliveryThreshold != null
      ? `Delivery ${formatRM(settings.deliveryFee)}, free on orders from ${formatRM(settings.freeDeliveryThreshold)}.`
      : `Delivery ${formatRM(settings.deliveryFee)} is added at checkout.`;

  return (
    <CartProvider>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:bg-ink focus:px-4 focus:py-2 focus:text-ivory">
        Skip to content
      </a>
      <Header accounts={isVendureConfigured} />
      {/* Space above the footer; a page that ends in a full-width band (the homepage) marks it
          with data-flush-footer so no strip of background shows between that band and the footer. */}
      <main id="main" className="pb-24 md:pb-32 has-[[data-flush-footer]]:pb-0">
        {children}
      </main>
      <Footer settings={settings} />
      <WhatsAppButton number={settings.whatsappNumber} />
      <CartDrawer deliveryNote={deliveryNote} />
      <RevealObserver />
    </CartProvider>
  );
}
