import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
const owner = "8bb04aa9-8910-4e90-89d7-91c4a51bf470";
const accountId = "fe3513e4-2c4b-4705-b1be-bcdf11f6914f";
const categoryId = "9a1574c0-1955-4b1e-b9e1-a86481b4ee90";
const user = {
  id: owner,
  aud: "authenticated",
  role: "authenticated",
  email: "fixture@example.invalid",
  email_confirmed_at: "2026-01-01T00:00:00Z",
  created_at: "2026-01-01T00:00:00Z",
  app_metadata: { provider: "email" },
  user_metadata: {},
  is_anonymous: false,
};
const token =
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
    "base64url",
  ) +
  "." +
  Buffer.from(
    JSON.stringify({ sub: owner, role: "authenticated", exp: 4102444800 }),
  ).toString("base64url") +
  ".fixture";
const session = {
  access_token: token,
  token_type: "bearer",
  expires_in: 3600,
  refresh_token: "fixture-refresh-token",
  user,
};
function snapshot(populated = false) {
  return {
    profile: {
      id: owner,
      display_name: "",
      monthly_income_paise: 5000000,
      monthly_living_budget_paise: 2000000,
      emergency_reserve_paise: 1000000,
    },
    accounts: populated
      ? [
          {
            id: accountId,
            name: "Fixture checking",
            type: "bank",
            opening_balance_paise: 2000000,
            opening_date: "2026-01-01",
            balance_paise: "2000000",
            archived_at: null,
          },
        ]
      : [],
    categories: [{ id: categoryId, name: "Food & groceries", kind: "expense" }],
    loans: [],
    subscriptions: [],
    budgets: [],
    goals: [],
    allocations: [],
    summary: {
      month: "2026-11-01",
      income_paise: "0",
      expense_paise: "0",
      loan_payments_paise: "0",
      liquid_cash_paise: populated ? "2000000" : "0",
      assets_paise: populated ? "2000000" : "0",
      net_worth_paise: populated ? "2000000" : "0",
      existing_emi_paise: "0",
    },
    cashflow: [{ month: "2026-11-01", income_paise: "0", outflow_paise: "0" }],
  };
}
async function mock(page: Page, populated = false, confirmed = true) {
  const calls: { path: string; body: Record<string, unknown> | null }[] = [];
  let data = snapshot(populated);
  await page.route("https://fixture.supabase.co/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const body = route.request().postDataJSON() as Record<
      string,
      unknown
    > | null;
    calls.push({ path, body });
    let response: unknown = null;
    if (path === "/auth/v1/token") response = session;
    else if (path === "/auth/v1/user")
      response = confirmed ? user : { ...user, email_confirmed_at: null };
    else if (path === "/rest/v1/rpc/workspace_snapshot") response = data;
    else if (
      path === "/rest/v1/transactions" ||
      path === "/rest/v1/debt_terms" ||
      path === "/rest/v1/audit_events"
    )
      response = [];
    else if (
      path === "/rest/v1/accounts" &&
      route.request().method() === "POST"
    ) {
      data = snapshot(true);
      data.accounts[0].name = String(body?.name);
    } else if (path === "/rest/v1/rpc/record_entry")
      response = crypto.randomUUID();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "cache-control": "no-store", "content-range": "*/0" },
      body: JSON.stringify(response),
    });
  });
  return calls;
}
async function navigate(page: Page, name: string) {
  await page.locator(".private-section-picker summary").click();
  await page.getByRole("link", { name, exact: true }).click();
}
async function login(page: Page) {
  await page.goto("/");
  await page.getByLabel("Email address").fill("fixture@example.invalid");
  await page.getByLabel("Password", { exact: true }).fill("a-fixture-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
}
test("signed-out routes are guarded and signup/reset are available", async ({
  page,
}) => {
  const calls = await mock(page);
  await page.goto("/#accounts");
  await expect(
    page.getByRole("heading", { name: "A little peace of mind." }),
  ).toBeVisible();
  expect(calls.some((c) => c.path.startsWith("/rest/"))).toBe(false);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
    "minlength",
    "12",
  );
  await page.getByRole("button", { name: "Back to sign in" }).click();
  await page.getByRole("button", { name: "Forgot password?" }).click();
  await expect(
    page.getByRole("button", { name: "Send reset link" }),
  ).toBeVisible();
});
test("new workspace is empty; account and paise-safe transaction forms use the API", async ({
  page,
}) => {
  const calls = await mock(page);
  await login(page);
  await expect(
    page.getByRole("heading", { name: "A fresh start for your finances." }),
  ).toBeVisible();
  await expect(page.getByText("Synthetic", { exact: false })).toHaveCount(0);
  await page.getByRole("button", { name: "Add your first account" }).click();
  await page.getByLabel("Account name").fill("Fixture bank");
  await page.getByLabel("Opening balance").fill("20000.29");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  expect(
    calls.find((c) => c.path === "/rest/v1/accounts")?.body
      ?.opening_balance_paise,
  ).toBe(2000029);
  await page
    .getByRole("button", { name: "Add transaction", exact: true })
    .click();
  await page.getByLabel("Amount (₹)", { exact: true }).fill("0.29");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  const mutation = calls.find((c) => c.path === "/rest/v1/rpc/record_entry");
  expect(mutation?.body?.p_amount_paise).toBe(29);
  expect(mutation?.body?.p_request_id).toMatch(/^[0-9a-f-]{36}$/);
});
test("offline and background locks remove private views; reconnect verifies again", async ({
  page,
  context,
  browserName,
}) => {
  const calls = await mock(page, true);
  await login(page);
  await navigate(page, "Accounts");
  await expect(
    page.getByRole("heading", { name: "Fixture checking" }),
  ).toBeVisible();
  // WebKit uses blocked service workers for deterministic fake API routing.
  if (browserName === "chromium") {
    // Finish initial static-shell installation before deliberately interrupting the network.
    await expect
      .poll(
        () =>
          page.evaluate(
            async () =>
              !!(await navigator.serviceWorker.getRegistration())?.active,
          ),
        { timeout: 15000 },
      )
      .toBe(true);
  }
  await context.setOffline(true);
  await expect(
    page.getByRole("heading", { name: "Workspace locked" }),
  ).toBeVisible();
  await expect(page.getByText("Fixture checking")).toHaveCount(0);
  await context.setOffline(false);
  await expect(
    page.getByRole("heading", { name: "Fixture checking" }),
  ).toBeVisible();
  const before = calls.filter((c) => c.path === "/auth/v1/user").length;
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      value: "hidden",
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(
    page.getByRole("heading", { name: "Workspace locked" }),
  ).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
  expect(
    calls.filter((c) => c.path === "/auth/v1/user").length,
  ).toBeGreaterThan(before);
  if (browserName === "chromium") {
    await expect
      .poll(() =>
        page.evaluate(
          async () =>
            !!(await navigator.serviceWorker.getRegistration())?.active,
        ),
      )
      .toBe(true);
  }
  const cached = await page.evaluate(async () =>
    (
      await Promise.all(
        (await caches.keys()).map(async (key) =>
          (await (await caches.open(key)).keys()).map((request) => request.url),
        ),
      )
    ).flat(),
  );
  expect(cached.some((url) => /supabase\.co/.test(url))).toBe(false);
});
test("signout clears session storage and prevents returning to records", async ({
  page,
}) => {
  const calls = await mock(page, true);
  await login(page);
  await navigate(page, "Accounts");
  await expect(page.getByText("Fixture checking")).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "A little peace of mind." }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).filter((key) => key.startsWith("folio-auth-")),
    ),
  ).toEqual([]);
  await expect
    .poll(() => calls.some((call) => call.path === "/auth/v1/logout"))
    .toBe(true);
  await page.goto("/#accounts");
  await expect(page.getByText("Fixture checking")).toHaveCount(0);
});
test("unconfirmed session cannot load financial APIs", async ({ page }) => {
  const calls = await mock(page, false, false);
  await page.goto("/");
  await page.getByLabel("Email address").fill("fixture@example.invalid");
  await page.getByLabel("Password", { exact: true }).fill("fixture");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByText("Confirm your email before opening the workspace."),
  ).toBeVisible();
  expect(calls.some((c) => c.path.startsWith("/rest/"))).toBe(false);
});
test("mobile workspace fits and simulator uses private plan", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await mock(page, true);
  await login(page);
  await navigate(page, "Buy simulator");
  await expect(page.getByText(/Planned monthly income/)).toBeVisible();
  await expect(page.getByText(/Fictional monthly income/)).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/private-mobile.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("PKCE recovery callback opens password change before financial requests", async ({
  page,
}) => {
  const calls = await mock(page);
  await page.addInitScript(() =>
    localStorage.setItem(
      "folio-auth-fixture-code-verifier",
      JSON.stringify("fixture-verifier/recovery"),
    ),
  );
  await page.goto("/?code=fixture-recovery");
  await expect(
    page.getByRole("heading", { name: "Set a new password." }),
  ).toBeVisible();
  expect(calls.some((c) => c.path.startsWith("/rest/"))).toBe(false);
  await page
    .getByLabel("Password", { exact: true })
    .fill("a-new-fixture-password");
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
  expect(
    calls.some(
      (c) =>
        c.path === "/auth/v1/user" &&
        c.body?.password === "a-new-fixture-password",
    ),
  ).toBe(true);
});
test("an unchanged failed transaction retries with the same request identifier", async ({
  page,
}) => {
  await mock(page, true);
  const identifiers: unknown[] = [];
  await page.route(
    "https://fixture.supabase.co/rest/v1/rpc/record_entry",
    async (route) => {
      identifiers.push(route.request().postDataJSON().p_request_id);
      await route.fulfill({
        status: identifiers.length === 1 ? 503 : 200,
        contentType: "application/json",
        body:
          identifiers.length === 1
            ? JSON.stringify({
                message: "Temporary interruption. Retry unchanged.",
              })
            : JSON.stringify(crypto.randomUUID()),
      });
    },
  );
  await login(page);
  await page
    .getByRole("button", { name: "Add transaction", exact: true })
    .click();
  await page.getByLabel("Amount (₹)", { exact: true }).fill("125.49");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByText("Temporary interruption. Retry unchanged."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  expect(identifiers).toHaveLength(2);
  expect(identifiers[0]).toBe(identifiers[1]);
});

test("saved comparisons retry safely, survive refresh, restore assumptions and delete without posting money", async ({
  page,
}) => {
  const calls = await mock(page, true);
  const rows: Record<string, unknown>[] = [];
  const savedIds: unknown[] = [];
  let interrupted = true;
  let currentPlanChanged = false;
  await page.route(
    "https://fixture.supabase.co/rest/v1/rpc/workspace_snapshot",
    async (route) => {
      const data = snapshot(true);
      if (currentPlanChanged) data.profile.monthly_income_paise = 1000000;
      await route.fulfill({ json: data });
    },
  );
  await page.route(
    "https://fixture.supabase.co/rest/v1/saved_simulations**",
    async (route) => {
      const req = route.request();
      if (req.method() === "POST") {
        const body = req.postDataJSON() as Record<string, unknown>;
        savedIds.push(body.id);
        if (!rows.some((row) => row.id === body.id))
          rows.unshift({ ...body, created_at: "2026-11-20T10:00:00+00:00" });
        if (interrupted) {
          interrupted = false;
          await route.fulfill({
            status: 500,
            json: {
              message: "Response interrupted; retry the same comparison.",
            },
          });
          return;
        }
        await route.fulfill({ status: 201, body: "" });
      } else if (req.method() === "DELETE") {
        rows.splice(0);
        await route.fulfill({ status: 204 });
      } else
        await route.fulfill({
          json: rows,
          headers: {
            "content-range": rows.length
              ? `0-${rows.length - 1}/${rows.length}`
              : "*/0",
            "cache-control": "no-store",
          },
        });
    },
  );
  await login(page);
  await page.goto("/#simulator");
  await page.getByLabel("Purchase price").fill("50000.29");
  await page.getByLabel("Payment method").selectOption("emi");
  await page.getByLabel("Comparison name").fill("Fixture laptop");
  await page
    .getByRole("button", { name: "Save comparison", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Response interrupted");
  await page
    .getByRole("button", { name: "Save comparison", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Comparison saved" }),
  ).toBeVisible();
  expect(rows).toHaveLength(1);
  expect(savedIds[0]).toBe(savedIds[1]);
  expect(rows[0].price_paise).toBe(5000029);
  expect(rows[0].income_paise).toBe(5000000);
  currentPlanChanged = true;
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
  await navigate(page, "Buy simulator");
  await expect(
    page.getByRole("button", { name: "Open Fixture laptop", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Open Fixture laptop", exact: true })
    .click();
  await expect(page.getByLabel("Purchase price")).toHaveValue("50000.29");
  await expect(page.getByLabel("Payment method")).toHaveValue("emi");
  await expect(
    page.getByText("Planned monthly income", { exact: false }),
  ).toContainText("₹50,000");
  await page
    .getByRole("button", { name: "Use current plan", exact: true })
    .click();
  await expect(
    page.getByText("Planned monthly income", { exact: false }),
  ).toContainText("₹10,000");
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Delete Fixture laptop", exact: true })
    .click();
  await expect(page.getByText("No saved comparisons yet.")).toBeVisible();
  expect(
    calls.filter((c) =>
      /record_entry|record_transfer|record_loan_payment|set_goal_allocation/.test(
        c.path,
      ),
    ),
  ).toHaveLength(0);
  await page.context().setOffline(true);
  await expect(
    page.getByRole("heading", { name: "Workspace locked" }),
  ).toBeVisible();
  await expect(page.getByText("Fixture laptop", { exact: true })).toHaveCount(
    0,
  );
  const cacheContents = await page.evaluate(async () => {
    const urls: string[] = [];
    for (const name of await caches.keys()) {
      for (const request of await (await caches.open(name)).keys())
        urls.push(request.url);
    }
    return urls;
  });
  expect(cacheContents.some((url) => url.includes("saved_simulations"))).toBe(
    false,
  );
});

test("CSV preview excludes invalid/repeated/existing rows and requires confirmation; interrupted commit retries safely", async ({
  page,
}) => {
  await mock(page, true);
  const previews: Record<string, unknown>[] = [];
  const commits: Record<string, unknown>[] = [];
  let posted = false;
  let interrupt = true;
  const entryId = "cf118070-369c-438f-8348-304bd2d88ba2";
  await page.route(
    "https://fixture.supabase.co/rest/v1/rpc/preview_csv_import",
    async (route) => {
      previews.push(route.request().postDataJSON() as Record<string, unknown>);
      await route.fulfill({ json: { duplicates: [true, false] } });
    },
  );
  await page.route(
    "https://fixture.supabase.co/rest/v1/rpc/import_csv_entries",
    async (route) => {
      commits.push(route.request().postDataJSON() as Record<string, unknown>);
      posted = true;
      if (interrupt) {
        interrupt = false;
        await route.fulfill({
          status: 500,
          json: { message: "Response interrupted" },
        });
      } else await route.fulfill({ json: { inserted: 1, skipped: 0 } });
    },
  );
  await page.route(
    "https://fixture.supabase.co/rest/v1/rpc/workspace_snapshot",
    async (route) => {
      const data = snapshot(true);
      if (posted) {
        data.summary.expense_paise = "20000";
        data.accounts[0].balance_paise = "1980000";
      }
      await route.fulfill({ json: data });
    },
  );
  await page.route(
    "https://fixture.supabase.co/rest/v1/transactions**",
    async (route) => {
      await route.fulfill({
        json: posted
          ? [
              {
                id: entryId,
                account_id: accountId,
                category_id: categoryId,
                kind: "expense",
                amount_paise: -20000,
                occurred_on: "2026-11-19",
                description: "CSV new",
                transfer_id: null,
                created_at: "2026-11-20T12:00:00Z",
              },
            ]
          : [],
        headers: { "content-range": posted ? "0-0/1" : "*/0" },
      });
    },
  );
  await login(page);
  await page.goto("/#activity");
  await page.getByText("Other: CSV import", { exact: true }).evaluate((el) => {
    (el.parentElement as HTMLDetailsElement).open = true;
  });
  await page.getByLabel("Choose CSV file").setInputFiles({
    name: "synthetic.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "date,type,amount,category,description\n2026-11-19,expense,100.29,Food & groceries,Existing lunch\n2026-11-19,expense,100.29,Food & groceries,Existing lunch\n2026-11-19,expense,200.00,Food & groceries,CSV new\n2026-02-30,expense,1.00,Food & groceries,Invalid date\n",
    ),
  });
  await expect(
    page.getByText("Repeated in this file", { exact: true }),
  ).toBeVisible();
  expect(previews).toHaveLength(0);
  expect(commits).toHaveLength(0);
  await expect(
    page.getByRole("button", { name: /Import \d+ transactions/ }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Check duplicates", exact: true })
    .click();
  await expect(
    page.getByText("Already in ledger", { exact: true }),
  ).toBeVisible();
  expect(previews).toHaveLength(1);
  expect(previews[0].p_account).toBe(accountId);
  expect(previews[0].p_rows).toHaveLength(2);
  await expect(
    page.getByRole("button", { name: "Import 1 transactions", exact: true }),
  ).toBeDisabled();
  await page
    .getByLabel("I reviewed the selected rows", { exact: false })
    .check();
  await page
    .getByRole("button", { name: "Import 1 transactions", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("could not be confirmed");
  await page
    .getByRole("button", { name: "Import 1 transactions", exact: true })
    .click();
  await expect(
    page.getByText(
      "Import complete: 1 added, 0 matched the ledger at posting, 3 excluded from the selection.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(commits).toHaveLength(2);
  expect(commits[0].p_request_id).toBe(commits[1].p_request_id);
  expect(commits[0].p_rows).toEqual([
    {
      occurred_on: "2026-11-19",
      kind: "expense",
      amount_paise: 20000,
      category_id: categoryId,
      description: "CSV new",
    },
  ]);
  await expect(page.getByText("CSV new", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(() => Object.values(localStorage).join(" ")),
  ).not.toContain("CSV new");
  await page.context().setOffline(true);
  await expect(
    page.getByRole("heading", { name: "Workspace locked" }),
  ).toBeVisible();
  await expect(page.getByText("CSV new", { exact: true })).toHaveCount(0);
});

test("CSV invalid files stay local, preview clears offline, and mobile layout remains contained", async ({
  page,
}) => {
  const calls = await mock(page, true);
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.goto("/#activity");
  await page.getByText("Other: CSV import", { exact: true }).evaluate((el) => {
    (el.parentElement as HTMLDetailsElement).open = true;
  });
  await page.getByLabel("Choose CSV file").setInputFiles({
    name: "bad.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("unexpected,header\n1,2"),
  });
  await expect(page.getByRole("alert")).toContainText("Use the columns");
  await page.getByText("Other: CSV import", { exact: true }).evaluate((el) => {
    (el.parentElement as HTMLDetailsElement).open = true;
  });
  await page.getByLabel("Choose CSV file").setInputFiles({
    name: "private-fixture.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "date,type,amount,category,description\n2026-11-19,expense,10.01,Food & groceries,Private CSV fixture\n",
    ),
  });
  await expect(
    page.getByText("Private CSV fixture", { exact: true }),
  ).toBeVisible();
  expect(
    calls.filter((c) => /csv_import|csv_entries/.test(c.path)),
  ).toHaveLength(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.context().setOffline(true);
  await expect(
    page.getByRole("heading", { name: "Workspace locked" }),
  ).toBeVisible();
  await expect(
    page.getByText("Private CSV fixture", { exact: true }),
  ).toHaveCount(0);
  const cached = await page.evaluate(async () => {
    const urls: string[] = [];
    for (const name of await caches.keys())
      for (const request of await (await caches.open(name)).keys())
        urls.push(request.url);
    return urls;
  });
  expect(cached.some((url) => /csv_import|csv_entries/.test(url))).toBe(false);
});

test("saved assumptions survive a CSV import that changes current available cash", async ({
  page,
}) => {
  await mock(page, true);
  const comparisons: Record<string, unknown>[] = [];
  let imported = false;
  await page.route(
    "https://fixture.supabase.co/rest/v1/rpc/workspace_snapshot",
    async (route) => {
      const data = snapshot(true);
      if (imported) {
        data.summary.liquid_cash_paise = "1900000";
        data.summary.expense_paise = "100000";
        data.accounts[0].balance_paise = "1900000";
      }
      await route.fulfill({ json: data });
    },
  );
  await page.route(
    "https://fixture.supabase.co/rest/v1/saved_simulations**",
    async (route) => {
      if (route.request().method() === "POST") {
        comparisons.push({
          ...route.request().postDataJSON(),
          created_at: "2026-11-20T12:00:00+00:00",
        });
        await route.fulfill({ status: 201, body: "" });
      } else
        await route.fulfill({
          json: comparisons,
          headers: { "content-range": comparisons.length ? "0-0/1" : "*/0" },
        });
    },
  );
  await page.route(
    "https://fixture.supabase.co/rest/v1/rpc/preview_csv_import",
    (route) => route.fulfill({ json: { duplicates: [false] } }),
  );
  await page.route(
    "https://fixture.supabase.co/rest/v1/rpc/import_csv_entries",
    async (route) => {
      imported = true;
      await route.fulfill({ json: { inserted: 1, skipped: 0 } });
    },
  );
  await login(page);
  await page.goto("/#simulator");
  await page.getByLabel("Purchase price").fill("5000");
  await page.getByLabel("Payment method").selectOption("cash");
  await page.getByLabel("Comparison name").fill("Before CSV");
  await page
    .getByRole("button", { name: "Save comparison", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Open Before CSV", exact: true }),
  ).toBeVisible();
  await page.goto("/#activity");
  await page.getByText("Other: CSV import", { exact: true }).evaluate((el) => {
    (el.parentElement as HTMLDetailsElement).open = true;
  });
  await page.getByLabel("Choose CSV file").setInputFiles({
    name: "combined-fixture.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "date,type,amount,category,description\n2026-11-19,expense,1000.00,Food & groceries,Combined fixture expense\n",
    ),
  });
  await page
    .getByRole("button", { name: "Check duplicates", exact: true })
    .click();
  await page
    .getByLabel("I reviewed the selected rows", { exact: false })
    .check();
  await page
    .getByRole("button", { name: "Import 1 transactions", exact: true })
    .click();
  await expect(
    page.getByText(
      "Import complete: 1 added, 0 matched the ledger at posting, 0 excluded from the selection.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: "Loading your records" }),
  ).toHaveCount(0);
  await page.goto("/#simulator");
  await page
    .getByRole("button", { name: "Open Before CSV", exact: true })
    .click();
  await expect(
    page.getByText("cash remains after purchase.", { exact: false }),
  ).toContainText("₹15,000");
  await page
    .getByRole("button", { name: "Use current plan", exact: true })
    .click();
  await expect(
    page.getByText("cash remains after purchase.", { exact: false }),
  ).toContainText("₹14,000");
});

test("CSV total-range rejection keeps the preview and reports that nothing was posted", async ({
  page,
}) => {
  await mock(page, true);
  await page.route(
    "https://fixture.supabase.co/rest/v1/rpc/preview_csv_import",
    (route) => route.fulfill({ json: { duplicates: [false] } }),
  );
  await page.route(
    "https://fixture.supabase.co/rest/v1/rpc/import_csv_entries",
    (route) =>
      route.fulfill({
        status: 400,
        json: {
          code: "22003",
          message: "CSV import exceeds supported financial totals.",
        },
      }),
  );
  await login(page);
  await page.goto("/#activity");
  await page.getByText("Other: CSV import", { exact: true }).evaluate((el) => {
    (el.parentElement as HTMLDetailsElement).open = true;
  });
  await page.getByLabel("Choose CSV file").setInputFiles({
    name: "range-fixture.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "date,type,amount,category,description\n2026-11-19,expense,1000.00,Food & groceries,Range fixture\n",
    ),
  });
  await page
    .getByRole("button", { name: "Check duplicates", exact: true })
    .click();
  await page
    .getByLabel("I reviewed the selected rows", { exact: false })
    .check();
  await page
    .getByRole("button", { name: "Import 1 transactions", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Nothing was imported.");
  await expect(page.getByText("Range fixture", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Import complete:", { exact: false }),
  ).toHaveCount(0);
  await page.getByLabel("Select CSV row 2", { exact: true }).uncheck();
  await expect(
    page.getByLabel("I reviewed the selected rows", { exact: false }),
  ).not.toBeChecked();
  await expect(
    page.getByRole("button", { name: "Import 0 transactions", exact: true }),
  ).toBeDisabled();
});

// A generated, entirely synthetic text PDF exercises the real local PDF.js worker.
function loanPdf() {
  const lines = [
    "Credit Saison / CRED App",
    "1 Sanctioned Loan amount (in Rupees) 12000.00",
    "Interest rate 0%",
    "Annual Percentage Rate (APR) 3.25%",
    "Loan tenure (in months) 2",
    "Monthly Fixed Repayments 2 6,000 31/01/2025",
    "Detailed Repayment Charges",
    "1 6000.00 6000.00 0.00 6000.00",
    "2 0.00 6000.00 0.00 6000.00",
  ];
  return textPdf(lines);
}
function textPdf(lines: string[]) {
  const stream = `BT /F1 10 Tf 40 780 Td ${lines.map((l, i) => (i ? "0 -20 Td " : "") + `(${l.replace(/[()\\]/g, "\\$&")}) Tj`).join("\n")} ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const [i, o] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((o) => String(o).padStart(10, "0") + " 00000 n \n")
    .join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}
test("loan PDF stays local and requires a reviewed current balance before saving", async ({
  page,
}) => {
  const calls = await mock(page, true);
  let terms: Record<string, unknown> | null = null;
  await page.route("**/rest/v1/rpc/save_loan_document", async (route) => {
    terms = route.request().postDataJSON().p_terms;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(crypto.randomUUID()),
    });
  });
  await login(page);
  await navigate(page, "Loans & subscriptions");
  await page.getByRole("button", { name: "Import loan PDF" }).click();
  await page.getByLabel("Loan PDF", { exact: false }).setInputFiles({
    name: "synthetic-fixture.pdf",
    mimeType: "application/pdf",
    buffer: loanPdf(),
  });
  await expect(
    page.getByLabel("Original sanctioned principal", { exact: false }),
  ).toHaveValue("12000.00");
  await expect(
    page.getByLabel("Annual nominal interest", { exact: false }),
  ).toHaveValue("0");
  await expect(page.getByLabel("Disclosed APR", { exact: false })).toHaveValue(
    "3.25",
  );
  await expect(
    page.getByLabel("Current outstanding principal", { exact: false }),
  ).toHaveValue("");
  await expect(
    page.getByRole("button", { name: "Save reviewed loan" }),
  ).toBeDisabled();
  await page
    .getByText("Use confirmed payment history to suggest a balance", {
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Suggest balance from confirmed payments",
    }),
  ).toBeDisabled();
  await page.getByLabel("Paid through", { exact: true }).fill("2025-02-01");
  await page
    .getByLabel("I confirm every scheduled instalment", { exact: false })
    .check();
  await page
    .getByRole("button", { name: "Suggest balance from confirmed payments" })
    .click();
  await expect(
    page.getByLabel("Current outstanding principal", { exact: false }),
  ).toHaveValue("6000.00");
  await page
    .getByLabel("I reviewed the original terms", { exact: false })
    .check();
  await page.getByRole("button", { name: "Save reviewed loan" }).click();
  await expect(
    page.getByText("Reviewed loan saved. No bank transactions were posted."),
  ).toBeVisible();
  expect(terms).toMatchObject({
    original_principal_paise: 1200000,
    current_outstanding_paise: 600000,
    reported_emi_paise: 600000,
    remaining_months: 1,
    balance_basis: "confirmed_schedule",
    paid_through: "2025-02-01",
    schedule_origin: "lender",
  });
  expect(JSON.stringify(terms)).not.toContain("synthetic-fixture.pdf");
  expect(JSON.stringify(terms)).not.toContain("%PDF");
  expect(
    calls.some(
      (c) =>
        c.path.includes("storage") ||
        c.path.includes("record_loan_payment") ||
        c.path.includes("record_entry"),
    ),
  ).toBe(false);
  const financialStorage = await page.evaluate(() =>
    Object.keys(localStorage).filter(
      (k) => !k.startsWith("folio-auth-") && k !== "folio-theme",
    ),
  );
  expect(financialStorage).toEqual([]);
});
test("invalid PDFs fail safely and document review clears on sign-out", async ({
  page,
}) => {
  await mock(page);
  await login(page);
  await navigate(page, "Loans & subscriptions");
  await page.getByRole("button", { name: "Import loan PDF" }).click();
  await page.getByLabel("Loan PDF", { exact: false }).setInputFiles({
    name: "not-a-pdf.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("invalid"),
  });
  await expect(page.getByRole("alert")).toContainText("valid PDF");
  await expect(
    page.getByRole("button", { name: "Save reviewed loan" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Review a loan document" }),
  ).toHaveCount(0);
});

test("saved document terms can be edited without the PDF and failed saves reuse a request ID", async ({
  page,
}) => {
  await mock(page, true);
  const loanId = "93f093ba-b008-4415-b0ea-4b3e2bd6b88c";
  const terms = {
    name: "Synthetic saved loan",
    provider: "lt_finance",
    source_sha256: "b".repeat(64),
    source_page_count: 1,
    original_principal_paise: 1200000,
    original_months: 12,
    nominal_rate: 0,
    disclosure_apr: null,
    net_disbursed_paise: null,
    fees_paise: null,
    reported_emi_paise: 100000,
    current_outstanding_paise: 600000,
    remaining_months: 6,
    as_of: "2025-02-01",
    paid_through: null,
    first_due_on: null,
    balance_basis: "manual",
    card_account_id: null,
    schedule_origin: "none",
    schedule: [],
    source_pages: {
      principal: 1,
      rate: 1,
      apr: null,
      emi: 1,
      tenure: 1,
      first_due: null,
    },
  };
  await page.route("**/rest/v1/rpc/workspace_snapshot", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ...snapshot(true),
        loans: [
          {
            id: loanId,
            name: terms.name,
            principal_paise: 600000,
            apr: 0,
            tenure_months: 6,
            start_date: "2025-02-01",
            status: "active",
            emi_paise: 100000,
            outstanding_paise: 600000,
            reported_emi_paise: 100000,
            card_account_id: null,
            has_document: true,
          },
        ],
      }),
    }),
  );
  await page.route("**/rest/v1/loan_document_details*", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ details: terms, revision: 4 }),
    }),
  );
  const saves: Record<string, unknown>[] = [];
  await page.route("**/rest/v1/rpc/save_loan_document", async (route) => {
    saves.push(route.request().postDataJSON());
    await route.fulfill(
      saves.length === 1
        ? {
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({ message: "temporary failure" }),
          }
        : {
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(loanId),
          },
    );
  });
  await login(page);
  await navigate(page, "Loans & subscriptions");
  await page.getByRole("button", { name: "Edit loan", exact: true }).click();
  await expect(
    page.getByLabel("Quoted monthly EMI", { exact: false }),
  ).toHaveValue("1000.00");
  await expect(
    page.getByLabel("Current outstanding principal", { exact: false }),
  ).toHaveValue("");
  await page
    .getByLabel("Current outstanding principal", { exact: false })
    .fill("5000.00");
  await page.getByLabel("Remaining instalments", { exact: true }).fill("5");
  await page
    .getByLabel("I reviewed the original terms", { exact: false })
    .check();
  await page.getByRole("button", { name: "Save reviewed loan" }).click();
  await expect(page.getByRole("alert")).toContainText("same request");
  await page.getByRole("button", { name: "Save reviewed loan" }).click();
  await expect(
    page.getByText("Reviewed loan saved. No bank transactions were posted."),
  ).toBeVisible();
  expect(saves).toHaveLength(2);
  expect(saves[0]).toEqual(saves[1]);
  expect(saves[0]).toMatchObject({
    p_loan: loanId,
    p_expected_revision: 4,
    p_terms: {
      current_outstanding_paise: 500000,
      remaining_months: 5,
      reported_emi_paise: 100000,
    },
  });
});

function investmentFixture() {
  return {
    id: "7f652a10-ef89-4c22-a990-188c07a81721",
    name: "Fixture NPS",
    scheme: "nps_tier_1",
    provider: "Fixture CRA",
    funding_source: "self",
    locked_until: null as string | null,
    account_id: null as string | null,
    archived: false,
    revision: 1,
    value_paise: 2000029,
    valued_on: "2026-01-01",
    valuation_id: "7f652a10-ef89-4c22-a990-188c07a81722",
    self_paise: 0,
    employer_paise: 0,
    withdrawn_paise: 0,
    fy_self_paise: 0,
    fy_employer_paise: 0,
    activity_after_valuation: 0,
  };
}
async function mockInvestments(page: Page, populated = false) {
  const calls = await mock(page, true);
  const holdings: ReturnType<typeof investmentFixture>[] = populated
    ? [investmentFixture()]
    : [];
  const history: {
    id: string;
    holding_id: string;
    kind: string;
    amount_paise: number;
    occurred_on: string;
    note: string;
    created_at: string;
  }[] = populated
    ? [
        {
          id: holdings[0].valuation_id,
          holding_id: holdings[0].id,
          kind: "valuation",
          amount_paise: holdings[0].value_paise,
          occurred_on: holdings[0].valued_on,
          note: "Opening statement",
          created_at: "2026-01-01T00:00:00Z",
        },
      ]
    : [];
  const saves: Record<string, unknown>[] = [];
  const activity: Record<string, unknown>[] = [];
  let failActivity = false;
  const refresh = () => {
    for (const h of holdings) {
      const rows = history.filter((e) => e.holding_id === h.id);
      const latest = rows
        .filter((e) => e.kind === "valuation")
        .sort(
          (a, b) =>
            b.occurred_on.localeCompare(a.occurred_on) ||
            b.created_at.localeCompare(a.created_at),
        )[0];
      if (latest) {
        h.value_paise = latest.amount_paise;
        h.valued_on = latest.occurred_on;
        h.valuation_id = latest.id;
      }
      h.self_paise = rows
        .filter((e) => e.kind === "self")
        .reduce((a, e) => a + e.amount_paise, 0);
      h.employer_paise = rows
        .filter((e) => e.kind === "employer")
        .reduce((a, e) => a + e.amount_paise, 0);
      h.withdrawn_paise = rows
        .filter((e) => e.kind === "withdrawal")
        .reduce((a, e) => a + e.amount_paise, 0);
      h.fy_self_paise = h.self_paise;
      h.fy_employer_paise = h.employer_paise;
    }
  };
  await page.route("**/rest/v1/rpc/workspace_snapshot", (route) => {
    refresh();
    const base = snapshot(true);
    const extra = holdings
      .filter((h) => !h.account_id)
      .reduce((a, h) => a + h.value_paise, 0);
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ...base,
        investments: holdings,
        summary: {
          ...base.summary,
          net_worth_paise: String(Number(base.summary.net_worth_paise) + extra),
          assets_paise: String(Number(base.summary.assets_paise) + extra),
        },
      }),
    });
  });
  await page.route("**/rest/v1/rpc/save_investment_holding", async (route) => {
    const body = route.request().postDataJSON();
    saves.push(body);
    let h = holdings.find((h) => h.id === body.p_holding);
    if (h) {
      Object.assign(h, body.p_terms);
      h.revision++;
    } else {
      h = {
        ...investmentFixture(),
        ...body.p_terms,
        id: crypto.randomUUID(),
        value_paise: body.p_initial_value_paise,
        valued_on: body.p_valued_on,
      };
      holdings.push(h!);
      history.push({
        id: crypto.randomUUID(),
        holding_id: h!.id,
        kind: "valuation",
        amount_paise: h!.value_paise,
        occurred_on: h!.valued_on,
        note: "Opening statement",
        created_at: new Date().toISOString(),
      });
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(h!.id),
    });
  });
  await page.route("**/rest/v1/rpc/record_investment_entry", async (route) => {
    const b = route.request().postDataJSON();
    activity.push(b);
    if (failActivity) {
      failActivity = false;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ message: "Fixture temporary failure" }),
      });
      return;
    }
    let e = history.find((e) => e.id === b.p_entry);
    if (b.p_delete) {
      const index = history.findIndex((e) => e.id === b.p_entry);
      history.splice(index, 1);
    } else if (e) {
      Object.assign(e, {
        kind: b.p_kind,
        amount_paise: b.p_amount_paise,
        occurred_on: b.p_occurred_on,
        note: b.p_note,
      });
    } else {
      e = {
        id: crypto.randomUUID(),
        holding_id: b.p_holding,
        kind: b.p_kind,
        amount_paise: b.p_amount_paise,
        occurred_on: b.p_occurred_on,
        note: b.p_note,
        created_at: new Date().toISOString(),
      };
      history.push(e);
    }
    const h = holdings.find((h) => h.id === b.p_holding)!;
    h.revision++;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(e?.id ?? b.p_entry),
    });
  });
  await page.route("**/rest/v1/investment_entries*", (route) => {
    const u = new URL(route.request().url());
    const id = u.searchParams.get("holding_id")?.replace("eq.", "");
    const rows = history
      .filter((e) => e.holding_id === id)
      .sort(
        (a, b) =>
          b.occurred_on.localeCompare(a.occurred_on) ||
          b.created_at.localeCompare(a.created_at),
      );
    const offset = Number(u.searchParams.get("offset") ?? 0);
    return route.fulfill({
      contentType: "application/json",
      headers: {
        "content-range": `${offset}-${Math.min(offset + 19, rows.length - 1)}/${rows.length}`,
      },
      body: JSON.stringify(rows.slice(offset, offset + 20)),
    });
  });
  return {
    calls,
    holdings,
    history,
    saves,
    activity,
    failNextActivity: () => {
      failActivity = true;
    },
  };
}
test("savings section creates self-funded and payroll holdings without posting bank activity", async ({
  page,
}) => {
  const mock = await mockInvestments(page);
  await login(page);
  await navigate(page, "Savings & investments");
  await expect(
    page.getByText("A clearer view of your savings", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Add investment", exact: true })
    .click();
  await page
    .getByLabel("Holding name", { exact: true })
    .fill("Fixture personal NPS");
  await page
    .getByLabel("Latest reported value", { exact: false })
    .fill("20000.29");
  await expect(
    page.getByLabel("Contribution source", { exact: true }),
  ).toHaveValue("self");
  await page
    .getByRole("button", { name: "Save investment", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Fixture personal NPS", exact: true }),
  ).toBeVisible();
  expect(mock.saves[0]).toMatchObject({
    p_initial_value_paise: 2000029,
    p_terms: { scheme: "nps_tier_1", funding_source: "self", account_id: null },
  });
  await page
    .getByRole("button", { name: "Add investment", exact: true })
    .click();
  await page.getByLabel("Scheme", { exact: true }).selectOption("epf");
  await expect(
    page.getByLabel("Contribution source", { exact: true }),
  ).toHaveValue("payroll");
  await page
    .getByLabel("Holding name", { exact: true })
    .fill("Fixture payroll EPF");
  await page
    .getByLabel("Latest reported value", { exact: false })
    .fill("5000.00");
  await page
    .getByRole("button", { name: "Save investment", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Fixture payroll EPF", exact: true }),
  ).toBeVisible();
  expect(mock.saves[1]).toMatchObject({
    p_terms: { scheme: "epf", funding_source: "payroll" },
  });
  expect(
    mock.calls.some((c) =>
      /record_entry|record_transfer|record_loan_payment/.test(c.path),
    ),
  ).toBe(false);
  await navigate(page, "Overview");
  await expect(page.getByText("₹45,000.29", { exact: true })).toBeVisible();
});
test("contribution history retries safely and does not invent a valuation or cash transaction", async ({
  page,
}) => {
  const mock = await mockInvestments(page, true);
  mock.failNextActivity();
  await login(page);
  await navigate(page, "Savings & investments");
  await page
    .getByRole("button", { name: "Record contribution", exact: true })
    .click();
  await page.getByLabel("Activity amount", { exact: false }).fill("123.29");
  await page
    .getByRole("button", { name: "Save history entry", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("unchanged retry");
  await page
    .getByRole("button", { name: "Save history entry", exact: true })
    .click();
  await expect(
    page.getByText("Investment history saved.", { exact: false }),
  ).toBeVisible();
  expect(mock.activity).toHaveLength(2);
  expect(mock.activity[0]).toEqual(mock.activity[1]);
  expect(mock.activity[0]).toMatchObject({
    p_kind: "self",
    p_amount_paise: 12329,
    p_expected_revision: 1,
  });
  expect(mock.holdings[0].value_paise).toBe(2000029);
  expect(mock.history.filter((e) => e.kind === "self")).toHaveLength(1);
  await page.getByRole("button", { name: "Update value", exact: true }).click();
  await page.getByLabel("Reported value", { exact: false }).fill("21000.57");
  await page
    .getByRole("button", { name: "Save history entry", exact: true })
    .click();
  await expect(
    page.getByText("Investment history saved.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("₹21,000.57", { exact: true }).first(),
  ).toBeVisible();
  expect(mock.holdings[0].value_paise).toBe(2100057);
  expect(
    mock.calls.some((c) =>
      /record_entry|record_transfer|record_loan_payment/.test(c.path),
    ),
  ).toBe(false);
});
test("investment history is editable and clears when the workspace locks", async ({
  page,
  context,
}) => {
  const mock = await mockInvestments(page, true);
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await navigate(page, "Savings & investments");
  await page.getByRole("button", { name: "History", exact: true }).click();
  await expect(
    page.getByText("Opening statement", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Edit history entry", exact: true })
    .click();
  await page.getByLabel("Reported value", { exact: false }).fill("20500.29");
  await page
    .getByRole("button", { name: "Save history entry", exact: true })
    .click();
  await expect(
    page.getByText("Investment history saved.", { exact: false }),
  ).toBeVisible();
  expect(mock.activity[0]).toMatchObject({
    p_entry: investmentFixture().valuation_id,
    p_amount_paise: 2050029,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await context.setOffline(true);
  await expect(
    page.getByRole("heading", { name: "Workspace locked", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Fixture NPS", exact: true }),
  ).toHaveCount(0);
  const stored = await page.evaluate(() =>
    Object.keys(localStorage).filter(
      (k) => !k.startsWith("folio-auth-") && k !== "folio-theme",
    ),
  );
  expect(stored).toEqual([]);
});

const statementPdf = () =>
  textPdf([
    "SYNTHETIC SBI / KOTAK STATEMENT - TEST DATA ONLY",
    "Account: fictitious bank - all entries synthetic",
    "19/11/2026 SYNTHETIC LUNCH 100.29",
    "20/11/2026 SYNTHETIC COMMUTE 250.07",
  ]);
test("PDF statement stays local; reviewed rows require duplicate checking and interrupted imports retry safely", async ({
  page,
}) => {
  const calls = await mock(page, true);
  const previews: Record<string, unknown>[] = [],
    commits: Record<string, unknown>[] = [];
  await page.route("**/rest/v1/rpc/preview_statement_import", async (route) => {
    previews.push(route.request().postDataJSON());
    await route.fulfill({ json: { duplicates: [false, false] } });
  });
  await page.route("**/rest/v1/rpc/import_statement_entries", async (route) => {
    commits.push(route.request().postDataJSON());
    if (commits.length === 1) await route.abort("failed");
    else await route.fulfill({ json: { inserted: 2, skipped: 0 } });
  });
  await login(page);
  await navigate(page, "Transactions");
  await expect(
    page.getByRole("heading", { name: "Import monthly PDF statement" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Connect Gmail" })).toHaveCount(
    0,
  );
  await page.getByLabel("Statement ending month").fill("2026-11");
  await page.getByLabel("PDF password (optional)").fill("synthetic-local-only");
  await page.getByLabel("Choose statement PDF").setInputFiles({
    name: "synthetic-statement.pdf",
    mimeType: "application/pdf",
    buffer: statementPdf(),
  });
  await expect(page.getByLabel("Description 1:3")).toHaveValue(
    "SYNTHETIC LUNCH",
  );
  expect(previews).toHaveLength(0);
  expect(commits).toHaveLength(0);
  await expect(page.getByLabel("PDF password (optional)")).toHaveValue("");
  for (const row of ["1:3", "1:4"]) {
    await page
      .getByLabel(`Type ${row}`, { exact: true })
      .selectOption("expense");
    await page
      .getByLabel(`Category ${row}`, { exact: true })
      .selectOption(categoryId);
  }
  await page
    .getByRole("button", { name: "Select reviewed valid rows" })
    .click();
  await page
    .getByRole("button", { name: "Check statement duplicates" })
    .click();
  await expect(
    page.getByRole("button", { name: "Import 2 statement transactions" }),
  ).toBeDisabled();
  await page
    .getByLabel("I compared the selected rows", { exact: false })
    .check();
  await page
    .getByRole("button", { name: "Import 2 statement transactions" })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Retry the unchanged selection safely",
  );
  await page
    .getByRole("button", { name: "Import 2 statement transactions" })
    .click();
  await expect(
    page.getByText("Statement import complete: 2 added", { exact: false }),
  ).toBeVisible();
  expect(commits).toHaveLength(2);
  expect(commits[0]).toEqual(commits[1]);
  expect(commits[0].p_source_sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(
    (commits[0].p_rows as { entry: { amount_paise: number } }[]).map(
      (r) => r.entry.amount_paise,
    ),
  ).toEqual([10029, 25007]);
  const all = JSON.stringify({ previews, commits, calls });
  expect(all).not.toContain("synthetic-local-only");
  expect(all).not.toContain("%PDF");
  expect(all).not.toContain("SYNTHETIC SBI / KOTAK");
  expect(calls.some((c) => /gmail|google/.test(c.path))).toBe(false);
});
test("PDF statement duplicate matches are excluded and edits reset confirmation", async ({
  page,
}) => {
  await mock(page, true);
  const commits: unknown[] = [];
  await page.route("**/rest/v1/rpc/preview_statement_import", (route) =>
    route.fulfill({ json: { duplicates: [true, false] } }),
  );
  await page.route("**/rest/v1/rpc/import_statement_entries", async (route) => {
    commits.push(route.request().postDataJSON());
    await route.fulfill({ json: { inserted: 1, skipped: 0 } });
  });
  await login(page);
  await navigate(page, "Transactions");
  await page.getByLabel("Statement ending month").fill("2026-11");
  await page.getByLabel("Choose statement PDF").setInputFiles({
    name: "synthetic-statement.pdf",
    mimeType: "application/pdf",
    buffer: statementPdf(),
  });
  await expect(page.getByLabel("Description 1:3")).toBeVisible();
  for (const row of ["1:3", "1:4"]) {
    await page
      .getByLabel(`Type ${row}`, { exact: true })
      .selectOption("expense");
    await page
      .getByLabel(`Category ${row}`, { exact: true })
      .selectOption(categoryId);
  }
  await page
    .getByRole("button", { name: "Select reviewed valid rows" })
    .click();
  await page
    .getByRole("button", { name: "Check statement duplicates" })
    .click();
  await expect(page.getByLabel("Select statement row 1:3")).toBeDisabled();
  await expect(page.getByLabel("Select statement row 1:3")).not.toBeChecked();
  await page
    .getByLabel("I compared the selected rows", { exact: false })
    .check();
  await page.getByLabel("Amount 1:4", { exact: true }).fill("251.07");
  await expect(
    page.getByLabel("I compared the selected rows", { exact: false }),
  ).toHaveCount(0);
  expect(commits).toHaveLength(0);
});
test("statement preview clears on lock, rejects invalid PDF and fits mobile without caching financial content", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mock(page, true);
  await login(page);
  await navigate(page, "Transactions");
  await page.getByLabel("Choose statement PDF").setInputFiles({
    name: "bad.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("not a pdf"),
  });
  await expect(page.getByRole("alert")).toContainText("valid PDF");
  await page.getByLabel("Statement ending month").fill("2026-11");
  await page.getByLabel("Choose statement PDF").setInputFiles({
    name: "synthetic-statement.pdf",
    mimeType: "application/pdf",
    buffer: statementPdf(),
  });
  await expect(page.getByLabel("Description 1:3")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      value: "hidden",
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(
    page.getByRole("heading", { name: "Workspace locked" }),
  ).toBeVisible();
  await expect(page.getByLabel("Description 1:3")).toHaveCount(0);
  const storage = await page.evaluate(() =>
    Object.values(localStorage).join(" "),
  );
  expect(storage).not.toContain("SYNTHETIC LUNCH");
  const cached = await page.evaluate(async () =>
    (
      await Promise.all(
        (await caches.keys()).map(async (key) =>
          (await (await caches.open(key)).keys()).map((r) => r.url),
        ),
      )
    ).flat(),
  );
  expect(
    cached.some((url) => /supabase\.co|googleapis|mail\.google/.test(url)),
  ).toBe(false);
});

function positionedStatementPdf(
  kind: "sbi" | "kotak",
  recipient = false,
  transferCredit = false,
) {
  const cells: [string, number, number][] =
    kind === "sbi"
      ? [
          ["SYNTHETIC SBI GRID - TEST DATA ONLY", 20, 800],
          ["Balance", 515, 750],
          ["SYNTHETIC FIRST LINE", 138, 707],
          ["01/05/2026", 28, 700],
          ["03/05/2026", 85, 700],
          ["-", 305, 700],
          ["132.47", 355, 700],
          ["8867.53", 525, 700],
          ["WRAPPED NARRATION", 138, 690],
          ["SYNTHETIC DEPOSIT", 138, 657],
          ["02/05/2026", 28, 650],
          ["04/05/2026", 85, 650],
          ["-", 305, 650],
          ["200.29", 440, 650],
          ["9067.82", 525, 650],
        ]
      : [
          ["SYNTHETIC KOTAK GRID - TEST DATA ONLY", 20, 800],
          ["Date", 75, 750],
          ["Description", 124, 750],
          ["Ref No.", 280, 750],
          ["Withdrawal (Dr.)", 355, 750],
          ["Deposit (Cr.)", 429, 750],
          ["Balance", 498, 750],
          ["7", 39, 700],
          ["03 May 2026", 73, 700],
          [
            recipient ? "UPI/TEST CAFE/ABCD/111/food" : "SYNTHETIC SERVICE",
            119,
            700,
          ],
          ["REF-ALPHA", 275, 700],
          ["10.37", 401, 700],
          ["8001.29", 529, 700],
          ["WRAPPED DESCRIPTION", 119, 690],
          ["8", 39, 660],
          ["04 May 2026", 73, 660],
          ["SYNTHETIC CREDIT", 119, 660],
          ["REF-BETA", 275, 660],
          [transferCredit ? "132.47" : "500.00", 465, 660],
          ["8501.29", 529, 660],
        ];
  const stream = cells
    .map(
      ([t, x, y]) =>
        `BT /F1 9 Tf 1 0 0 1 ${x} ${y} Tm (${t.replace(/[()\\]/g, "\\$&")}) Tj ET`,
    )
    .join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const [i, obj] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((o) => String(o).padStart(10, "0") + " 00000 n \n")
    .join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}
for (const bank of ["sbi", "kotak"] as const)
  test(`${bank} table adapter reads synthetic positioned PDF columns and wrapped descriptions locally`, async ({
    page,
  }) => {
    const calls = await mock(page, true);
    await login(page);
    await navigate(page, "Transactions");
    await page.getByLabel("Statement ending month").fill("2026-05");
    await page.getByLabel("Choose statement PDF").setInputFiles({
      name: `synthetic-${bank}.pdf`,
      mimeType: "application/pdf",
      buffer: positionedStatementPdf(bank),
    });
    const descriptions = page.locator('input[aria-label^="Description "]'),
      dates = page.locator('input[aria-label^="Date "]'),
      amounts = page.locator('input[aria-label^="Amount "]'),
      types = page.locator('select[aria-label^="Type "]');
    await expect(descriptions).toHaveCount(2);
    await expect(dates.nth(0)).toHaveValue("2026-05-03");
    await expect(dates.nth(1)).toHaveValue("2026-05-04");
    await expect(amounts.first()).toHaveValue(
      bank === "sbi" ? "132.47" : "10.37",
    );
    await expect(types.first()).toHaveValue("expense");
    await expect(types.nth(1)).toHaveValue("");
    await expect(descriptions.first()).toHaveValue(
      bank === "sbi"
        ? "SYNTHETIC FIRST LINE WRAPPED NARRATION"
        : "SYNTHETIC SERVICE WRAPPED DESCRIPTION · REF-ALPHA",
    );
    expect(
      calls.some((c) =>
        /statement_import|statement_entries|record_entry/.test(c.path),
      ),
    ).toBe(false);
  });

test("PDF EMI review requires exact principal/interest and posts a linked repayment", async ({
  page,
}) => {
  await mock(page, true);
  const loanId = "93f093ba-b008-4415-b0ea-4b3e2bd6b88c";
  await page.route("**/rest/v1/rpc/workspace_snapshot", (route) =>
    route.fulfill({
      json: {
        ...snapshot(true),
        loans: [
          {
            id: loanId,
            name: "Synthetic loan",
            principal_paise: 600000,
            apr: 12,
            tenure_months: 12,
            start_date: "2026-01-01",
            status: "active",
            emi_paise: 53000,
            outstanding_paise: 600000,
            reported_emi_paise: null,
            card_account_id: null,
            has_document: false,
          },
        ],
      },
    }),
  );
  const commits: Record<string, unknown>[] = [];
  await page.route("**/rest/v1/rpc/preview_statement_import", (route) =>
    route.fulfill({ json: { duplicates: [false] } }),
  );
  await page.route("**/rest/v1/rpc/import_statement_entries", (route) => {
    commits.push(route.request().postDataJSON());
    return route.fulfill({ json: { inserted: 1, skipped: 0 } });
  });
  await login(page);
  await navigate(page, "Transactions");
  await page.getByLabel("Statement ending month").fill("2026-11");
  await page.getByLabel("Choose statement PDF").setInputFiles({
    name: "synthetic.pdf",
    mimeType: "application/pdf",
    buffer: statementPdf(),
  });
  await page
    .getByLabel("Type 1:3", { exact: true })
    .selectOption("loan_payment");
  await page.getByLabel("Loan 1:3", { exact: true }).selectOption(loanId);
  await page.getByLabel("Principal 1:3", { exact: true }).fill("90.00");
  await page.getByLabel("Interest 1:3", { exact: true }).fill("10.28");
  await expect(page.getByLabel("Select statement row 1:3")).toBeDisabled();
  await page.getByLabel("Interest 1:3", { exact: true }).fill("10.29");
  await page.getByLabel("Select statement row 1:3").check();
  await page
    .getByRole("button", { name: "Check statement duplicates" })
    .click();
  await page
    .getByLabel("I compared the selected rows", { exact: false })
    .check();
  await page
    .getByRole("button", { name: "Import 1 statement transactions" })
    .click();
  await expect(
    page.getByText("Statement import complete: 1 added", { exact: false }),
  ).toBeVisible();
  expect(commits[0].p_rows).toEqual([
    {
      source_row: "1:3",
      entry: {
        kind: "loan_payment",
        loan_id: loanId,
        amount_paise: 10029,
        principal_paise: 9000,
        interest_paise: 1029,
        occurred_on: "2026-11-19",
        description: "SYNTHETIC LUNCH",
      },
    },
  ]);
});

test("December tracking, calendar dates and interactive chart controls preserve private accounting", async ({
  page,
}) => {
  const calls = await mock(page, true);
  const loanId = "93f093ba-b008-4415-b0ea-4b3e2bd6b88c",
    subId = "a73e3c99-e4d7-459c-bae9-578fc9fbb04d";
  await page.route("**/rest/v1/rpc/workspace_snapshot", (route) =>
    route.fulfill({
      json: {
        ...snapshot(true),
        profile: {
          ...snapshot(true).profile,
          tracking_start_date: "2026-12-01",
        },
        loans: [
          {
            id: loanId,
            name: "Synthetic dated EMI",
            principal_paise: 600000,
            apr: 12,
            tenure_months: 12,
            start_date: "2026-01-01",
            status: "active",
            emi_paise: 53000,
            outstanding_paise: 600000,
            reported_emi_paise: null,
            card_account_id: null,
            has_document: false,
            deduction_anchor_on: "2026-12-03",
          },
        ],
        subscriptions: [
          {
            id: subId,
            name: "Synthetic month-end subscription",
            account_id: null,
            amount_paise: 900,
            cadence: "monthly",
            next_due_on: "2026-12-31",
            active: true,
          },
        ],
        cashflow: [],
        deductions: [],
        category_spending: [],
      },
    }),
  );
  const saves: Record<string, unknown>[] = [];
  await page.route("**/rest/v1/loans*", (route) => {
    saves.push(route.request().postDataJSON());
    return route.fulfill({ json: [] });
  });
  await login(page);
  await expect(
    page.getByText("Transaction tracking from 1 Dec 2026", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cash flow", exact: true }).click();
  await expect(page.getByText("Your tracking is ready to begin")).toBeVisible();
  await page.getByRole("button", { name: "Asset mix", exact: true }).click();
  await page.getByRole("button", { name: /Fixture checking/ }).click();
  await expect(page.getByText(/of positive assets/)).toBeVisible();
  await navigate(page, "Monthly plan");
  await expect(page.getByLabel("Deduction month")).toHaveValue("2026-12");
  await expect(page.locator(".deduction-timeline")).toContainText(
    "Synthetic dated EMI",
  );
  await expect(
    page.locator(".deduction-timeline time").first(),
  ).toHaveAttribute("datetime", "2026-12-03");
  await page.screenshot({
    path: test.info().outputPath("deduction-calendar.png"),
    fullPage: true,
  });
  await page.getByLabel("Deduction month").fill("2027-02");
  await expect(page.locator(".deduction-timeline time").last()).toHaveAttribute(
    "datetime",
    "2027-02-28",
  );
  await page
    .getByText("Save or change an EMI deduction date", { exact: true })
    .click();
  await page.getByLabel("First tracked deduction").fill("2026-12-05");
  await page
    .getByRole("button", { name: "Save EMI date", exact: true })
    .click();
  await expect(
    page.getByText("EMI deduction date saved. No payment was posted."),
  ).toBeVisible();
  expect(saves).toEqual([{ deduction_anchor_on: "2026-12-05" }]);
  expect(
    calls.some((c) =>
      /record_entry|record_loan_payment|import_statement_entries/.test(c.path),
    ),
  ).toBe(false);
  await page.getByRole("button", { name: "Appearance", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: test.info().outputPath("deduction-calendar-mobile-dark.png"),
    fullPage: true,
  });
  await navigate(page, "Transactions");
  await expect(
    page.getByLabel("Show earlier records for reference", { exact: false }),
  ).not.toBeChecked();
  await page
    .getByLabel("Show earlier records for reference", { exact: false })
    .check();
  await expect(
    page.getByLabel("Show earlier records for reference", { exact: false }),
  ).toBeChecked();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("chart filters and subscription expense links do not create extra transactions", async ({
  page,
}) => {
  await mock(page, true);
  const subId = "a73e3c99-e4d7-459c-bae9-578fc9fbb04d",
    entryId = "35500d63-d599-4356-8862-313f6b5c319c";
  await page.route("**/rest/v1/rpc/workspace_snapshot", (route) =>
    route.fulfill({
      json: {
        ...snapshot(true),
        profile: {
          ...snapshot(true).profile,
          tracking_start_date: "2026-10-01",
        },
        cashflow: [
          { month: "2026-10-01", income_paise: 500000, outflow_paise: 300000 },
          { month: "2026-11-01", income_paise: 600000, outflow_paise: 200000 },
        ],
        category_spending: [
          {
            month: "2026-11-01",
            category_id: categoryId,
            name: "Synthetic food",
            amount_paise: 200000,
          },
        ],
        subscriptions: [
          {
            id: subId,
            name: "Synthetic subscription",
            account_id: null,
            amount_paise: 1000,
            cadence: "monthly",
            next_due_on: "2026-10-05",
            active: true,
          },
        ],
        deductions: [],
      },
    }),
  );
  await page.route("**/rest/v1/transactions*", (route) =>
    route.fulfill({
      json: [
        {
          id: entryId,
          account_id: accountId,
          category_id: categoryId,
          kind: "expense",
          amount_paise: -1000,
          occurred_on: "2026-11-05",
          description: "Synthetic receipt",
          transfer_id: null,
          subscription_id: null,
          card_emi_loan_id: null,
          created_at: "2026-11-05T00:00:00Z",
        },
      ],
    }),
  );
  const links: Record<string, unknown>[] = [];
  await page.route("**/rest/v1/rpc/link_subscription_deduction", (route) => {
    links.push(route.request().postDataJSON());
    return route.fulfill({ json: entryId });
  });
  await login(page);
  await page.getByLabel("Chart period").selectOption("12");
  await page
    .getByRole("button", { name: "Income series", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Income series", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await page.getByLabel("Inspect cash-flow month").selectOption("2026-10");
  await expect(page.getByText(/2026-10 · Net cash flow/)).toBeVisible();
  await page.getByRole("button", { name: "Spending mix", exact: true }).click();
  await page.getByLabel("Spending month").fill("2026-11");
  await page.getByRole("button", { name: /Synthetic food/ }).click();
  await expect(page.getByText(/100% of this month’s expenses/)).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.screenshot({
    path: test.info().outputPath("financial-insights.png"),
    fullPage: true,
  });
  await navigate(page, "Monthly plan");
  await page
    .getByText("Link an already-recorded subscription or card EMI expense", {
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Find recorded expenses", exact: true })
    .click();
  await page
    .getByLabel("Recorded expense", { exact: true })
    .selectOption(entryId);
  await page
    .getByRole("button", {
      name: "Link expense without reposting",
      exact: true,
    })
    .click();
  await expect(
    page.getByText("Deduction linked. No additional money was posted."),
  ).toBeVisible();
  expect(links).toEqual([{ p_subscription: subId, p_transaction: entryId }]);
});

test("loan progress separates reported instalments, recorded debt and schedule estimates", async ({
  page,
}) => {
  const calls = await mock(page, true),
    loanId = "93f093ba-b008-4415-b0ea-4b3e2bd6b88c";
  const terms = {
    name: "Synthetic progress loan",
    provider: "lt_finance",
    source_sha256: "b".repeat(64),
    source_page_count: 1,
    original_principal_paise: 1200000,
    original_months: 12,
    nominal_rate: 0,
    disclosure_apr: null,
    net_disbursed_paise: null,
    fees_paise: null,
    reported_emi_paise: 100000,
    current_outstanding_paise: 600000,
    remaining_months: 6,
    as_of: "2026-11-01",
    paid_through: null,
    first_due_on: "2026-08-01",
    balance_basis: "manual",
    card_account_id: null,
    schedule_origin: "none",
    schedule: [],
    source_pages: {
      principal: 1,
      rate: 1,
      apr: null,
      emi: 1,
      tenure: 1,
      first_due: 1,
    },
  };
  await page.route("**/rest/v1/rpc/workspace_snapshot", (route) =>
    route.fulfill({
      json: {
        ...snapshot(true),
        loans: [
          {
            id: loanId,
            name: terms.name,
            principal_paise: 600000,
            apr: 0,
            tenure_months: 6,
            start_date: "2026-11-01",
            status: "active",
            emi_paise: 100000,
            outstanding_paise: 600000,
            reported_emi_paise: 100000,
            card_account_id: null,
            has_document: true,
            progress_first_due_on: "2026-08-01",
            payments_reported_through: "2026-11-21",
          },
        ],
      },
    }),
  );
  await page.route("**/rest/v1/loan_document_details*", (route) =>
    route.fulfill({ json: { details: terms } }),
  );
  const saved: Record<string, unknown>[] = [];
  await page.route("**/rest/v1/loans*", (route) => {
    saved.push(route.request().postDataJSON());
    return route.fulfill({ json: [] });
  });
  await login(page);
  await navigate(page, "Loans & subscriptions");
  await expect(
    page.getByRole("heading", { name: "Loan payment progress", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".loan-progress-stats")).toContainText("4 / 12");
  await expect(
    page.getByText("50% of principal reduced", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Estimated principal remaining",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByLabel("Inspect instalment", { exact: true }).focus();
  await page
    .getByLabel("Inspect instalment", { exact: true })
    .press("ArrowRight");
  await expect(
    page.locator(".loan-progress .insight-detail").last(),
  ).toContainText("EMI 2");
  await page.getByLabel("First EMI date", { exact: true }).fill("2026-08-02");
  await page
    .getByRole("button", { name: "Save on-time payment report", exact: true })
    .click();
  await expect(
    page.getByText(
      "Progress dates saved. No repayments or balances were changed.",
    ),
  ).toBeVisible();
  expect(saved).toEqual([
    {
      progress_first_due_on: "2026-08-02",
      payments_reported_through: "2026-11-21",
    },
  ]);
  expect(
    calls.some((c) =>
      /record_entry|record_loan_payment|import_statement_entries/.test(c.path),
    ),
  ).toBe(false);
  await page.setViewportSize({ width: 390, height: 844 });
  // Recharts applies ResizeObserver measurements after the viewport changes.
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.screenshot({
    path: test.info().outputPath("loan-progress-mobile.png"),
    fullPage: true,
  });
});

test("debt simulator follows saved finances, protects reserve and never posts payments", async ({
  page,
}) => {
  await page.clock.install();
  const calls = await mock(page, true),
    loanId = "93f093ba-b008-4415-b0ea-4b3e2bd6b88c";
  let balance = 600000;
  await page.route("**/rest/v1/rpc/workspace_snapshot", (route) =>
    route.fulfill({
      json: {
        ...snapshot(true),
        loans: [
          {
            id: loanId,
            name: "Synthetic repayment loan",
            principal_paise: 600000,
            apr: 12,
            tenure_months: 12,
            start_date: "2026-01-01",
            status: "active",
            emi_paise: 53000,
            outstanding_paise: balance,
            reported_emi_paise: 53000,
            card_account_id: null,
            has_document: false,
            deduction_anchor_on: "2026-01-03",
          },
        ],
      },
    }),
  );
  await login(page);
  await navigate(page, "Debt repayment simulator");
  await expect(
    page.getByRole("heading", {
      name: "Your adaptive repayment plan",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByText("Debt balances and prepayment assumptions", { exact: true })
    .click();
  await expect(
    page.getByText("₹6,000.00 outstanding", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Compare your routes", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("One-time payment from spare cash (₹)", { exact: true })
    .fill("10000.01");
  await expect(page.getByRole("alert")).toContainText("exceeds spare cash");
  await page
    .getByLabel("One-time payment from spare cash (₹)", { exact: true })
    .fill("1000");
  await expect(
    page.getByRole("heading", { name: "Compare your routes", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Scenario monthly income (₹)", { exact: true })
    .fill("10");
  await expect(page.getByRole("alert")).toContainText("short by");
  await expect(
    page.getByRole("heading", { name: "Compare your routes", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Use current finances", exact: true })
    .click();
  balance = 300000;
  await page
    .getByRole("button", { name: "Refresh finances", exact: true })
    .click();
  await expect(
    page.getByText("₹3,000.00 outstanding", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Use monthly surplus", { exact: true }).focus();
  await page
    .getByLabel("Use monthly surplus", { exact: true })
    .press("ArrowLeft");
  await page.getByRole("button", { name: /Smallest balance first/ }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page
    .getByText("Debt balances and prepayment assumptions", { exact: true })
    .click();
  await page.screenshot({
    path: test.info().outputPath("debt-simulator-mobile.png"),
    fullPage: true,
  });
  await page
    .getByText("Debt balances and prepayment assumptions", { exact: true })
    .click();
  balance = 200000;
  await page.clock.fastForward(61000);
  await expect(
    page.getByText("₹2,000.00 outstanding", { exact: true }),
  ).toBeVisible();
  expect(
    calls.some((c) =>
      /record_entry|record_loan_payment|record_transfer|save_|import_statement_entries/.test(
        c.path,
      ),
    ),
  ).toBe(false);
});

test("debt simulator requires revolving card terms and reacts to protected savings", async ({
  page,
}) => {
  await mock(page, true);
  await page.route("**/rest/v1/rpc/workspace_snapshot", (route) =>
    route.fulfill({
      json: {
        ...snapshot(true),
        accounts: [
          ...snapshot(true).accounts,
          {
            id: "93f093ba-b008-4415-b0ea-4b3e2bd6b88c",
            name: "Synthetic revolving card",
            type: "credit_card",
            opening_balance_paise: -100000,
            opening_date: "2026-01-01",
            balance_paise: -100000,
            archived_at: null,
          },
        ],
      },
    }),
  );
  await login(page);
  await navigate(page, "Debt repayment simulator");
  await expect(page.getByRole("alert")).toContainText(
    "annual rate and monthly minimum",
  );
  await page
    .getByLabel("Annual rate Synthetic revolving card · revolving balance", {
      exact: true,
    })
    .fill("36");
  await page
    .getByLabel("Minimum Synthetic revolving card · revolving balance", {
      exact: true,
    })
    .fill("100");
  await expect(
    page.getByRole("heading", { name: "Compare your routes", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Monthly savings to protect (₹)", { exact: true })
    .fill("40000");
  await expect(page.getByRole("alert")).toContainText("short by");
});

test("recipient rules can be saved without importing, suggest next PDF and be disabled or forgotten", async ({
  page,
}) => {
  const calls = await mock(page, true);
  let saved: Record<string, unknown> | null = null;
  let saves = 0;
  let incomplete = false;
  await page.route("**/rest/v1/statement_rules**", async (route) => {
    const method = route.request().method();
    if (method === "POST") {
      saved = {
        ...route.request().postDataJSON(),
        id: "6cbf5c15-56fa-4ef7-b977-ab26edc478c3",
      };
      saves++;
    } else if (method === "PATCH")
      saved = { ...saved, ...route.request().postDataJSON() };
    const response = method === "GET" ? (saved ? [saved] : []) : saved;
    if (method === "DELETE") saved = null;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: {
        "content-range": `*/${saved ? (incomplete ? 2 : 1) : 0}`,
        "access-control-expose-headers": "content-range",
      },
      body: JSON.stringify(response),
    });
  });
  await login(page);
  await navigate(page, "Transactions");
  await page.getByLabel("Statement ending month").fill("2026-05");
  const read = () =>
    page.getByLabel("Choose statement PDF").setInputFiles({
      name: "synthetic-recipient.pdf",
      mimeType: "application/pdf",
      buffer: positionedStatementPdf("kotak", true),
    });
  await read();
  const category = page.locator('select[aria-label^="Category "]').first();
  await expect(category).toHaveValue("");
  await category.selectOption(categoryId);
  await page.getByText("Remember TEST CAFE", { exact: true }).click();
  await page.getByLabel("Remember deduction day 1:3").check();
  await page
    .getByRole("button", { name: "Save rule only", exact: true })
    .click();
  await expect(
    page.getByText("Rule saved. No transaction was added."),
  ).toBeVisible();
  expect(saves).toBe(1);
  expect(saved).toMatchObject({
    recipient_key: "kotak-upi:ABCD:TEST CAFE",
    category_id: categoryId,
    amount_paise: null,
    match_day: 3,
    direction: "debit",
  });
  expect(
    calls.some((c) => /import_statement_entries|record_entry/.test(c.path)),
  ).toBe(false);
  await read();
  await expect(category).toHaveValue(categoryId);
  await expect(page.getByText(/Remembered recipient: TEST CAFE/)).toBeVisible();
  await expect(
    page.locator('input[aria-label^="Select statement row "]').first(),
  ).not.toBeChecked();
  incomplete = true;
  await read();
  await expect(category).toHaveValue("");
  await expect(
    page.getByText("Rules unavailable. These rows need manual classification."),
  ).toBeVisible();
  incomplete = false;
  await read();
  await expect(category).toHaveValue(categoryId);
  await category.selectOption("");
  await expect(category).toHaveValue("");
  await page
    .getByText("Remembered rules for this account (1)", { exact: true })
    .click();
  await page
    .getByRole("button", { name: "Disable TEST CAFE", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Enable TEST CAFE", exact: true }),
  ).toBeVisible();
  await read();
  await expect(category).toHaveValue("");
  await page
    .getByRole("button", { name: "Forget TEST CAFE", exact: true })
    .click();
  await expect(
    page.getByText("Remembered rules for this account (0)", { exact: true }),
  ).toBeVisible();
  expect(
    calls.some((c) => /import_statement_entries|record_entry/.test(c.path)),
  ).toBe(false);
});

function financialArchiveFixture() {
  const names = [
    "profiles",
    "accounts",
    "categories",
    "transactions",
    "loans",
    "loan_payments",
    "subscriptions",
    "budgets",
    "savings_goals",
    "goal_allocations",
    "loan_document_details",
    "saved_simulations",
    "investment_holdings",
    "investment_entries",
    "statement_rules",
  ];
  const data = Object.fromEntries(
    names.map((name) => [name, [] as Record<string, unknown>[]]),
  );
  data.transactions = [
    {
      user_id: owner,
      amount_paise: "-10029",
      occurred_on: "2026-01-01",
      description: "Synthetic earlier expense",
    },
  ];
  return {
    format: "folio-financial-export",
    schema_version: 1,
    owner_id: owner,
    exported_at: "2026-09-20T12:30:45+00:00",
    currency: "INR",
    timezone: "Asia/Kolkata",
    data,
  };
}
test("data export downloads complete owned history and readiness changes no records", async ({
  page,
}) => {
  const calls = await mock(page, true);
  await page.route("**/rest/v1/rpc/export_financial_data", (route) =>
    route.fulfill({ json: financialArchiveFixture() }),
  );
  await login(page);
  await navigate(page, "Data & privacy");
  await page.getByLabel("Month to reconcile").fill("2025-12");
  await expect(
    page.getByText(/Review the opening date and statement opening balance/),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download financial data", exact: true })
    .click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(
    /^folio-export-\d{4}-\d{2}-\d{2}\.json$/,
  );
  const stream = await file.createReadStream();
  let text = "";
  for await (const chunk of stream!) text += chunk.toString();
  expect(JSON.parse(text).data.transactions[0]).toMatchObject({
    amount_paise: "-10029",
    occurred_on: "2026-01-01",
  });
  expect(
    calls.some((c) =>
      /record_entry|record_loan_payment|import_statement_entries|delete_own_account/.test(
        c.path,
      ),
    ),
  ).toBe(false);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
});
test("an invalid export never produces a partial download", async ({
  page,
}) => {
  await mock(page, true);
  await page.route("**/rest/v1/rpc/export_financial_data", (route) =>
    route.fulfill({
      json: {
        ...financialArchiveFixture(),
        owner_id: "79a7ef42-47a8-49bd-95bb-2440263ad9a0",
      },
    }),
  );
  let downloads = 0;
  page.on("download", () => downloads++);
  await login(page);
  await navigate(page, "Data & privacy");
  await page
    .getByRole("button", { name: "Download financial data", exact: true })
    .click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Export could not be completed" }),
  ).toBeVisible();
  expect(downloads).toBe(0);
});
test("account deletion requires confirmation, current password and a deliberate final action", async ({
  page,
}) => {
  await mock(page, true);
  let deletes = 0;
  await login(page);
  await navigate(page, "Data & privacy");
  await page
    .getByText("Open account deletion controls", { exact: true })
    .click();
  const erase = page.getByRole("button", {
    name: "Permanently delete my account",
    exact: true,
  });
  await expect(erase).toBeDisabled();
  await page
    .getByLabel("Account deletion confirmation", { exact: true })
    .fill("DELETE MY ACCOUNT");
  await page
    .getByLabel("Current password for deletion", { exact: true })
    .fill("wrong-fixture-password");
  await page
    .getByLabel("I have saved anything I need", { exact: false })
    .check();
  await page.route("**/auth/v1/token?grant_type=password", async (route) => {
    const body = route.request().postDataJSON();
    await route.fulfill(
      body.password === "correct-fixture-password"
        ? { json: session }
        : {
            status: 400,
            json: {
              error: "invalid_grant",
              error_description: "Invalid login credentials",
            },
          },
    );
  });
  await page.route("**/rest/v1/rpc/delete_own_account", async (route) => {
    deletes++;
    expect(route.request().postDataJSON()).toEqual({
      p_confirmation: "DELETE MY ACCOUNT",
    });
    await route.fulfill({ json: true });
  });
  await erase.click();
  await expect(
    page.getByRole("status").filter({
      hasText: "Password confirmation failed. Nothing was deleted.",
    }),
  ).toBeVisible();
  expect(deletes).toBe(0);
  await expect(page.getByLabel("Current password for deletion")).toHaveValue(
    "",
  );
  await page
    .getByLabel("Current password for deletion")
    .fill("correct-fixture-password");
  await erase.click();
  await expect(
    page.getByRole("heading", { name: "A little peace of mind." }),
  ).toBeVisible();
  expect(deletes).toBe(1);
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).filter((k) => k.startsWith("folio-auth-")),
    ),
  ).toEqual([]);
});

test("monthly reconciliation enforces exact balances and separate month confirmation", async ({
  page,
}) => {
  const calls = await mock(page, true);
  let reviewed = false;
  const account = {
    account_id: accountId,
    month: "2026-10-01",
    baseline_covers_month: true,
    complete_month: true,
    opening_paise: "2000000",
    closing_paise: "1990000",
    credits_paise: "0",
    debits_paise: "10000",
    row_count: 1,
    ledger_hash: "synthetic-ledger",
    review: null as null | { current: boolean; reviewed_at: string },
  };
  await page.route("**/rest/v1/rpc/monthly_review_report", (r) =>
    r.fulfill({
      json: {
        month: "2026-10-01",
        complete_month: true,
        income_paise: "0",
        expenses_paise: "10000",
        loan_cash_paise: "0",
        principal_paise: "0",
        interest_paise: "0",
        self_invested_paise: "0",
        employer_invested_paise: "0",
        withdrawn_paise: "0",
        subscription_paid_paise: "0",
        categories: [],
        accounts: [account],
        report_hash: "synthetic-month",
        review: reviewed
          ? { current: true, reviewed_at: "2026-11-01", saved_report: {} }
          : null,
      },
    }),
  );
  await page.route("**/rest/v1/rpc/reconcile_account", (r) => {
    account.review = { current: true, reviewed_at: "2026-11-01" };
    return r.fulfill({ json: null });
  });
  await page.route("**/rest/v1/rpc/review_month", (r) => {
    reviewed = true;
    return r.fulfill({ json: null });
  });
  await login(page);
  await navigate(page, "Monthly review");
  await expect(
    page.getByText("Not reconciled yet.", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Statement opening balance", { exact: true })
    .fill("20000");
  await page
    .getByLabel("Statement closing balance", { exact: true })
    .fill("19899.99");
  await page
    .getByLabel("I compared statement balances", { exact: false })
    .check();
  await expect(
    page.getByRole("button", { name: "Confirm account reconciliation" }),
  ).toBeDisabled();
  await page
    .getByLabel("Statement closing balance", { exact: true })
    .fill("19900");
  await page
    .getByLabel("I compared statement balances", { exact: false })
    .check();
  await page
    .getByRole("button", { name: "Confirm account reconciliation" })
    .click();
  await expect(
    page.getByText("All listed accounts have current reconciliations.", {
      exact: false,
    }),
  ).toBeVisible();
  const close = page.getByRole("button", { name: "Mark month reviewed" });
  await expect(close).toBeDisabled();
  await page.getByLabel("I have reviewed this month’s report.").check();
  await close.click();
  await expect(
    page.getByText("This month is reviewed and current."),
  ).toBeVisible();
  expect(
    calls.some((c) =>
      /record_entry|record_transfer|record_loan_payment/.test(c.path),
    ),
  ).toBe(false);
});

test("90-day forecast persists assumptions without posting and fits mobile", async ({
  page,
}) => {
  const calls = await mock(page, true);
  const settings = {
    salary_day: 1,
    salary_account_id: accountId,
    spending_account_id: accountId,
    loan_funding: {},
  };
  await page.route("**/rest/v1/planning_settings?*", (r) =>
    r.fulfill({ json: [settings] }),
  );
  await page.route("**/rest/v1/planned_cash_events?*", (r) =>
    r.fulfill({ json: [] }),
  );
  await page.route("**/rest/v1/rpc/forecast_context", (r) =>
    r.fulfill({
      json: { as_of: "2026-11-22", non_subscription_spent_paise: "0" },
    }),
  );
  await login(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await navigate(page, "Cash-flow forecast");
  await expect(page.getByLabel("Projected cash balance chart")).toBeVisible();
  await page.getByLabel("Inspect forecast day", { exact: true }).fill("45");
  await expect(
    page.getByLabel("Inspect forecast day", { exact: true }),
  ).toHaveValue("45");
  await page
    .getByText("Forecast dates and funding accounts", { exact: true })
    .click();
  await page.getByRole("button", { name: "Save forecast settings" }).click();
  await expect(
    page.getByText("Forecast settings saved. No money was posted."),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  expect(
    calls.find((c) => c.path.endsWith("/save_planning"))?.body?.p_settings,
  ).toEqual(settings);
  expect(
    calls.some((c) =>
      /record_entry|record_transfer|record_loan_payment/.test(c.path),
    ),
  ).toBe(false);
});

test("restore refuses a nonempty workspace and audit changes are read-only", async ({
  page,
}) => {
  const calls = await mock(page, true);
  await page.route("**/rest/v1/rpc/preview_financial_restore", (r) =>
    r.fulfill({
      json: {
        can_restore: false,
        archive_hash: "synthetic",
        rows: 2,
        schema_version: 1,
        legacy_source_warning: true,
        reason:
          "Existing financial records are present. Restore only into a separate empty workspace.",
      },
    }),
  );
  await page.route("**/rest/v1/audit_events?*", (r) =>
    r.fulfill({
      json: [
        {
          id: crypto.randomUUID(),
          user_id: owner,
          table_name: "accounts",
          entity_id: accountId,
          action: "UPDATE",
          before_data: { name: "Old synthetic name" },
          after_data: { name: "Fixture checking" },
          occurred_at: "2026-11-22T10:00:00Z",
          provenance: "live",
          reason: "",
        },
      ],
    }),
  );
  await login(page);
  await navigate(page, "Data & privacy");
  await page
    .getByLabel("Financial archive JSON", { exact: true })
    .setInputFiles({
      name: "synthetic.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(financialArchiveFixture())),
    });
  await page.getByRole("button", { name: "Validate restore preview" }).click();
  await expect(
    page.getByText("Existing financial records are present.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Restore validated archive" }),
  ).toHaveCount(0);
  await page
    .locator("summary")
    .filter({ hasText: "Account · Changed" })
    .click();
  await expect(
    page.getByText("Old synthetic name", { exact: false }),
  ).toBeVisible();
  expect(
    calls.some((c) =>
      /confirm_financial_restore|delete_own_account/.test(c.path),
    ),
  ).toBe(false);
  expect(
    calls
      .filter((c) => c.path.includes("/audit_events"))
      .every((c) => c.body === null),
  ).toBe(true);
});

test("paired statement transfer reads PDFs locally and links an existing payment only after review", async ({
  page,
}) => {
  const calls = await mock(page, true),
    other = "2bb04aa9-8910-4e90-89d7-91c4a51bf470",
    transfer = "3bb04aa9-8910-4e90-89d7-91c4a51bf470";
  await page.route("**/rest/v1/rpc/workspace_snapshot", (r) =>
    r.fulfill({
      json: {
        ...snapshot(true),
        accounts: [
          ...snapshot(true).accounts,
          {
            ...snapshot(true).accounts[0],
            id: other,
            name: "Fixture destination",
          },
        ],
      },
    }),
  );
  await page.route("**/rest/v1/rpc/preview_transfer_match", (r) =>
    r.fulfill({ json: { matches: [transfer], already_linked: false } }),
  );
  let posted: Record<string, unknown> | null = null;
  await page.route("**/rest/v1/rpc/confirm_transfer_match", (r) => {
    posted = r.request().postDataJSON();
    return r.fulfill({ json: transfer });
  });
  await login(page);
  await navigate(page, "Transactions");
  await page
    .getByText("Match transfers and card repayments from statements", {
      exact: true,
    })
    .click();
  await page
    .getByLabel("Transfer statement month", { exact: true })
    .fill("2026-05");
  await page.getByLabel("Debit statement PDF", { exact: true }).setInputFiles({
    name: "synthetic-debit.pdf",
    mimeType: "application/pdf",
    buffer: positionedStatementPdf("sbi"),
  });
  await expect(page.getByText("Debit statement parsed: 2 rows.")).toBeVisible();
  await page.getByLabel("Credit statement PDF", { exact: true }).setInputFiles({
    name: "synthetic-credit.pdf",
    mimeType: "application/pdf",
    buffer: positionedStatementPdf("kotak", false, true),
  });
  await expect(page.getByLabel("Possible transfer pair")).toContainText(
    "132.47",
  );
  await page.getByLabel("Possible transfer pair").selectOption({ index: 1 });
  await page.getByRole("button", { name: "Check transfer duplicates" }).click();
  const link = page.getByRole("button", {
    name: "Link statement rows to existing transfer",
  });
  await expect(link).toBeDisabled();
  await page
    .getByLabel("Existing matching transfer", { exact: true })
    .selectOption(transfer);
  await page
    .getByLabel("I verified these are the same own-account transfer", {
      exact: false,
    })
    .check();
  await link.click();
  await expect(
    page.getByText("Existing transfer linked. No second payment was posted."),
  ).toBeVisible();
  expect(posted).toMatchObject({
    p_spec: {
      from_account: accountId,
      to_account: other,
      amount_paise: 13247,
      existing_transfer: transfer,
      debit_on: "2026-05-03",
      credit_on: "2026-05-04",
    },
  });
  expect(
    calls.some((c) => /record_entry|import_statement_entries/.test(c.path)),
  ).toBe(false);
});

test("investment XIRR requires complete-history review and includes employer capital", async ({
  page,
}) => {
  await mockInvestments(page, true);
  await page.route("**/rest/v1/rpc/investment_return_history", (r) =>
    r.fulfill({
      json: [
        {
          id: crypto.randomUUID(),
          kind: "valuation",
          amount_paise: "100000",
          occurred_on: "2025-01-01",
          created_at: "2025-01-01T00:00:00Z",
        },
        {
          id: crypto.randomUUID(),
          kind: "valuation",
          amount_paise: "110000",
          occurred_on: "2026-01-01",
          created_at: "2026-01-01T00:00:00Z",
        },
      ],
    }),
  );
  await login(page);
  await navigate(page, "Savings & investments");
  await page
    .getByRole("button", { name: "Investment returns for", exact: false })
    .click();
  await expect(
    page.getByText("Annualised XIRR:", { exact: false }),
  ).toHaveCount(0);
  await page
    .getByLabel("I entered every relevant contribution and withdrawal", {
      exact: false,
    })
    .check();
  await expect(
    page.getByText("Annualised XIRR: 10%", { exact: true }),
  ).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await expect(
    page.getByText("Annualised XIRR:", { exact: false }),
  ).toHaveCount(0);
});

test("validated restore needs the exact phrase and retries an interrupted confirmation once", async ({
  page,
}) => {
  await mock(page);
  await page.route("**/rest/v1/rpc/preview_financial_restore", (r) =>
    r.fulfill({
      json: {
        can_restore: true,
        archive_hash: "synthetic-archive-hash",
        rows: 2,
        schema_version: 1,
        legacy_source_warning: true,
      },
    }),
  );
  const commits: Record<string, unknown>[] = [];
  await page.route("**/rest/v1/rpc/confirm_financial_restore", (r) => {
    commits.push(r.request().postDataJSON());
    return commits.length === 1
      ? r.abort("failed")
      : r.fulfill({ json: { restored: true } });
  });
  await login(page);
  await navigate(page, "Data & privacy");
  await page
    .getByLabel("Financial archive JSON", { exact: true })
    .setInputFiles({
      name: "synthetic.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(financialArchiveFixture())),
    });
  await page.getByRole("button", { name: "Validate restore preview" }).click();
  const restore = page.getByRole("button", {
    name: "Restore validated archive",
  });
  await page
    .getByLabel("I own this archive, verified the preview", { exact: false })
    .check();
  await expect(restore).toBeDisabled();
  await page
    .getByLabel("Restore confirmation", { exact: true })
    .fill("RESTORE INTO EMPTY WORKSPACE");
  await restore.click();
  await expect(
    page.getByText("Keep this archive selected and retry", { exact: false }),
  ).toBeVisible();
  await restore.click();
  await expect.poll(() => commits.length).toBe(2);
  expect(commits[0].p_request_id).toBe(commits[1].p_request_id);
  expect(commits[1].p_expected_hash).toBe("synthetic-archive-hash");
});

test("debt simulator saves fees and promotion metadata without recording a repayment", async ({
  page,
}) => {
  const calls = await mock(page, true);
  const card = {
    ...snapshot(true).accounts[0],
    type: "credit_card",
    name: "Synthetic card",
    opening_balance_paise: -100000,
    balance_paise: "-100000",
  };
  await page.route("**/rest/v1/rpc/workspace_snapshot", (r) =>
    r.fulfill({ json: { ...snapshot(true), accounts: [card] } }),
  );
  let saved: Record<string, unknown> | null = null;
  await page.route("**/rest/v1/rpc/save_debt_terms", (r) => {
    saved = r.request().postDataJSON();
    return r.fulfill({ json: crypto.randomUUID() });
  });
  await login(page);
  await navigate(page, "Debt repayment simulator");
  await page
    .getByLabel("Annual rate Synthetic card · revolving balance", {
      exact: true,
    })
    .fill("24");
  await page
    .getByLabel("Minimum Synthetic card · revolving balance", { exact: true })
    .fill("100");
  await page
    .getByLabel("Closure charge Synthetic card · revolving balance", {
      exact: true,
    })
    .fill("100.29");
  await page
    .getByLabel("Fee tax Synthetic card · revolving balance", { exact: true })
    .fill("18");
  await page
    .getByLabel("Promotional rate Synthetic card · revolving balance", {
      exact: true,
    })
    .fill("0");
  await page
    .getByLabel("Promotion expiry Synthetic card · revolving balance", {
      exact: true,
    })
    .fill("2027-01-31");
  await page
    .getByRole("button", { name: "Save fee and promotion terms" })
    .click();
  await expect(
    page.getByText("Fee and promotion terms saved.", { exact: false }),
  ).toBeVisible();
  expect(saved).toMatchObject({
    p_loan: null,
    p_account: accountId,
    p_terms: {
      closure_fee_paise: 10029,
      tax_percent: 18,
      promo_apr: 0,
      promo_until: "2027-01-31",
    },
  });
  expect(
    calls.some((c) =>
      /record_entry|record_transfer|record_loan_payment/.test(c.path),
    ),
  ).toBe(false);
});

test("section menu starts closed on Overview, lists sections vertically and dismisses accessibly", async ({
  page,
}) => {
  await mock(page, true);
  await login(page);
  const toggle = page.locator(".private-section-picker summary");
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(
      page.getByRole("heading", { name: "Overview", exact: true }),
    ).toBeVisible();
    await expect(nav).not.toBeVisible();
    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(nav).toBeVisible();
    const positions = await nav.getByRole("link").evaluateAll((links) =>
      links.map((a) => ({
        x: a.getBoundingClientRect().x,
        y: a.getBoundingClientRect().y,
      })),
    );
    expect(positions).toHaveLength(12);
    expect(
      positions.every(
        (p, i) =>
          i === 0 || (p.x === positions[0].x && p.y > positions[i - 1].y),
      ),
    ).toBe(true);
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    if (width === 390)
      await page.screenshot({ path: "/tmp/folio-menu-mobile-open.png" });
    await page.keyboard.press("Escape");
    await expect(nav).not.toBeVisible();
    await expect(toggle).toBeFocused();
    await toggle.click();
    await page
      .locator(".private-navigationbar")
      .click({ position: { x: 1, y: 1 } });
    await expect(nav).not.toBeVisible();
  }
  await navigate(page, "Accounts");
  await expect(
    page.getByRole("heading", { name: "Accounts", exact: true }),
  ).toBeVisible();
  await expect(nav).not.toBeVisible();
  await expect(toggle).toBeFocused();
  await page.goto("/#accounts");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
  await expect(nav).not.toBeVisible();
  await expect(page).toHaveURL(/#overview$/);
  await page.screenshot({ path: "/tmp/folio-menu-mobile-closed.png" });
});

async function expectReadablePrivatePalette(page: Page) {
  const palette = await page.evaluate(() => {
    const css = getComputedStyle(document.documentElement);
    return [
      "--text",
      "--bg",
      "--muted",
      "--surface",
      "--on-primary",
      "--primary",
    ].map((key) => css.getPropertyValue(key).trim());
  });
  const luminance = (hex: string) => {
    const rgb = [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  };
  for (let i = 0; i < palette.length; i += 2) {
    const a = luminance(palette[i]),
      b = luminance(palette[i + 1]);
    expect(
      (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
    ).toBeGreaterThanOrEqual(4.5);
  }
}
test("iPhone design keeps currency intact, provides thumb actions and readable light/dark screens", async ({
  page,
}) => {
  await mock(page, true);
  await login(page);
  for (const width of [320, 375, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(
      page.getByRole("heading", { name: "Overview", exact: true }),
    ).toBeVisible();
    const amount = page.locator(".balance-value");
    await expect(amount).toHaveText("₹20,000.00");
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    expect(await amount.evaluate((el) => getComputedStyle(el).whiteSpace)).toBe(
      "nowrap",
    );
    const action = await page
      .getByRole("button", { name: "Add transaction", exact: true })
      .boundingBox();
    expect(action!.height).toBeGreaterThanOrEqual(44);
    expect(action!.y).toBeGreaterThan(650);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expectReadablePrivatePalette(page);
  await page.screenshot({
    path: "/tmp/folio-ios-overview-light.png",
  });
  await page.getByRole("button", { name: "Appearance", exact: true }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect
    .poll(() =>
      page
        .getByRole("button", { name: "Add transaction", exact: true })
        .evaluate((el) => getComputedStyle(el).color),
    )
    .toBe("rgb(33, 23, 56)");
  await expectReadablePrivatePalette(page);
  await page.screenshot({
    path: "/tmp/folio-ios-overview-dark.png",
  });
  await page.locator(".private-section-picker summary").click();
  await page.screenshot({ path: "/tmp/folio-ios-menu.png" });
  await page.keyboard.press("Escape");
  await navigate(page, "Accounts");
  await page.screenshot({
    path: "/tmp/folio-ios-accounts.png",
    fullPage: true,
  });
});

test("iPhone editor is a keyboard-aware sheet with large fields and restores scroll on close", async ({
  page,
}) => {
  await mock(page, true);
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.evaluate(() => {
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: Object.assign(new EventTarget(), { height: 844, offsetTop: 0 }),
    });
  });
  await page
    .getByRole("button", { name: "Add transaction", exact: true })
    .click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  await page.screenshot({ path: "/tmp/folio-ios-editor.png" });
  await page.evaluate(() => {
    Object.assign(window.visualViewport!, { height: 430 });
    window.visualViewport!.dispatchEvent(new Event("resize"));
  });
  const box = (await sheet.boundingBox())!;
  expect(box.width).toBe(390);
  expect(box.y + box.height).toBeLessThanOrEqual(431);
  const fonts = await sheet
    .locator("input,select")
    .evaluateAll((els) =>
      els.map((el) => parseFloat(getComputedStyle(el).fontSize)),
    );
  expect(fonts.every((n) => n >= 16)).toBe(true);
  expect(await page.evaluate(() => document.body.style.overflow)).toBe(
    "hidden",
  );
  await page.getByRole("button", { name: "Close editor", exact: true }).click();
  await expect(sheet).not.toBeVisible();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
});

test("enlarged iPhone text and supported large amounts remain accessible without page overflow", async ({
  page,
}) => {
  await mock(page, true);
  await page.route("**/rest/v1/rpc/workspace_snapshot", (r) =>
    r.fulfill({
      json: {
        ...snapshot(true),
        accounts: [
          { ...snapshot(true).accounts[0], balance_paise: "1000000000000" },
        ],
        summary: {
          ...snapshot(true).summary,
          liquid_cash_paise: "1000000000000",
          assets_paise: "1000000000000",
          net_worth_paise: "1000000000000",
        },
      },
    }),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await expect(page.locator(".balance-value")).toHaveText(
    "₹10,00,00,00,000.00",
  );
  await page.evaluate(() => (document.documentElement.style.fontSize = "32px"));
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await expect(
    page.getByRole("button", { name: "Add transaction", exact: true }),
  ).toBeVisible();
  await page.locator(".private-section-picker summary").click();
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.keyboard.press("Escape");
  await page.screenshot({
    path: "/tmp/folio-ios-enlarged.png",
    fullPage: true,
  });
});

test("iPhone subscription bucket totals active monthly equivalents and refreshes when a plan is paused", async ({
  page,
}) => {
  const calls = await mock(page, true);
  const subs = [
    {
      name: "Fixture monthly",
      amount_paise: 10029,
      cadence: "monthly",
      active: true,
    },
    {
      name: "Fixture yearly",
      amount_paise: 12001,
      cadence: "yearly",
      active: true,
    },
    {
      name: "Fixture weekly",
      amount_paise: 100,
      cadence: "weekly",
      active: true,
    },
    {
      name: "Fixture paused",
      amount_paise: 999999,
      cadence: "monthly",
      active: false,
    },
  ].map((s) => ({
    ...s,
    id: crypto.randomUUID(),
    account_id: accountId,
    next_due_on: "2026-12-01",
  }));
  await page.route("**/rest/v1/rpc/workspace_snapshot", (r) =>
    r.fulfill({ json: { ...snapshot(true), subscriptions: subs } }),
  );
  await page.route("**/rest/v1/subscriptions?*", (r) => {
    const id = new URL(r.request().url()).searchParams
      .get("id")
      ?.replace("eq.", "");
    const sub = subs.find((s) => s.id === id);
    if (sub) sub.active = r.request().postDataJSON().active;
    return r.fulfill({ json: null });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await navigate(page, "Loans & subscriptions");
  const bucket = page.getByRole("region", {
    name: "Monthly subscription bucket",
  });
  await expect(bucket).toContainText("₹114.62");
  await expect(bucket).toContainText("3 active subscriptions");
  await expect(bucket).toContainText("per month · estimated");
  await bucket.screenshot({ path: "/tmp/folio-subscription-bucket.png" });
  await page
    .locator(".ledger-row")
    .filter({ hasText: "Fixture monthly" })
    .getByRole("button", { name: "Pause", exact: true })
    .click();
  await expect(bucket).toContainText("₹14.33");
  await expect(bucket).toContainText("2 active subscriptions");
  await navigate(page, "Monthly plan");
  await expect(bucket).toContainText("₹14.33");
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  expect(
    calls.some((c) =>
      /record_entry|record_transfer|record_loan_payment/.test(c.path),
    ),
  ).toBe(false);
});
