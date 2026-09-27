import type { Metadata, Viewport } from "next";
import "@fontsource-variable/jost";
import "@fontsource-variable/lora";
import "@fontsource-variable/lora/wght-italic.css";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Moire Co. — Premium gift boxes, Kuala Lumpur",
    template: "%s · Moire Co.",
  },
  description: "Festive gift boxes, everyday gifts, wine & spirits and corporate gifting from Kuala Lumpur.",
  icons: { icon: "/icon.svg" },
  other: { google: "notranslate" },
  openGraph: {
    type: "website",
    siteName: "Moire Co.",
    locale: "en_MY",
  },
};

export const viewport: Viewport = {
  themeColor: "#faf7f1",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-MY" translate="no" suppressHydrationWarning>
      <body className="min-h-dvh">
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
        {children}
      </body>
    </html>
  );
}
