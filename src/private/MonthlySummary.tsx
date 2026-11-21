import { formatExactMoney as money } from "../lib/finance";
import { monthlySubscriptions } from "./monthlyPlan";
import { displayDate, safeTotal } from "./domain";
import type { Snapshot } from "./domain";
export function MonthlySummary({ snapshot: s }: { snapshot: Snapshot }) {
  const recurring = monthlySubscriptions(s);
  const difference =
    recurring !== null
      ? safeTotal([s.profile.monthly_living_budget_paise, -recurring])
      : null;
  return (
    <section className="card private-panel" aria-labelledby="monthly-breakdown">
      <h2 id="monthly-breakdown">Your monthly overview</h2>
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
      </dl>
      {difference !== null && difference < 0 && (
        <p className="form-error">
          Your subscription estimate exceeds your living budget. Review the
          budget or active subscriptions.
        </p>
      )}
      <p className="small-note">
        Yearly charges ÷ 12; weekly charges × 52 ÷ 12, rounded once to paise.
        Actual charge dates can differ. Confirmed statement rows count once in
        settled expenses and category budgets. Subscription forecasts do not
        post money or add a second expense.
      </p>
      <a className="text-link" href="#activity">
        Import monthly statement →
      </a>
    </section>
  );
}
