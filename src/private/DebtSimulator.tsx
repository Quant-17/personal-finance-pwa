import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { Button } from "../components/ui/button";
import { formatExactMoney as money } from "../lib/finance";
import {
  indiaMonth,
  displayDate,
  moneyInput,
  moneyToInput,
  safeTotal,
} from "./domain";
import type { Snapshot } from "./domain";
import { recurringDate } from "./recurring";
import { debtSources, simulateDebtPlan } from "./debtPlan";
import type { Debt, PlanResult, Strategy } from "./debtPlan";
const monthLabel = (date: string) =>
  new Intl.DateTimeFormat("en-IN", {
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date(date + "T00:00:00+05:30"));
const labels: Record<Strategy, string> = {
  minimum: "Minimum payments",
  avalanche: "Highest interest first",
  snowball: "Smallest balance first",
};
type Patch = {
  apr?: string;
  minimum?: string;
  allowExtra?: boolean;
  feePercent?: string;
};
type Scenario = {
  income?: string;
  living?: string;
  savings: string;
  percent: number;
  lump: string;
  start: string;
  debts: Record<string, Patch>;
};
const initial = (): Scenario => ({
  savings: "0",
  percent: 100,
  lump: "0",
  start: recurringDate(indiaMonth(), 1).slice(0, 7),
  debts: {},
});
export function DebtSimulator({
  snapshot: s,
  onRefresh,
}: {
  snapshot: Snapshot;
  onRefresh: () => void;
}) {
  const [scenario, setScenario] = useState<Scenario>(initial),
    [strategy, setStrategy] = useState<Strategy>("avalanche"),
    [inspect, setInspect] = useState(1);
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") onRefresh();
    }, 60000);
    return () => clearInterval(timer);
  }, [onRefresh]);
  const source = useMemo(() => debtSources(s), [s]);
  const calculation = useMemo(() => {
    try {
      const income = moneyInput(
          scenario.income ?? moneyToInput(s.profile.monthly_income_paise),
        ),
        living = moneyInput(
          scenario.living ??
            moneyToInput(s.profile.monthly_living_budget_paise),
        ),
        savings = moneyInput(scenario.savings),
        lump = moneyInput(scenario.lump);
      const spare = Math.max(
        0,
        s.summary.liquid_cash_paise - s.profile.emergency_reserve_paise,
      );
      const debts: Debt[] = source.debts.map((d) => {
        const p = scenario.debts[d.id] ?? {};
        if (
          (p.apr === undefined && d.apr === null) ||
          (p.minimum === undefined && d.minimum === null)
        )
          throw new Error(
            "Enter the annual rate and monthly minimum for every card/overdraft balance below.",
          );
        const apr = Number(p.apr ?? d.apr),
          feePercent = Number(p.feePercent ?? 0);
        if (p.apr === "" || p.feePercent === "")
          throw new Error(
            "Enter an annual rate and extra-payment charge, including 0 if applicable.",
          );
        return {
          ...d,
          apr,
          minimum: p.minimum !== undefined ? moneyInput(p.minimum) : d.minimum!,
          allowExtra: p.allowExtra ?? true,
          feePercent,
        };
      });
      const minimum = safeTotal(debts.map((d) => d.minimum));
      const surplus = income - living - savings - minimum;
      const extra =
        Number.isSafeInteger(surplus) && surplus > 0
          ? Math.floor((surplus * scenario.percent) / 100)
          : 0;
      const capacity = {
        income,
        living,
        savings,
        lump,
        spare,
        minimum,
        surplus,
        extra,
        budget:
          surplus < 0
            ? Math.max(0, income - living - savings)
            : minimum + extra,
      };
      if (source.issues.length)
        return { capacity, error: source.issues.join(" "), plans: null };
      if (income - living - savings < 0)
        return {
          capacity,
          error: `Your plan is short by ${money(living + savings - income)} per month before debt payments. Review income, living costs or savings.`,
          plans: null,
        };
      if (lump > spare)
        return {
          capacity,
          error: `The one-time payment exceeds spare cash of ${money(spare)} after your reserve and existing earmarks.`,
          plans: null,
        };
      if (
        scenario.start < indiaMonth().slice(0, 7) ||
        !/^\d{4}-(0[1-9]|1[0-2])$/.test(scenario.start)
      )
        throw new Error("Choose this month or a later first repayment month.");
      const plans = (["minimum", "avalanche", "snowball"] as Strategy[]).map(
        (st) => simulateDebtPlan(debts, st, capacity.budget, lump),
      );
      return { capacity, error: "", plans };
    } catch (e) {
      return {
        capacity: null,
        error:
          e instanceof Error ? e.message : "Review the repayment assumptions.",
        plans: null,
      };
    }
  }, [s, source, scenario]);
  const plans = calculation.plans,
    plan = plans?.find((p) => p.strategy === strategy),
    base = plans?.find((p) => p.strategy === "minimum"),
    cap = calculation.capacity;
  const recommended = plans
    ?.filter((p) => p.status === "paid_off")
    .sort(
      (a, b) =>
        a.interest + a.fees - (b.interest + b.fees) ||
        (a.months ?? 0) - (b.months ?? 0),
    )[0];
  const dateFor = (p: PlanResult) =>
    p.status === "unaffordable"
      ? "Minimums exceed the affordable budget"
      : p.months === 0
        ? "Before first month"
        : p.months !== null
          ? monthLabel(recurringDate(scenario.start + "-01", p.months - 1))
          : "Not cleared in model";
  const graph = plans
    ? Array.from(
        { length: Math.max(...plans.map((p) => p.rows.length)) + 1 },
        (_, month) => {
          const row: Record<string, number | null> = { month };
          for (const p of plans)
            row[p.strategy] =
              month === 0
                ? p.afterLump
                : (p.rows[month - 1]?.closing ??
                  (p.status === "paid_off" ? 0 : null));
          return row;
        },
      )
    : [];
  const row = plan?.rows[Math.min(inspect, plan.rows.length) - 1];
  const patch = (id: string, values: Patch) =>
    setScenario((old) => ({
      ...old,
      debts: { ...old.debts, [id]: { ...old.debts[id], ...values } },
    }));
  return (
    <>
      <section
        className="card private-panel debt-simulator"
        aria-labelledby="debt-simulator-title"
      >
        <div className="panel-heading">
          <div>
            <span className="eyebrow">A PATH TO DEBT FREEDOM</span>
            <h2 id="debt-simulator-title">Your adaptive repayment plan</h2>
            <p>
              Recalculates from saved finances and your scenario assumptions.
            </p>
          </div>
          <Button variant="outline" onClick={onRefresh}>
            Refresh finances
          </Button>
        </div>
        <p className="small-note">
          Balances update after saved transactions/imports, when you return to
          the app, and every minute while this page is visible. This is an
          estimate from your records; it does not access banks or make payments.
          Subscriptions are already inside living costs.
        </p>
        <div className="statement-controls">
          <label>
            Scenario monthly income (₹)
            <input
              inputMode="decimal"
              value={
                scenario.income ?? moneyToInput(s.profile.monthly_income_paise)
              }
              onChange={(e) =>
                setScenario({ ...scenario, income: e.target.value })
              }
            />
          </label>
          <label>
            Scenario living costs including subscriptions (₹)
            <input
              inputMode="decimal"
              value={
                scenario.living ??
                moneyToInput(s.profile.monthly_living_budget_paise)
              }
              onChange={(e) =>
                setScenario({ ...scenario, living: e.target.value })
              }
            />
          </label>
          <label>
            Monthly savings to protect (₹)
            <input
              inputMode="decimal"
              value={scenario.savings}
              onChange={(e) =>
                setScenario({ ...scenario, savings: e.target.value })
              }
            />
          </label>
          <label>
            First repayment month
            <input
              type="month"
              min={indiaMonth().slice(0, 7)}
              value={scenario.start}
              onChange={(e) =>
                setScenario({ ...scenario, start: e.target.value })
              }
            />
          </label>
          <label>
            One-time payment from spare cash (₹)
            <input
              inputMode="decimal"
              value={scenario.lump}
              onChange={(e) =>
                setScenario({ ...scenario, lump: e.target.value })
              }
            />
          </label>
          <label>
            Use monthly surplus · {scenario.percent}%
            <input
              aria-label="Use monthly surplus"
              type="range"
              min={0}
              max={100}
              value={scenario.percent}
              onChange={(e) =>
                setScenario({ ...scenario, percent: Number(e.target.value) })
              }
            />
          </label>
        </div>
        <div className="page-actions">
          <Button
            variant="outline"
            onClick={() => {
              setScenario(initial());
              setInspect(1);
            }}
          >
            Use current finances
          </Button>
          <a href="#settings">Edit saved monthly plan →</a>
        </div>
        <p className="small-note">
          Typed income, costs and debt terms are scenario overrides; they remain
          pinned until reset. Debt balances always follow the latest saved
          snapshot. Scenario controls stay in memory and do not change your
          saved plan.
        </p>
        {cap && (
          <div className="private-stats debt-capacity">
            <div>
              <span>Minimum debt payments / month</span>
              <strong>{money(cap.minimum)}</strong>
            </div>
            <div>
              <span>Extra from monthly surplus</span>
              <strong>{money(cap.extra)}</strong>
            </div>
            <div>
              <span>Monthly repayment budget</span>
              <strong>{money(cap.budget)}</strong>
            </div>
            <div>
              <span>Spare cash after reserve & earmarks</span>
              <strong>{money(cap.spare)}</strong>
            </div>
          </div>
        )}
        {cap && cap.surplus < 0 && !calculation.error && (
          <p className="form-error">
            Quoted minimums exceed available monthly funds by{" "}
            {money(-cap.surplus)}. A plan is affordable only when its actual
            minimums, after any one-time payoff and final-payment caps, fit
            within that budget.
          </p>
        )}
        {calculation.error && (
          <p role="alert" className="form-error">
            {calculation.error}
          </p>
        )}
        {!source.debts.length && !source.issues.length && (
          <p className="empty-message">
            No tracked debt balances. Add loans or a card balance to build a
            repayment plan.
          </p>
        )}
        <p className="small-note">
          Estimates assume monthly reducing interest, 0% extra-payment charges
          and eligible prepayments until you review the assumptions below.
          Flat-rate and card contracts can differ.
        </p>
        <details
          open={source.debts.some((d) => d.apr === null || d.minimum === null)}
        >
          <summary>Debt balances and prepayment assumptions</summary>
          <p className="small-note">
            Rates default to saved nominal rates and this model assumes monthly
            reducing balance. Review flat-rate contracts, card terms, lock-ins
            and eligibility. Extra payments are assumed allowed and charges 0%
            until you edit them; enter a charge inclusive of applicable taxes.
            Existing quoted EMIs are minimums, not recalculated EMIs.
            Closed/archived records with balances are retained; linked card-EMI
            principal is counted once.
          </p>
          {source.issues.map((issue) => (
            <p className="form-error" key={issue}>
              {issue}
            </p>
          ))}
          <div className="debt-input-grid">
            {source.debts.map((d) => {
              const p = scenario.debts[d.id] ?? {};
              return (
                <article className="debt-input" key={d.id}>
                  <h3>{d.name}</h3>
                  <strong>{money(d.balance)} outstanding</strong>
                  <span className="small-note">
                    {d.kind.replaceAll("_", " ")}
                  </span>
                  <label>
                    Annual reducing-balance rate (%)
                    <input
                      aria-label={`Annual rate ${d.name}`}
                      type="number"
                      min={0}
                      max={120}
                      step="0.0001"
                      value={p.apr ?? d.apr ?? ""}
                      onChange={(e) => patch(d.id, { apr: e.target.value })}
                    />
                  </label>
                  <label>
                    Monthly minimum (₹)
                    <input
                      aria-label={`Minimum ${d.name}`}
                      inputMode="decimal"
                      value={
                        p.minimum ??
                        (d.minimum !== null ? moneyToInput(d.minimum) : "")
                      }
                      onChange={(e) => patch(d.id, { minimum: e.target.value })}
                    />
                  </label>
                  <label className="history-toggle">
                    <input
                      type="checkbox"
                      checked={p.allowExtra ?? true}
                      onChange={(e) =>
                        patch(d.id, { allowExtra: e.target.checked })
                      }
                    />{" "}
                    Assume extra payments allowed
                  </label>
                  <label>
                    Charge on each extra payment (%)
                    <input
                      aria-label={`Prepayment charge ${d.name}`}
                      type="number"
                      min={0}
                      max={120}
                      step="0.01"
                      value={p.feePercent ?? "0"}
                      onChange={(e) =>
                        patch(d.id, { feePercent: e.target.value })
                      }
                    />
                  </label>
                </article>
              );
            })}
          </div>
        </details>
      </section>
      {plans && source.debts.length > 0 && (
        <section className="card private-panel debt-simulator">
          <h2>Compare your routes</h2>
          <p>
            Keep the monthly debt budget steady as loans close; freed EMIs roll
            into eligible remaining debt. Minimum-only uses no surplus or
            one-time cash.
          </p>
          <div className="debt-comparisons">
            {plans.map((p) => (
              <button
                type="button"
                key={p.strategy}
                aria-pressed={strategy === p.strategy}
                onClick={() => {
                  setStrategy(p.strategy);
                  setInspect(1);
                }}
              >
                <span>{labels[p.strategy]}</span>
                <strong>
                  {p.months === null
                    ? "Unresolved"
                    : `${p.months} ${p.months === 1 ? "month" : "months"}`}
                </strong>
                <span>{dateFor(p)}</span>
                <span>
                  Interest + charges {money(p.interest + p.fees)}
                  {p.status !== "paid_off" ? " accrued so far" : ""}
                </span>
                {recommended?.strategy === p.strategy && (
                  <small>Lowest modelled cost</small>
                )}
              </button>
            ))}
          </div>
          {!recommended && (
            <p className="form-error">
              No affordable strategy clears all balances within the model’s
              360-month/range limits. Review minimums, rates and affordability;
              no debt-free date is claimed.
            </p>
          )}
          {plan && (
            <>
              <div className="insight-detail">
                <strong>
                  {labels[plan.strategy]} · {dateFor(plan)}
                </strong>
                <span>
                  {plan.status === "paid_off" && base?.status === "paid_off"
                    ? base.interest + base.fees >= plan.interest + plan.fees
                      ? `Estimated interest/charges saved: ${money(base.interest + base.fees - plan.interest - plan.fees)}`
                      : `Estimated extra interest/charges: ${money(plan.interest + plan.fees - base.interest - base.fees)}`
                    : "Unresolved plans do not provide a full-lifetime cost comparison."}
                </span>
              </div>
              <div
                className="private-chart"
                aria-label="Debt balance comparison chart"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={graph} accessibilityLayer>
                    <CartesianGrid stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="month" />
                    <YAxis width={90} tickFormatter={(v) => money(Number(v))} />
                    <Tooltip
                      formatter={(v) => money(Number(v))}
                      labelFormatter={(v) =>
                        Number(v) === 0
                          ? "After optional one-time payment"
                          : monthLabel(
                              recurringDate(
                                scenario.start + "-01",
                                Number(v) - 1,
                              ),
                            )
                      }
                      contentStyle={{
                        background: "var(--surface)",
                        borderColor: "var(--border)",
                      }}
                    />
                    <Line
                      dataKey="minimum"
                      name="Minimum only"
                      stroke="var(--muted)"
                      dot={false}
                      isAnimationActive={false}
                    />
                    <Line
                      dataKey="avalanche"
                      name="Highest interest first"
                      stroke="var(--primary)"
                      strokeWidth={3}
                      dot={false}
                      isAnimationActive={false}
                    />
                    <Line
                      dataKey="snowball"
                      name="Smallest balance first"
                      stroke="var(--teal)"
                      dot={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              {plan.status !== "paid_off" && (
                <p className="form-error">
                  {plan.status === "unaffordable"
                    ? `Monthly minimums exceed this budget by ${money(plan.shortfall)}. No payment schedule was generated.`
                    : plan.status === "limit"
                      ? "Projection stopped at the supported financial range."
                      : "Balances remain after 360 months; minimums may not amortize the debt."}{" "}
                  Displayed costs cover only simulated rows.
                </p>
              )}
              <h3>Before the first month</h3>
              <p>
                Debt reduction {money(plan.lumpPaid)} · charges{" "}
                {money(plan.lumpFees)} · unused one-time cash{" "}
                {money(plan.unusedLump)}
              </p>
              {plan.lumpPayments.map((p) => (
                <p key={p.id}>
                  {source.debts.find((d) => d.id === p.id)?.name} · reduce by{" "}
                  {money(p.extra)} + charges {money(p.fee)}
                </p>
              ))}
              {plan.rows.length > 0 && (
                <>
                  <label>
                    Inspect repayment month ·{" "}
                    {Math.min(inspect, plan.rows.length)}
                    <input
                      aria-label="Inspect repayment month"
                      type="range"
                      min={1}
                      max={plan.rows.length}
                      value={Math.min(inspect, plan.rows.length)}
                      onChange={(e) => setInspect(Number(e.target.value))}
                    />
                  </label>
                  {row && (
                    <>
                      <div className="insight-detail" aria-live="polite">
                        <strong>
                          {monthLabel(
                            recurringDate(
                              scenario.start + "-01",
                              row.month - 1,
                            ),
                          )}
                        </strong>
                        <span>
                          Payments {money(row.paid)} · interest{" "}
                          {money(row.interest)} · charges {money(row.fees)} ·
                          remaining {money(row.closing)}
                        </span>
                      </div>
                      <div className="table-scroll">
                        <table>
                          <thead>
                            <tr>
                              <th>Debt</th>
                              <th>Scheduled minimum date</th>
                              <th>Minimum</th>
                              <th>Extra</th>
                              <th>Charge</th>
                              <th>Closing</th>
                            </tr>
                          </thead>
                          <tbody>
                            {row.payments.map((p) => {
                              const d = source.debts.find(
                                (d) => d.id === p.id,
                              )!;
                              const month = recurringDate(
                                scenario.start + "-01",
                                row.month - 1,
                              );
                              const offset = d.anchor
                                ? (Number(month.slice(0, 4)) -
                                    Number(d.anchor.slice(0, 4))) *
                                    12 +
                                  Number(month.slice(5, 7)) -
                                  Number(d.anchor.slice(5, 7))
                                : 0;
                              return (
                                <tr key={p.id}>
                                  <td>{d.name}</td>
                                  <td>
                                    {d.anchor
                                      ? displayDate(
                                          recurringDate(d.anchor, offset),
                                        )
                                      : "Review statement date"}
                                  </td>
                                  <td>{money(p.minimum)}</td>
                                  <td>{money(p.extra)}</td>
                                  <td>{money(p.fee)}</td>
                                  <td>{money(p.closing)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </>
              )}
              <h3>Estimated payoff order</h3>
              <ol>
                {plan.payoffs.map((p) => (
                  <li key={p.id}>
                    {source.debts.find((d) => d.id === p.id)?.name} ·{" "}
                    {p.month === 0
                      ? "one-time payment"
                      : monthLabel(
                          recurringDate(scenario.start + "-01", p.month - 1),
                        )}
                  </li>
                ))}
              </ol>
              <details>
                <summary>Monthly plan data</summary>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Month</th>
                        <th>Payments</th>
                        <th>Interest included</th>
                        <th>Extra charges</th>
                        <th>Unused budget</th>
                        <th>Debt remaining</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plan.rows.map((r) => (
                        <tr key={r.month}>
                          <td>
                            {recurringDate(
                              scenario.start + "-01",
                              r.month - 1,
                            ).slice(0, 7)}
                          </td>
                          <td>{money(r.paid)}</td>
                          <td>{money(r.interest)}</td>
                          <td>{money(r.fees)}</td>
                          <td>{money(r.unused)}</td>
                          <td>{money(r.closing)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
              <p className="small-note">
                Full monthly interest is rounded half-up to paise. Extra-payment
                fees consume the same cash budget. Rates, minimums and income
                stay constant in each scenario; bonuses, purchases, daily
                interest, missed payments and lender-specific rebates are not
                inferred. Confirm lender terms before acting. No transfers,
                repayments or savings withdrawals are created.
              </p>
            </>
          )}
        </section>
      )}
    </>
  );
}
