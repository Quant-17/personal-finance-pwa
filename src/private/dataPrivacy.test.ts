import { describe, expect, it } from "vitest";
import { financialExport, importReadiness } from "./dataPrivacy";
import type { Snapshot } from "./domain";
const owner = "8bb04aa9-8910-4e90-89d7-91c4a51bf470";
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
const exportData = () => ({
  format: "folio-financial-export",
  schema_version: 1,
  owner_id: owner,
  exported_at: "2026-09-20T12:30:45+00:00",
  currency: "INR",
  timezone: "Asia/Kolkata",
  data: Object.fromEntries(
    names.map((n) => [n, [] as Record<string, unknown>[]]),
  ),
});
describe("financial data archive", () => {
  it("preserves exact money strings and all owned earlier records", () => {
    const data = exportData();
    data.data.transactions = [
      { user_id: owner, amount_paise: "-10029", occurred_on: "2026-01-01" },
    ];
    expect(
      JSON.parse(financialExport(data, owner)).data.transactions[0]
        .amount_paise,
    ).toBe("-10029");
  });
  it("rejects wrong-owner, missing-table, extra-table and incompatible archives", () => {
    expect(() => financialExport(exportData(), "different-owner")).toThrow(
      /identity/,
    );
    const mixed = exportData();
    mixed.data.accounts = [{ user_id: "other" }];
    expect(() => financialExport(mixed, owner)).toThrow(/ownership/);
    const incomplete = exportData();
    delete incomplete.data.loans;
    expect(() => financialExport(incomplete, owner)).toThrow(/tables/);
    const extra = exportData();
    extra.data.auth_users = [];
    expect(() => financialExport(extra, owner)).toThrow(/tables/);
    expect(() =>
      financialExport({ ...exportData(), schema_version: 2 }, owner),
    ).toThrow();
  });
});
describe("monthly import readiness", () => {
  const s = {
    profile: { tracking_start_date: "2026-09-01" },
    accounts: [
      {
        id: "a",
        name: "Synthetic bank",
        type: "bank",
        opening_date: "2026-09-20",
        archived_at: null,
      },
      {
        id: "b",
        name: "Old bank",
        type: "bank",
        opening_date: "2026-08-01",
        archived_at: null,
      },
      {
        id: "c",
        type: "bank",
        opening_date: "2026-09-20",
        archived_at: "2026-09-21",
      },
    ],
    loans: [
      {
        id: "l",
        name: "Synthetic loan",
        status: "active",
        start_date: "2026-09-20",
        card_account_id: null,
      },
    ],
  } as Snapshot;
  it("flags dates requiring reconciliation without changing the snapshot", () => {
    const before = JSON.stringify(s),
      result = importReadiness(s, "2026-09");
    expect(result.accounts).toHaveLength(2);
    expect(result.accounts.map((a) => a.needsReview)).toEqual([true, false]);
    expect(result.loans).toHaveLength(1);
    expect(result.cutoff).toBeNull();
    expect(JSON.stringify(s)).toBe(before);
  });
  it("distinguishes a whole blocked month and the reporting cutoff", () => {
    const result = importReadiness(s, "2026-08");
    expect(result.accounts[0].entireMonthBlocked).toBe(true);
    expect(result.cutoff).toBe("2026-09-01");
  });
  it("rejects invalid months instead of inferring a baseline", () => {
    for (const month of ["", "2026-00", "2026-13", "2026-1"])
      expect(() => importReadiness(s, month)).toThrow(/valid statement month/);
  });
});
