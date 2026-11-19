import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  build: {
    rollupOptions: { output: { manualChunks: { charts: ["recharts"] } } },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["icons/apple-touch-icon.png", "icons/icon.svg"],
      manifest: {
        name: "Folio · Personal Finance",
        short_name: "Folio",
        description:
          "Your money, thoughtfully managed. A synthetic finance prototype.",
        theme_color: "#7460d4",
        background_color: "#f6f7fb",
        display: "standalone",
        start_url: "/",
        scope: "/",
        lang: "en-IN",
        icons: [
          {
            src: "/icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icons/maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        // Only precache the static shell. No runtime/API response caches.
        runtimeCaching: [],
        navigateFallbackDenylist: [/^\/api\//, /^\/auth\//],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
