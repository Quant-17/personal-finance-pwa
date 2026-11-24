import { expect, it } from "vitest";
import { monthlySubscriptions, subscriptionMonthlyCost } from "./monthlyPlan";
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

it("prices a removed plan in integer paise even above the aggregate display limit", () => {
  const cost = (amount_paise: number, cadence: string, active = true) =>
    subscriptionMonthlyCost(
      plan([{ amount_paise, cadence, active }]).subscriptions[0],
    );
  expect(cost(1201, "weekly")).toBe(5204);
  expect(cost(6, "yearly")).toBe(1);
  expect(cost(10000, "monthly", false)).toBe(0);
  expect(cost(1_000_000_000_000, "weekly")).toBe(4_333_333_333_333);
});
