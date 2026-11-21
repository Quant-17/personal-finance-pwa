import { useEffect, useState } from "react";
import { z } from "zod";
import { formatExactMoney as money } from "../lib/finance";
import { monthlySubscriptions } from "./monthlyPlan";
import { MONEY_LIMIT, displayDate, safeTotal } from "./domain";
import type { Snapshot } from "./domain";
import { db, check } from "./workspace";
const statusSchema = z.object({
  pending: z.number().int().nonnegative(),
  subscription_paid_paise: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .refine((n) => Number.isSafeInteger(n) && n <= MONEY_LIMIT),
});
export function MonthlySummary({ snapshot: s }: { snapshot: Snapshot }) {
  const [status, setStatus] = useState<z.infer<typeof statusSchema> | null>(
    null,
  );
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const result = await db()
          .rpc("gmail_plan_status")
          .abortSignal(controller.signal);
        check(result);
        const parsed = statusSchema.parse(result.data);
        if (!controller.signal.aborted) setStatus(parsed);
      } catch {
        /* Optional integration can be awaiting its migration. Never invent zero totals. */
      }
    })();
    return () => controller.abort();
  }, [s]);
  const recurring = monthlySubscriptions(s);
  const difference =
    recurring !== null
      ? safeTotal([s.profile.monthly_living_budget_paise, -recurring])
      : null;
  return (
    <section className="card private-panel" aria-labelledby="monthly-breakdown">
      <h2 id="monthly-breakdown">This month, connected</h2>
      <p>
        Living budget {money(s.profile.monthly_living_budget_paise)} includes
        subscriptions. Loan EMIs {money(s.summary.existing_emi_paise)} are
        separate.
      </p>
      <dl className="plan-breakdown">
        <div>
          <dt>Subscriptions · monthly estimate</dt>
          <dd>
            {recurring === null ? "Over supported range" : money(recurring)}
          </dd>
        </div>
        <div>
          <dt>Living budget after subscription estimate</dt>
          <dd>{difference === null ? "Unavailable" : money(difference)}</dd>
        </div>
        <div>
          <dt>Settled expenses · {displayDate(s.summary.month)}</dt>
          <dd>{money(s.summary.expense_paise)}</dd>
        </div>
        <div>
          <dt>Of those expenses, linked subscription charges</dt>
          <dd>
            {status
              ? money(status.subscription_paid_paise)
              : "Integration not available"}
          </dd>
        </div>
        <div>
          <dt>Email receipts awaiting review</dt>
          <dd>{status ? status.pending : "Integration not available"}</dd>
        </div>
      </dl>
      {difference !== null && difference < 0 && (
        <p className="form-error">
          Your subscription estimate exceeds your living budget. Review the
          budget or active subscriptions.
        </p>
      )}
      <p className="small-note">
        Yearly charges ÷ 12; weekly charges × 52 ÷ 12, rounded once to paise.
        Actual charge dates can differ. Approved receipts count once in settled
        expenses and category budgets. Pending receipts and subscription
        forecasts do not post money or change your planned budget.
      </p>
      <a className="text-link" href="#activity">
        Review email receipts →
      </a>
    </section>
  );
}
