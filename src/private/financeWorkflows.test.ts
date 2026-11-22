import { describe, expect, it } from "vitest";
import {
  cashForecast,
  type PlanningSettings,
  type PlannedEvent,
} from "./forecast";
import { investmentReturns, type ReturnEntry } from "./investmentReturns";
import { transferPairs } from "./transferMatching";
import { fullPromoMonths } from "./debtTerms";
import { simulateDebtPlan, type Debt } from "./debtPlan";
import { archiveTables, parseFinancialArchive } from "./dataPrivacy";
import type { Snapshot } from "./domain";
import type { StatementDraft } from "./statements";
const settings: PlanningSettings = {
  salary_day: 1,
  salary_account_id: "a",
  spending_account_id: "a",
  loan_funding: {},
};
const snapshot = () =>
  ({
    profile: {
      monthly_income_paise: 100000,
      monthly_living_budget_paise: 3101,
      emergency_reserve_paise: 10000,
    },
    accounts: [
      {
        id: "a",
        name: "Bank",
        type: "bank",
        balance_paise: 50000,
        archived_at: null,
      },
      {
        id: "b",
        name: "Savings",
        type: "savings",
        balance_paise: 10000,
        archived_at: null,
      },
    ],
    loans: [],
    subscriptions: [],
    allocations: [],
  }) as unknown as Snapshot;
const row = (
  direction: string,
  date: string,
  amount: string,
  description = "Synthetic settled transfer",
) =>
  ({
    direction,
    date,
    amount,
    description,
    source_row: direction + date,
  }) as StatementDraft;
const entry = (
  kind: ReturnEntry["kind"],
  amount_paise: number,
  occurred_on: string,
): ReturnEntry => ({
  id: kind + occurred_on,
  kind,
  amount_paise,
  occurred_on,
  created_at: occurred_on,
});
const debt: Debt = {
  id: "d",
  name: "Synthetic",
  balance: 10000,
  apr: 0,
  minimum: 1000,
  allowExtra: true,
  feePercent: 0,
};
describe("cash forecast preserves dated paise and avoids posting", () => {
  it("allocates every paise of a full month and schedules salary only after today", () => {
    const s = snapshot(),
      before = JSON.stringify(s),
      p = cashForecast(s, settings, [], "2026-12-31", 0, 31);
    expect(p.rows[0].cash).toBe(60000);
    expect(p.rows.at(-1)?.cash).toBe(156899);
    expect(
      p.rows
        .flatMap((r) => r.events)
        .filter((e) => e.name === "Expected salary"),
    ).toHaveLength(1);
    expect(JSON.stringify(s)).toBe(before);
  });
  it("does not replay today’s salary or spending, and accounts for month-to-date expenses", () => {
    const p = cashForecast(snapshot(), settings, [], "2027-01-01", 3100, 1);
    expect(p.rows[1].cash).toBe(59999);
    expect(p.rows[1].events.some((e) => e.name === "Expected salary")).toBe(
      false,
    );
  });
  it("keeps cash-to-cash transfers neutral while showing account deficits", () => {
    const event = {
      id: "x",
      name: "Move cash",
      kind: "transfer",
      account_id: "a",
      to_account_id: "b",
      amount_paise: 60000,
      due_on: "2027-01-02",
      cadence: "once",
      within_budget: false,
      active: true,
    } as PlannedEvent;
    const s = snapshot();
    s.profile.monthly_living_budget_paise = 0;
    const p = cashForecast(s, settings, [event], "2027-01-01", 0, 1);
    expect(p.rows[1].cash).toBe(60000);
    expect(p.rows[1].accounts.a).toBe(-10000);
    expect(p.firstLow).toBe("2027-01-02");
  });
  it("reserves an explicitly budgeted bill without double-counting living costs", () => {
    const event = {
      id: "x",
      name: "Rent",
      kind: "expense",
      account_id: "a",
      to_account_id: null,
      amount_paise: 2000,
      due_on: "2027-01-02",
      cadence: "once",
      within_budget: true,
      active: true,
    } as PlannedEvent;
    const p = cashForecast(snapshot(), settings, [event], "2026-12-31", 0, 31);
    expect(p.rows.at(-1)?.cash).toBe(156899);
  });
  it("rejects missing funding, invalid dates and unsafe limits", () => {
    expect(() =>
      cashForecast(
        snapshot(),
        { ...settings, spending_account_id: null },
        [],
        "2027-01-01",
        0,
      ),
    ).toThrow("Choose");
    expect(() =>
      cashForecast(snapshot(), settings, [], "2027-02-30", 0),
    ).toThrow("date");
    expect(() =>
      cashForecast(snapshot(), settings, [], "2027-01-01", 0, 91),
    ).toThrow("90");
  });
});
describe("statement transfer candidates", () => {
  it("matches exact paise across three settlement days and leaves ambiguous candidates for review", () => {
    const pairs = transferPairs(
      [row("debit", "2026-10-01", "100.29")],
      [
        row("credit", "2026-10-04", "100.29"),
        row("credit", "2026-10-02", "100.28"),
        row("credit", "2026-10-05", "100.29"),
        row("credit", "2026-10-02", "100.29"),
      ],
    );
    expect(pairs.map((p) => p.days)).toEqual([1, 3]);
    expect(pairs[0].amount).toBe(10029);
  });
  it("rejects unknown direction, reversals and invalid dates", () => {
    expect(
      transferPairs(
        [
          row("unknown", "2026-10-01", "100"),
          row("debit", "2026-02-30", "100"),
          row("debit", "2026-10-01", "100", "Payment reversal"),
        ],
        [row("credit", "2026-10-01", "100")],
      ),
    ).toEqual([]);
  });
});
describe("investment return estimates", () => {
  it("solves a conventional one-year 10% return with employer capital included", () => {
    const p = investmentReturns(
      [
        entry("self", 60000, "2025-01-01"),
        entry("employer", 40000, "2025-01-01"),
        entry("valuation", 110000, "2026-01-01"),
      ],
      false,
    );
    expect(p.gain).toBe(10000);
    expect(p.employer).toBe(40000);
    expect(p.xirr).toBeCloseTo(0.1, 10);
  });
  it("uses opening end-of-day valuation and excludes older/same-day contributions", () => {
    const p = investmentReturns(
      [
        entry("self", 90000, "2024-12-01"),
        entry("self", 10000, "2025-01-01"),
        entry("valuation", 100000, "2025-01-01"),
        entry("valuation", 110000, "2026-01-01"),
        entry("self", 5000, "2026-02-01"),
      ],
      true,
    );
    expect(p.self).toBe(0);
    expect(p.gain).toBe(10000);
    expect(p.ignoredAfter).toBe(1);
    expect(p.xirr).toBeCloseTo(0.1, 10);
  });
  it("reports loss and refuses a misleading single XIRR for nonconventional flows", () => {
    expect(
      investmentReturns(
        [
          entry("self", 100000, "2025-01-01"),
          entry("valuation", 90000, "2026-01-01"),
        ],
        false,
      ).xirr,
    ).toBeCloseTo(-0.1, 10);
    const p = investmentReturns(
      [
        entry("self", 100000, "2025-01-01"),
        entry("withdrawal", 20000, "2025-03-01"),
        entry("self", 10000, "2025-06-01"),
        entry("valuation", 100000, "2026-01-01"),
      ],
      false,
    );
    expect(p.xirr).toBeNull();
    expect(p.reason).toContain("multiple");
    expect(p.gain).toBe(10000);
  });
  it("requires a usable history and valid dates", () => {
    expect(() => investmentReturns([], false)).toThrow("terminal");
    expect(() =>
      investmentReturns([entry("valuation", 100, "2026-01-01")], true),
    ).toThrow("two");
    expect(() =>
      investmentReturns([entry("valuation", 100, "2026-02-30")], false),
    ).toThrow("dated");
  });
});
describe("debt fees and promotion expiry", () => {
  it("charges settlement fee and rounded tax only on accelerated closure", () => {
    const d = { ...debt, closureFee: 1000, feeTaxPercent: 18 };
    expect(simulateDebtPlan([d], "minimum", 1000).fees).toBe(0);
    const p = simulateDebtPlan([d], "avalanche", 20000);
    expect(p.fees).toBe(1180);
    expect(p.totalPaid).toBe(11180);
    expect(p.status).toBe("paid_off");
  });
  it("retains settlement fees when a partial prepayment closes in a later month", () => {
    const p = simulateDebtPlan(
      [{ ...debt, closureFee: 1000 }],
      "avalanche",
      1000,
      8000,
    );
    expect(p.lumpFees).toBe(0);
    expect(p.status).toBe("unaffordable");
    expect(p.shortfall).toBe(1000);
    const paid = simulateDebtPlan(
      [{ ...debt, closureFee: 1000 }],
      "avalanche",
      2000,
      8000,
    );
    expect(paid.fees).toBe(1000);
    expect(paid.status).toBe("paid_off");
  });
  it("switches from promotional to normal monthly rate after the full-month period", () => {
    const p = simulateDebtPlan(
      [{ ...debt, apr: 12, promoApr: 0, promoMonths: 1 }],
      "minimum",
      1000,
    );
    expect(p.rows[0].interest).toBe(0);
    expect(p.rows[1].interest).toBe(90);
    expect(fullPromoMonths("2026-11", "2027-01-15")).toBe(2);
    expect(fullPromoMonths("2028-02", "2028-02-29")).toBe(1);
    expect(() => fullPromoMonths("2026-02", "2026-02-30")).toThrow("expiry");
  });
});
it("validates version-two archive tables and owner-scoped source markers", () => {
  const owner = "8bb04aa9-8910-4e90-89d7-91c4a51bf470";
  const a = {
    format: "folio-financial-export",
    schema_version: 2,
    owner_id: owner,
    exported_at: "2026-11-22T10:00:00Z",
    currency: "INR",
    timezone: "Asia/Kolkata",
    data: Object.fromEntries(archiveTables.map((t) => [t, []])),
    source_markers: { statement_rows: [], transfer_sources: [] },
  };
  expect(parseFinancialArchive(a).schema_version).toBe(2);
  expect(() =>
    parseFinancialArchive({
      ...a,
      source_markers: {
        statement_rows: [{ user_id: "other" }],
        transfer_sources: [],
      },
    }),
  ).toThrow();
  expect(() => parseFinancialArchive({ ...a, extra: true })).toThrow();
});
