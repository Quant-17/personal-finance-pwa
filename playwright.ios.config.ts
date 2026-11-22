import { defineConfig } from "@playwright/test";
import base from "./playwright.private.config";

// WebKit engine with an iPhone-sized touch viewport; physical-device acceptance is separate.
export default defineConfig({
  ...base,
  grep: /iPhone|section menu starts|PKCE recovery|signed-out routes|new workspace is empty|offline and background locks|PDF statement stays local/,
  use: {
    ...base.use,
    browserName: "webkit",
    // Keep fake API interception deterministic across WebKit reloads.
    // PWA installation/cache checks run separately in Chromium and hosted preflight.
    serviceWorkers: "block",
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_WEBKIT_EXECUTABLE_PATH,
    },
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  },
});
