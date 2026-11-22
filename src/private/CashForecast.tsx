import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { Button } from "../components/ui/button";
import { formatExactMoney as money } from "../lib/finance";
import { db, check } from "./workspace";
import { indiaDate, moneyInput, moneyToInput } from "./domain";
import type { Snapshot } from "./domain";
import { cashForecast, planningSchema, plannedEventSchema } from "./forecast";
import type { PlanningSettings, PlannedEvent } from "./forecast";
import { moneyValue } from "./workflowSchemas";
const empty: PlanningSettings = {
  salary_day: null,
  salary_account_id: null,
  spending_account_id: null,
  loan_funding: {},
};
const contextSchema = z.object({
  as_of: z.string(),
  non_subscription_spent_paise: moneyValue,
});
export function CashForecast({
  snapshot: s,
  onRefresh,
}: {
  snapshot: Snapshot;
  onRefresh: () => void;
}) {
  const [settings, setSettings] = useState<PlanningSettings>(empty),
    [events, setEvents] = useState<PlannedEvent[]>([]),
    [context, setContext] = useState<z.infer<typeof contextSchema> | null>(
      null,
    ),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [reload, setReload] = useState(0),
    [inspect, setInspect] = useState(1),
    [editing, setEditing] = useState<PlannedEvent | null>(null);
  const [name, setName] = useState(""),
    [kind, setKind] = useState<PlannedEvent["kind"]>("expense"),
    [account, setAccount] = useState(""),
    [destination, setDestination] = useState(""),
    [amount, setAmount] = useState(""),
    [date, setDate] = useState(indiaDate()),
    [cadence, setCadence] = useState<PlannedEvent["cadence"]>("once"),
    [within, setWithin] = useState(true);
  const mounted = useRef(true),
    running = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    const c = new AbortController();
    void (async () => {
      try {
        const results = await Promise.all([
          db().from("planning_settings").select("*").abortSignal(c.signal),
          db()
            .from("planned_cash_events")
            .select("*")
            .order("due_on")
            .limit(101)
            .abortSignal(c.signal),
          db().rpc("forecast_context").abortSignal(c.signal),
        ]);
        results.forEach(check);
        const a = z.array(planningSchema).max(1).parse(results[0].data),
          b = z.array(plannedEventSchema).max(100).parse(results[1].data),
          d = contextSchema.parse(results[2].data);
        if (!c.signal.aborted) {
          setSettings(a[0] ?? empty);
          setEvents(b);
          setContext(d);
          setError("");
        }
      } catch {
        if (!c.signal.aborted)
          setError(
            "Could not load complete forecast settings and actual spending. Retry when connected.",
          );
      }
    })();
    return () => c.abort();
  }, [reload, s]);
  const projection = useMemo(() => {
    try {
      return {
        value: context
          ? cashForecast(
              s,
              settings,
              events,
              context.as_of,
              context.non_subscription_spent_paise,
            )
          : null,
        error: "",
      };
    } catch (e) {
      return {
        value: null,
        error: e instanceof Error ? e.message : "Review forecast assumptions.",
      };
    }
  }, [s, settings, events, context]);
  const cash = s.accounts.filter(
    (a) => !a.archived_at && ["bank", "savings", "cash"].includes(a.type),
  );
  const action = async (run: () => Promise<void>) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setNotice("");
    try {
      await run();
      if (mounted.current) {
        setNotice("Forecast settings saved. No money was posted.");
        setReload((n) => n + 1);
      }
    } catch (e) {
      if (mounted.current)
        setNotice(e instanceof Error ? e.message : "Could not save this plan.");
    } finally {
      running.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const clear = () => {
    setEditing(null);
    setName("");
    setAmount("");
    setDate(indiaDate());
    setDestination("");
  };
  const saveEvent = () =>
    action(async () => {
      const value = moneyInput(amount);
      if (value <= 0) throw Error("Use a positive amount.");
      const r = await db().rpc("save_planned_event", {
        p_id: editing?.id ?? null,
        p_event: {
          name,
          kind,
          account_id: account,
          to_account_id: kind === "transfer" ? destination : null,
          amount_paise: value,
          due_on: date,
          cadence,
          within_budget: within,
          active: true,
        },
      });
      check(r);
      if (mounted.current) clear();
    });
  const value = projection.value,
    day = value?.rows[Math.min(inspect, 90)];
  return (
    <div className="workflow-page">
      <section className="card private-panel">
        <h2>Your next 90 days</h2>
        <p>
          Project active bank/cash balances from the latest recorded closing
          balances. Salary, living costs, subscriptions, loan instalments and
          planned events are forecasts only. Today’s already-recorded activity
          is not counted again.
        </p>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => {
            onRefresh();
            setReload((n) => n + 1);
          }}
        >
          Refresh actual balances
        </Button>
        <details open={!value}>
          <summary>Forecast dates and funding accounts</summary>
          <label>
            Salary day
            <input
              aria-label="Forecast salary day"
              type="number"
              min={1}
              max={31}
              value={settings.salary_day ?? ""}
              onChange={(e) =>
                setSettings((x) => ({
                  ...x,
                  salary_day: e.target.value ? Number(e.target.value) : null,
                }))
              }
            />
          </label>
          <label>
            Salary account
            <select
              aria-label="Forecast salary account"
              value={settings.salary_account_id ?? ""}
              onChange={(e) =>
                setSettings((x) => ({
                  ...x,
                  salary_account_id: e.target.value || null,
                }))
              }
            >
              <option value="">Choose account</option>
              {cash.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Living costs / fallback subscription account
            <select
              aria-label="Forecast spending account"
              value={settings.spending_account_id ?? ""}
              onChange={(e) =>
                setSettings((x) => ({
                  ...x,
                  spending_account_id: e.target.value || null,
                }))
              }
            >
              <option value="">Choose account</option>
              {cash.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          {s.loans
            .filter(
              (l) =>
                !l.card_account_id &&
                l.status === "active" &&
                l.outstanding_paise > 0,
            )
            .map((l) => (
              <label key={l.id}>
                Funding · {l.name}
                <select
                  aria-label={`Forecast funding ${l.name}`}
                  value={settings.loan_funding[l.id] ?? ""}
                  onChange={(e) =>
                    setSettings((x) => {
                      const funding = { ...x.loan_funding };
                      if (e.target.value) funding[l.id] = e.target.value;
                      else delete funding[l.id];
                      return { ...x, loan_funding: funding };
                    })
                  }
                >
                  <option value="">Choose account</option>
                  {cash.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          <p>
            Income and living amounts come from Monthly plan. Subscriptions are
            already inside the living budget. Non-subscription spending is
            spread across days; planned bills marked “inside living budget”
            reduce that spread instead of adding the bill twice. Dates at
            month-end are clamped to the last day. Card bills require a planned
            bank-to-card transfer; card-linked EMI principal is not added again.
          </p>
          <Button
            disabled={busy}
            onClick={() =>
              void action(async () => {
                const r = await db().rpc("save_planning", {
                  p_settings: planningSchema.parse(settings),
                });
                check(r);
              })
            }
          >
            Save forecast settings
          </Button>
        </details>
        {(error || projection.error) && (
          <p role="status">{error || projection.error}</p>
        )}
        {value && (
          <>
            <p>
              Protected reserve and earmarks: {money(value.reserve)} ·{" "}
              {value.firstLow
                ? `First potential shortfall: ${value.firstLow}`
                : "No modelled shortfall in this period."}
            </p>
            {value.warnings.map((w) => (
              <p className="form-error" key={w}>
                {w}
              </p>
            ))}
            <div
              className="workflow-chart"
              aria-label="Projected cash balance chart"
            >
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={value.rows}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" minTickGap={60} />
                  <YAxis
                    tickFormatter={(n) => `₹${Math.round(Number(n) / 100000)}k`}
                  />
                  <Tooltip formatter={(v) => money(Number(v))} />
                  <Line
                    dataKey="cash"
                    name="Cash"
                    stroke="var(--primary)"
                    dot={false}
                  />
                  <Line
                    dataKey="spendable"
                    name="Above reserve / earmarks"
                    stroke="var(--green)"
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <label>
              Inspect forecast day
              <input
                aria-label="Inspect forecast day"
                type="range"
                min={0}
                max={90}
                value={inspect}
                onChange={(e) => setInspect(Number(e.target.value))}
              />
            </label>
            {day && (
              <>
                <h3>{day.date}</h3>
                <p>
                  Projected cash {money(day.cash)} · Above reserve / earmarks{" "}
                  {money(day.spendable)}
                </p>
                {value.accounts.map((a) => (
                  <p key={a.id}>
                    {a.name}: {money(day.accounts[a.id])}
                  </p>
                ))}
                {day.events.map((e, i) => (
                  <p key={i}>
                    {e.name} · {money(e.amount)}
                  </p>
                ))}
              </>
            )}
          </>
        )}
      </section>
      <section className="card private-panel">
        <h2>Planned bills and cash movements</h2>
        <p>
          These entries never create actual income, expenses, transfers or
          repayments. Confirm actual payments separately through statements or
          the ledger.
        </p>
        <label>
          Plan name
          <input
            aria-label="Planned cash name"
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          Plan type
          <select
            aria-label="Planned cash type"
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
          >
            <option value="expense">Expense</option>
            <option value="income">Income</option>
            <option value="transfer">
              Transfer / card payment / investment funding
            </option>
          </select>
        </label>
        <label>
          Account
          <select
            aria-label="Planned cash account"
            value={account}
            onChange={(e) => setAccount(e.target.value)}
          >
            <option value="">Choose cash account</option>
            {cash.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        {kind === "transfer" && (
          <label>
            Destination
            <select
              aria-label="Planned cash destination"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
            >
              <option value="">Choose owned destination</option>
              {s.accounts
                .filter((a) => !a.archived_at && a.id !== account)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </select>
          </label>
        )}
        <label>
          Amount (₹)
          <input
            aria-label="Planned cash amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <label>
          Expected date
          <input
            aria-label="Planned cash date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label>
          Cadence
          <select
            aria-label="Planned cash cadence"
            value={cadence}
            onChange={(e) => setCadence(e.target.value as typeof cadence)}
          >
            <option value="once">Once</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
        </label>
        {kind === "expense" && (
          <label>
            <input
              type="checkbox"
              checked={within}
              onChange={(e) => setWithin(e.target.checked)}
            />{" "}
            Already inside the living budget
          </label>
        )}
        <div className="page-actions">
          <Button
            disabled={
              busy ||
              !name.trim() ||
              !account ||
              !amount ||
              (kind === "transfer" && !destination)
            }
            onClick={() => void saveEvent()}
          >
            {editing ? "Update planned event" : "Add planned event"}
          </Button>
          {editing && (
            <Button variant="ghost" onClick={clear}>
              Cancel editing
            </Button>
          )}
        </div>
        {events.map((e) => (
          <article key={e.id} className="category-record">
            <span>
              {e.name} · {money(e.amount_paise)} · {e.due_on} · {e.cadence}
            </span>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setEditing(e);
                setName(e.name);
                setKind(e.kind);
                setAccount(e.account_id);
                setDestination(e.to_account_id ?? "");
                setAmount(moneyToInput(e.amount_paise));
                setDate(e.due_on);
                setCadence(e.cadence);
                setWithin(e.within_budget);
              }}
            >
              Edit planned event
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  const r = await db().rpc("save_planned_event", {
                    p_id: e.id,
                    p_event: {},
                    p_delete: true,
                  });
                  check(r);
                })
              }
            >
              Remove planned event
            </Button>
          </article>
        ))}
      </section>
      {notice && <p role="status">{notice}</p>}
    </div>
  );
}
