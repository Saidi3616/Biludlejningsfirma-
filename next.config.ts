import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { securityHeaders } from "./src/config/security-headers";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Canonical, hreflang og sitemap bygges ind i de statiske sider ved build (M16), så production
// skal kende sin egen adresse allerede her.
if (process.env.APP_ENV === "production" && !process.env.AUTH_URL) {
  throw new Error("AUTH_URL skal være sat ved build i production (fx https://www.example.dk)");
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  output: "standalone",
  images: {
    // AVIF er mindst; WebP til ældre browsere. Bilbillederne ændres aldrig under samme adresse.
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },
  experimental: {
    // Fotos fra inspektioner uploades ét ad gangen og skaleres ned i browseren først.
    serverActions: { bodySizeLimit: "6mb" },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders({ dev: process.env.NODE_ENV === "development" }),
      },
      {
        // Service workeren skal altid hentes frisk, så en ny version når ud med det samme.
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
