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
