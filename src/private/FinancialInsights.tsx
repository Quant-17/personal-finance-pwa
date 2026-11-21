import { useState } from "react";
import {
  BarChart,
  Bar,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import type { Snapshot } from "./domain";
import { indiaMonth, safeTotal } from "./domain";
import { formatExactMoney as money } from "../lib/finance";
import { Button } from "../components/ui/button";
const colors = [
  "#357b65",
  "#516ac8",
  "#d99b48",
  "#9c70b5",
  "#338eac",
  "#c96a79",
  "#84904e",
];
export function FinancialInsights({ snapshot: s }: { snapshot: Snapshot }) {
  const [view, setView] = useState(s.cashflow.length ? "flow" : "assets"),
    [range, setRange] = useState("6"),
    [month, setMonth] = useState(
      s.cashflow.at(-1)?.month.slice(0, 7) ?? indiaMonth().slice(0, 7),
    );
  const [income, setIncome] = useState(true),
    [outflow, setOutflow] = useState(true),
    [selected, setSelected] = useState("");
  const flow = s.cashflow.slice(-Number(range));
  const spending = (s.category_spending ?? [])
    .filter((c) => c.month.startsWith(month))
    .map((c) => ({ key: c.category_id, name: c.name, value: c.amount_paise }));
  const assets = [
    ...s.accounts
      .filter((a) => a.balance_paise > 0)
      .map((a) => ({ key: a.id, name: a.name, value: a.balance_paise })),
    ...s.investments
      .filter((h) => !h.account_id && h.value_paise > 0)
      .map((h) => ({ key: h.id, name: h.name, value: h.value_paise })),
  ];
  const slices = view === "spending" ? spending : assets;
  const total = safeTotal(slices.map((x) => x.value));
  const picked = slices.find((x) => x.key === selected);
  const cashMonth = s.cashflow.find((x) => x.month.startsWith(month));
  return (
    <section
      className="card private-panel insights"
      aria-labelledby="financial-insights"
    >
      <div className="panel-heading">
        <div>
          <span className="eyebrow">YOUR MONEY IN FOCUS</span>
          <h2 id="financial-insights">Financial insights</h2>
          <p>Explore actual activity and your current asset mix.</p>
        </div>
        <span className="insight-chip">INR · live workspace</span>
      </div>
      <div
        className="insight-tabs"
        role="group"
        aria-label="Choose financial chart"
      >
        {[
          ["flow", "Cash flow"],
          ["spending", "Spending mix"],
          ["assets", "Asset mix"],
        ].map(([key, label]) => (
          <Button
            key={key}
            variant={view === key ? "default" : "outline"}
            aria-pressed={view === key}
            onClick={() => {
              setView(key);
              setSelected("");
            }}
          >
            {label}
          </Button>
        ))}
      </div>
      <div className="insight-controls">
        {view === "flow" ? (
          <>
            <label>
              Chart period
              <select value={range} onChange={(e) => setRange(e.target.value)}>
                <option value="3">Last 3 months</option>
                <option value="6">Last 6 months</option>
                <option value="12">Last 12 months</option>
              </select>
            </label>
            <Button
              variant="outline"
              aria-pressed={income}
              onClick={() => setIncome(!income)}
            >
              Income series
            </Button>
            <Button
              variant="outline"
              aria-pressed={outflow}
              onClick={() => setOutflow(!outflow)}
            >
              Outflow series
            </Button>
          </>
        ) : view === "spending" ? (
          <label>
            Spending month
            <input
              type="month"
              value={month}
              onChange={(e) => {
                setMonth(e.target.value);
                setSelected("");
              }}
            />
          </label>
        ) : (
          <p>Current positive assets · {money(total)}</p>
        )}
      </div>
      {view === "flow" ? (
        <>
          {flow.length ? (
            <div
              className="private-chart"
              aria-label="Interactive income and outflow chart"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={flow}
                  accessibilityLayer
                  onClick={(state) => {
                    const label = state?.activeLabel;
                    if (typeof label === "string") setMonth(label.slice(0, 7));
                  }}
                >
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="month"
                    tickFormatter={(v) => String(v).slice(0, 7)}
                  />
                  <YAxis width={88} tickFormatter={(v) => money(Number(v))} />
                  <Tooltip
                    formatter={(v) => money(Number(v))}
                    contentStyle={{
                      background: "var(--surface)",
                      borderColor: "var(--border)",
                      borderRadius: 12,
                    }}
                  />
                  {income && (
                    <Bar
                      dataKey="income_paise"
                      name="Income"
                      fill="var(--primary)"
                      radius={[6, 6, 0, 0]}
                      isAnimationActive={false}
                    />
                  )}{" "}
                  {outflow && (
                    <Bar
                      dataKey="outflow_paise"
                      name="Outflow"
                      fill="var(--teal)"
                      radius={[6, 6, 0, 0]}
                      isAnimationActive={false}
                    />
                  )}
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="insight-empty">
              <h3>Your tracking is ready to begin</h3>
              <p>
                No tracked settled activity yet. Your graphs will grow as you
                record transactions from your tracking start date.
              </p>
            </div>
          )}
          <label className="insight-month">
            Inspect cash-flow month
            <select value={month} onChange={(e) => setMonth(e.target.value)}>
              {s.cashflow.map((c) => (
                <option key={c.month} value={c.month.slice(0, 7)}>
                  {c.month.slice(0, 7)}
                </option>
              ))}
            </select>
          </label>
          {cashMonth && (
            <div className="insight-detail" aria-live="polite">
              <strong>
                {month} · Net cash flow{" "}
                {money(
                  safeTotal([cashMonth.income_paise, -cashMonth.outflow_paise]),
                )}
              </strong>
              <span>
                Income {money(cashMonth.income_paise)} · Outflow{" "}
                {money(cashMonth.outflow_paise)}
              </span>
            </div>
          )}
          <p className="small-note">
            Hover, tap or use the month selector for exact amounts. Outflow
            includes expenses and standalone loan payments, excludes transfers.
            Net cash flow is not your account balance.
          </p>
          <details>
            <summary>Cash-flow data table</summary>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Income</th>
                    <th>Outflow</th>
                  </tr>
                </thead>
                <tbody>
                  {flow.map((c) => (
                    <tr key={c.month}>
                      <td>{c.month.slice(0, 7)}</td>
                      <td>{money(c.income_paise)}</td>
                      <td>{money(c.outflow_paise)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      ) : (
        <>
          {total > 0 ? (
            <div className="insight-pie-grid">
              <div
                className="private-chart"
                aria-label={
                  view === "spending"
                    ? "Interactive expense category chart"
                    : "Interactive current asset chart"
                }
              >
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart accessibilityLayer>
                    <Pie
                      data={slices}
                      dataKey="value"
                      nameKey="name"
                      innerRadius="58%"
                      outerRadius="85%"
                      paddingAngle={3}
                      isAnimationActive={false}
                      onClick={(d) => setSelected(String(d.key))}
                    >
                      {slices.map((slice, i) => (
                        <Cell
                          key={slice.key}
                          fill={colors[i % colors.length]}
                          stroke="var(--surface)"
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v) => money(Number(v))}
                      contentStyle={{
                        background: "var(--surface)",
                        borderColor: "var(--border)",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="insight-legend">
                {slices.map((slice, i) => (
                  <li key={slice.key}>
                    <button
                      type="button"
                      aria-pressed={selected === slice.key}
                      onClick={() => setSelected(slice.key)}
                    >
                      <i style={{ background: colors[i % colors.length] }} />
                      <span>{slice.name}</span>
                      <strong>{money(slice.value)}</strong>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="insight-empty">
              {view === "spending"
                ? "No recorded category expenses in this month."
                : "Add account balances or investment valuations to see your asset mix."}
            </p>
          )}
          {picked && (
            <p className="insight-detail" aria-live="polite">
              {picked.name} · {money(picked.value)} ·{" "}
              {new Intl.NumberFormat("en-IN", {
                style: "percent",
                maximumFractionDigits: 1,
              }).format(picked.value / total)}{" "}
              of{" "}
              {view === "spending"
                ? "this month’s expenses"
                : "positive assets"}
            </p>
          )}
          <p className="small-note">
            {view === "spending"
              ? "Settled expenses only; EMIs and transfers stay separate. Select a category for its share. All category rows are shown in the interactive legend."
              : "Positive account balances plus investments not already linked to an account. Debts and negative balances are excluded from this mix; see Net worth for assets less liabilities. Select any asset to inspect its share."}
          </p>
        </>
      )}
    </section>
  );
}
