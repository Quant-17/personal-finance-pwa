import { defineConfig, loadEnv } from "vite";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateClientConfiguration } from "./src/private/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const appMode = env.VITE_APP_MODE ?? "demo";
  if (!["demo", "private"].includes(appMode))
    throw new Error("VITE_APP_MODE must be demo or private.");
  if (Object.keys(env).some((key) => /VITE_.*(SERVICE_ROLE|SECRET)/i.test(key)))
    throw new Error("Never expose secret keys through VITE_ variables.");
  const configError = validateClientConfiguration({
    mode: appMode as "demo" | "private",
    url: env.VITE_SUPABASE_URL,
    key: env.VITE_SUPABASE_PUBLISHABLE_KEY,
  });
  if (command === "build" && configError) throw new Error(configError);
  return {
    build: {
      rollupOptions: { output: { manualChunks: { charts: ["recharts"] } } },
    },
    plugins: [
      react(),
      {
        name: "private-workspace-headers",
        writeBundle(options) {
          if (appMode !== "private" || configError) return;
          const path = resolve(options.dir ?? "dist", "_headers");
          const origin = new URL(env.VITE_SUPABASE_URL).origin;
          writeFileSync(
            path,
            readFileSync(path, "utf8").replace(
              "connect-src 'self';",
              `connect-src 'self' ${origin};`,
            ),
          );
        },
      },
      VitePWA({
        registerType: "prompt",
        includeAssets: ["icons/apple-touch-icon.png", "icons/icon.svg"],
        manifest: {
          name: "Folio · Personal Finance",
          short_name: "Folio",
          description:
            appMode === "private"
              ? "Your private personal finance workspace."
              : "Your money, thoughtfully managed. A synthetic finance prototype.",
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
  };
});
