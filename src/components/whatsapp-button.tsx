"use client";

import { usePathname } from "next/navigation";
import { whatsappLink } from "@/lib/catalog";

// Pages with their own bottom actions where a floating button would sit over the main button.
const HIDDEN_ON = ["/cart", "/checkout"];

/**
 * Floating WhatsApp button, bottom right on every storefront page.
 * Lifts above the product page's mobile "Add to bag" bar via --bottom-bar-h (set by PurchasePanel).
 */
export function WhatsAppButton({ number }: { number: string }) {
  const pathname = usePathname();
  if (!number || HIDDEN_ON.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null;

  return (
    <a
      href={whatsappLink(number, "Hello Moire Co., I have a question about a gift.")}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with Moire Co. on WhatsApp"
      title="WhatsApp"
      className="wa-float fixed right-4 z-30 grid h-[52px] w-[52px] place-items-center rounded-full bg-[#25d366] text-white shadow-[0_6px_18px_-6px_rgb(31_28_24/0.45)] transition-[transform,bottom,box-shadow] duration-300 ease-out-soft hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-8px_rgb(31_28_24/0.5)] active:scale-95 md:right-6 md:h-14 md:w-14"
    >
      <svg viewBox="0 0 32 32" className="h-[27px] w-[27px] md:h-[29px] md:w-[29px]" fill="currentColor" aria-hidden="true">
        <path d="M16.004 3.2C8.94 3.2 3.2 8.94 3.2 16c0 2.256.59 4.46 1.712 6.404L3.2 28.8l6.566-1.69A12.75 12.75 0 0 0 16.004 28.8C23.064 28.8 28.8 23.06 28.8 16S23.064 3.2 16.004 3.2Zm0 23.36c-1.98 0-3.92-.532-5.61-1.538l-.402-.24-3.896 1.004 1.04-3.8-.262-.39A10.53 10.53 0 0 1 5.44 16c0-5.824 4.74-10.56 10.564-10.56 5.82 0 10.556 4.736 10.556 10.56 0 5.824-4.736 10.56-10.556 10.56Zm5.79-7.908c-.316-.158-1.874-.924-2.164-1.03-.29-.106-.502-.158-.712.158-.21.316-.818 1.03-1.002 1.24-.184.212-.37.238-.686.08-.316-.158-1.336-.492-2.544-1.57-.94-.838-1.574-1.874-1.758-2.19-.184-.316-.02-.486.138-.644.142-.142.316-.37.474-.554.158-.184.21-.316.316-.528.106-.21.052-.396-.026-.554-.08-.158-.712-1.716-.976-2.35-.256-.616-.518-.532-.712-.542l-.606-.01c-.21 0-.554.08-.844.396-.29.316-1.108 1.082-1.108 2.64 0 1.56 1.134 3.064 1.292 3.276.158.21 2.232 3.408 5.408 4.778.756.326 1.346.52 1.806.666.758.242 1.448.208 1.994.126.608-.09 1.874-.766 2.138-1.506.264-.738.264-1.372.184-1.504-.078-.132-.29-.21-.606-.37Z" />
      </svg>
    </a>
  );
}
