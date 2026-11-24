import Decimal from "decimal.js";
import { MONEY_LIMIT } from "./domain";
import type { Snapshot } from "./domain";
export function monthlySubscriptions(snapshot: Snapshot) {
  const D = Decimal.clone({ precision: 40 });
  const total = snapshot.subscriptions
    .filter((s) => s.active)
    .reduce(
      (sum, sub) =>
        sum.plus(
          new D(sub.amount_paise)
            .times(sub.cadence === "weekly" ? 52 : 1)
            .div(sub.cadence === "monthly" ? 1 : 12),
        ),
      new D(0),
    )
    .toDecimalPlaces(0, D.ROUND_HALF_UP);
  return total.lte(MONEY_LIMIT) ? total.toNumber() : null;
}

// A single plan can annualise above the display-total limit, yet still fits safe integer paise.
// Removal needs its exact monthly cost to compare the server preview and cap budget release.
export function subscriptionMonthlyCost(
  sub: Snapshot["subscriptions"][number],
) {
  if (!sub.active) return 0;
  return new Decimal(sub.amount_paise)
    .times(sub.cadence === "weekly" ? 52 : 1)
    .div(sub.cadence === "monthly" ? 1 : 12)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    .toNumber();
}
