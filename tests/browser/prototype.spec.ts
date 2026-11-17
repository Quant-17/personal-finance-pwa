import { expect, test } from "@playwright/test";

test("scenario comparison, validation, navigation and export", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "A little clarity. A lot of possibility.",
    }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Buy simulator" }).click();
  // Wait for the full route: the dashboard also contains a simulator.
  await expect(
    page.getByRole("heading", { name: "Big purchase. Clear perspective." }),
  ).toBeVisible();
  await page.getByLabel("Purchase price").fill("100000");
  await page.getByLabel("Annual interest (%)").fill("12");
  await page.getByLabel("EMI tenure (months)").fill("12");
  await expect(
    page.getByRole("button", { name: /Monthly EMI ₹8,884.88/ }),
  ).toBeVisible();
  await page.getByLabel("Payment method").selectOption("cash");
  await expect(
    page.getByText(/below your ₹1,50,000 emergency reserve/),
  ).toBeVisible();
  await page.getByRole("button", { name: /Skip for now/ }).click();
  await expect(
    page.getByText("₹64,000 left in your monthly plan."),
  ).toBeVisible();
  await page.getByRole("button", { name: /Save & buy later/ }).click();
  await page.getByLabel("Save before buying").selectOption("12");
  await expect(
    page.getByRole("button", { name: /Save & buy later ₹8,333/ }),
  ).toBeVisible();
  await page.getByLabel("Purchase price").fill("abc");
  await expect(page.getByRole("alert")).toContainText("Enter a price");
  await expect(
    page.getByText("Complete the inputs to see your purchase comparison."),
  ).toBeVisible();
  await page.getByRole("link", { name: "Accounts", exact: true }).click();
  await expect(page.getByText("No real accounts connected")).toBeVisible();
  await page.getByRole("link", { name: "Budgets & goals" }).click();
  await expect(
    page.getByText("Sample budgets and goals are read-only."),
  ).toBeVisible();
  await page.getByRole("link", { name: "Transactions" }).click();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export demo" }).click();
  expect((await downloaded).suggestedFilename()).toBe(
    "folio-demo-transactions.csv",
  );
  expect(errors).toEqual([]);
});

test("mobile navigation and appearance persist without overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("folio-theme", "light"));
  await page.reload();
  await expect(page.locator("html")).not.toHaveClass("dark");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "Dark appearance" }).click();
  await page.getByRole("link", { name: "Buy simulator" }).click();
  // Wait for the full route: the dashboard also contains a simulator.
  await expect(
    page.getByRole("heading", { name: "Big purchase. Clear perspective." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open navigation" }),
  ).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("html")).toHaveClass("dark");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.reload();
  await expect(page.locator("html")).toHaveClass("dark");
  await expect(
    page.getByRole("heading", { name: "Big purchase. Clear perspective." }),
  ).toBeVisible();
});

test("manifest and precached shell work offline", async ({ page, context }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  const manifest = await (
    await page.request.get("/manifest.webmanifest")
  ).json();
  expect(manifest.display).toBe("standalone");
  for (const icon of manifest.icons)
    expect((await page.request.get(icon.src)).ok()).toBe(true);
  const cached = await page.evaluate(async () => {
    const names = await caches.keys();
    return (
      await Promise.all(
        names.map(async (name) =>
          (await (await caches.open(name)).keys()).map((r) => r.url),
        ),
      )
    ).flat();
  });
  expect(
    cached.some((url) => url.includes("/api/") || url.includes("supabase")),
  ).toBe(false);
  expect(cached.some((url) => url.includes("/assets/"))).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "A little clarity. A lot of possibility.",
    }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toContainText("You’re offline");
  await page.getByRole("link", { name: "Buy simulator" }).click();
  // Wait for the full route: the dashboard also contains a simulator.
  await expect(
    page.getByRole("heading", { name: "Big purchase. Clear perspective." }),
  ).toBeVisible();
  await page.getByLabel("Purchase price").fill("15000");
  await expect(
    page.getByRole("button", { name: /Pay in full ₹15,000/ }),
  ).toBeVisible();
  await context.setOffline(false);
});

test("capture review previews", async ({ page }) => {
  // Three full-page PNGs can exceed the default 30s on a constrained cloud worker.
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("folio-theme", "light"));
  await page.reload();
  await page.screenshot({
    path: "test-results/dashboard-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/dashboard-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "Dark appearance" }).click();
  await page.getByRole("link", { name: "Buy simulator" }).click();
  // Wait for the full route: the dashboard also contains a simulator.
  await expect(
    page.getByRole("heading", { name: "Big purchase. Clear perspective." }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/simulator-mobile-dark.png",
    fullPage: true,
    animations: "disabled",
  });
});

test("purchase inputs survive route changes but reset on refresh", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Purchase price").fill("99000.50");
  await page.getByLabel("Annual interest (%)").fill("7.5");
  await page.getByLabel("EMI tenure (months)").fill("24");
  await page.getByLabel("Payment method").selectOption("delay");
  await page.getByRole("button", { name: "Open full simulator" }).click();
  await expect(
    page.getByRole("heading", { name: "Big purchase. Clear perspective." }),
  ).toBeVisible();
  await expect(page.getByLabel("Purchase price")).toHaveValue("99000.50");
  await expect(page.getByLabel("Annual interest (%)")).toHaveValue("7.5");
  await expect(page.getByLabel("EMI tenure (months)")).toHaveValue("24");
  await expect(page.getByLabel("Payment method")).toHaveValue("delay");
  await page.getByLabel("Save before buying").selectOption("3");
  await page.getByRole("link", { name: "Accounts", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Everything has its place." }),
  ).toBeVisible();
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "Big purchase. Clear perspective." }),
  ).toBeVisible();
  await expect(page.getByLabel("Purchase price")).toHaveValue("99000.50");
  await expect(page.getByLabel("Save before buying")).toHaveValue("3");
  await page.reload();
  await expect(page.getByLabel("Purchase price")).toHaveValue("85000");
});

test("mobile navigation opens the destination at the top", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "A little clarity. A lot of possibility.",
    }),
  ).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(500);
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("link", { name: "Budgets & goals" }).click();
  await expect(
    page.getByRole("heading", { name: "Make room for your goals." }),
  ).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
});

test("deployed responses retain security headers and installable assets", async ({
  request,
}) => {
  test.skip(
    !process.env.PLAYWRIGHT_BASE_URL,
    "Vite preview does not apply Cloudflare's _headers rules; use a published URL.",
  );
  const document = await request.get("/");
  expect(document.ok()).toBe(true);
  const html = await document.text();
  const assetPaths = [
    ...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g),
  ].map((match) => match[1]);
  expect(assetPaths.length).toBeGreaterThan(0);
  for (const path of assetPaths) {
    const asset = await request.get(path);
    expect(asset.ok(), `Missing deployed entry asset: ${path}`).toBe(true);
    expect(asset.headers()["content-type"]).toContain(
      path.endsWith(".css") ? "text/css" : "javascript",
    );
  }
  const headers = document.headers();
  expect(headers["content-security-policy"]).toContain(
    "frame-ancestors 'none'",
  );
  expect(headers["content-security-policy"]).toContain("connect-src 'self'");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  const manifestResponse = await request.get("/manifest.webmanifest");
  expect(manifestResponse.ok()).toBe(true);
  expect(manifestResponse.headers()["content-type"]).toContain("json");
  const manifest = await manifestResponse.json();
  expect(manifest.start_url).toBe("/");
  expect(manifest.display).toBe("standalone");
  for (const icon of manifest.icons) {
    const response = await request.get(icon.src);
    expect(response.ok()).toBe(true);
    const bytes = await response.body();
    expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(`${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`).toBe(
      icon.sizes,
    );
  }
  const serviceWorker = await request.get("/sw.js");
  expect(serviceWorker.ok()).toBe(true);
  expect(serviceWorker.headers()["content-type"]).toContain("javascript");
  expect(serviceWorker.headers()["cache-control"]).toContain("no-cache");
});
