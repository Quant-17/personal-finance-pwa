import { defineConfig } from "@playwright/test";
const deploymentURL = process.env.PLAYWRIGHT_BASE_URL;
const proxy = process.env.PLAYWRIGHT_PROXY_SERVER
  ? new URL(process.env.PLAYWRIGHT_PROXY_SERVER)
  : undefined;
export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  use: {
    baseURL: deploymentURL ?? "http://127.0.0.1:4173",
    proxy: proxy
      ? {
          server: proxy.origin,
          username: decodeURIComponent(proxy.username),
          password: decodeURIComponent(proxy.password),
        }
      : undefined,
    browserName: "chromium",
    serviceWorkers: "allow",
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    },
  },
  webServer: deploymentURL
    ? undefined
    : {
        command: "npm run preview -- --port 4173",
        url: "http://127.0.0.1:4173",
        reuseExistingServer: !process.env.CI,
      },
});
