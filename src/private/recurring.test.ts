import { describe, it, expect } from "vitest";
import { deductionsInMonth, recurringDate } from "./recurring";
import type { Snapshot } from "./domain";
describe("deduction date projection", () => {
  it("clamps month ends without drifting the saved day", () => {
    expect(recurringDate("2026-12-31", 2)).toBe("2027-02-28");
    expect(recurringDate("2026-12-31", 3)).toBe("2027-03-31");
    expect(recurringDate("2024-02-29", 12)).toBe("2025-02-28");
    expect(recurringDate("2024-02-29", 48)).toBe("2028-02-29");
  });
  const s = {
    profile: { tracking_start_date: "2026-12-01" },
    loans: [
      {
        id: "loan",
        name: "Synthetic loan",
        status: "active",
        outstanding_paise: 10000,
        deduction_anchor_on: "2026-12-03",
        emi_paise: 3000,
        reported_emi_paise: 3100,
        card_account_id: null,
      },
    ],
    subscriptions: [
      {
        id: "monthly",
        name: "Month-end",
        active: true,
        cadence: "monthly",
        next_due_on: "2026-10-31",
        amount_paise: 900,
      },
      {
        id: "weekly",
        name: "Weekly",
        active: true,
        cadence: "weekly",
        next_due_on: "2026-11-30",
        amount_paise: 100,
      },
      {
        id: "yearly",
        name: "Yearly",
        active: true,
        cadence: "yearly",
        next_due_on: "2025-12-02",
        amount_paise: 1200,
      },
    ],
  } as Snapshot;
  it("keeps a manual opening day within shorter months and leaves fixed dates alone", () => {
    const data = {
      ...s,
      subscriptions: s.subscriptions.map((sub) =>
        sub.id === "monthly" ? { ...sub, payment_window_start: 30 } : sub),
    };
    const rows = deductionsInMonth(data, "2027-02");
    expect(rows.find((r) => r.id === "monthly")).toMatchObject({
      due_on: "2027-02-28",
      window_opens_on: "2027-02-28",
    });
    expect(rows.find((r) => r.id === "weekly")?.window_opens_on).toBeUndefined();
  });
  it("begins on the tracking date, handles weekly/yearly recurrence and retains quoted EMI", () => {
    const rows = deductionsInMonth(s, "2026-12");
    expect(rows.filter((x) => x.id === "weekly").map((x) => x.due_on)).toEqual([
      "2026-12-07",
      "2026-12-14",
      "2026-12-21",
      "2026-12-28",
    ]);
    expect(rows.find((x) => x.id === "loan")).toMatchObject({
      due_on: "2026-12-03",
      amount_paise: 3100,
    });
    expect(rows.find((x) => x.id === "yearly")?.due_on).toBe("2026-12-02");
    expect(rows.find((x) => x.id === "monthly")?.due_on).toBe("2026-12-31");
    expect(deductionsInMonth(s, "2026-11")).toEqual([]);
  });
  it("omits paused, closed, repaid and unscheduled loans without inventing dates", () => {
    expect(
      deductionsInMonth(
        {
          ...s,
          subscriptions: s.subscriptions.map((x) => ({ ...x, active: false })),
          loans: [
            { ...s.loans[0], deduction_anchor_on: null },
            { ...s.loans[0], status: "closed" },
            { ...s.loans[0], outstanding_paise: 0 },
          ],
        },
        "2026-12",
      ),
    ).toEqual([]);
    expect(
      deductionsInMonth(s, "2027-02").find((x) => x.id === "monthly")?.due_on,
    ).toBe("2027-02-28");
  });
});
