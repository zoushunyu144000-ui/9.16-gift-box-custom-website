import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // Renamed 2026-10: the site presents wine as gift boxes, not as a standalone product.
      { source: "/wine-spirits", destination: "/wine-gift-boxes", permanent: true },
    ];
  },
};

export default nextConfig;
