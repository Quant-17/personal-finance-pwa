import { expect, it } from "vitest";
import { monthlySubscriptions } from "./monthlyPlan";
import type { Snapshot } from "./domain";
const plan = (
  subscriptions: { amount_paise: number; cadence: string; active?: boolean }[],
) =>
  ({
    subscriptions: subscriptions.map((s) => ({
      ...s,
      active: s.active ?? true,
    })),
  }) as Snapshot;
it("normalizes active subscription forecasts and rounds the aggregate once", () => {
  expect(
    monthlySubscriptions(
      plan([
        { amount_paise: 12001, cadence: "yearly" },
        { amount_paise: 10029, cadence: "monthly" },
        { amount_paise: 100, cadence: "weekly" },
        { amount_paise: 999999, cadence: "monthly", active: false },
      ]),
    ),
  ).toBe(11462);
  expect(
    monthlySubscriptions(
      plan([
        { amount_paise: 1, cadence: "yearly" },
        { amount_paise: 5, cadence: "yearly" },
      ]),
    ),
  ).toBe(1);
});
it("handles empty and unsafe totals without silently overflowing", () => {
  expect(monthlySubscriptions(plan([]))).toBe(0);
  expect(
    monthlySubscriptions(
      plan([
        { amount_paise: 1_000_000_000_000, cadence: "monthly" },
        { amount_paise: 1, cadence: "monthly" },
      ]),
    ),
  ).toBeNull();
});
