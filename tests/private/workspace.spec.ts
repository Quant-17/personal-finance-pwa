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
    else if (path === "/rest/v1/transactions") response = [];
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
}) => {
  const calls = await mock(page, true);
  await login(page);
  await page.getByRole("link", { name: "Accounts", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Fixture checking" }),
  ).toBeVisible();
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
    page.getByRole("heading", { name: "Fixture checking" }),
  ).toBeVisible();
  expect(
    calls.filter((c) => c.path === "/auth/v1/user").length,
  ).toBeGreaterThan(before);
  await expect
    .poll(() =>
      page.evaluate(
        async () => !!(await navigator.serviceWorker.getRegistration())?.active,
      ),
    )
    .toBe(true);
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
  await page.getByRole("link", { name: "Accounts", exact: true }).click();
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
  await page.getByRole("link", { name: "Buy simulator", exact: true }).click();
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
  await page
    .getByLabel("Choose CSV file")
    .setInputFiles({
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
  await page
    .getByLabel("Choose CSV file")
    .setInputFiles({
      name: "bad.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("unexpected,header\n1,2"),
    });
  await expect(page.getByRole("alert")).toContainText("Use the columns");
  await page
    .getByLabel("Choose CSV file")
    .setInputFiles({
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
