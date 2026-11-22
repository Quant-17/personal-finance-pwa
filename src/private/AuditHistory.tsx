import { useEffect, useState } from "react";
import { z } from "zod";
import { Button } from "../components/ui/button";
import { formatExactMoney as money } from "../lib/finance";
import { db, check } from "./workspace";
import { displayDate } from "./domain";
const schema = z.array(
  z.object({
    id: z.uuid(),
    table_name: z.string(),
    action: z.string(),
    before_data: z.record(z.string(), z.unknown()).nullable(),
    after_data: z.record(z.string(), z.unknown()).nullable(),
    occurred_at: z.string(),
    provenance: z.string(),
    reason: z.string(),
  }),
);
const names: Record<string, string> = {
  profiles: "Monthly plan",
  accounts: "Account",
  categories: "Category",
  transactions: "Transaction",
  loans: "Loan",
  loan_payments: "Repayment",
  subscriptions: "Subscription",
  budgets: "Budget",
  savings_goals: "Savings goal",
  goal_allocations: "Savings allocation",
  investment_holdings: "Investment",
  investment_entries: "Investment history",
  statement_rules: "Remembered rule",
  account_reconciliations: "Reconciliation",
  month_reviews: "Monthly review",
  planned_cash_events: "Planned cash flow",
  planning_settings: "Forecast settings",
  debt_terms: "Lender assumptions",
  loan_document_details: "Reviewed loan terms",
  saved_simulations: "Saved comparison",
};
const value = (key: string, v: unknown) => {
  if (v === null || v === undefined) return "Not set";
  if (
    key.endsWith("_paise") &&
    Number.isSafeInteger(Number(v)) &&
    Math.abs(Number(v)) <= 1e12
  )
    return money(Number(v));
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
};
export function AuditHistory() {
  const [rows, setRows] = useState<z.infer<typeof schema>>([]),
    [page, setPage] = useState(0),
    [table, setTable] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    const c = new AbortController();
    void (async () => {
      try {
        let q = db()
          .from("audit_events")
          .select("*")
          .order("occurred_at", { ascending: false })
          .order("id")
          .range(page * 50, page * 50 + 49);
        if (table) q = q.eq("table_name", table);
        const r = await q.abortSignal(c.signal);
        check(r);
        const data = schema.parse(r.data);
        if (!c.signal.aborted) {
          setRows(data);
          setError("");
        }
      } catch {
        if (!c.signal.aborted)
          setError("Could not load change history. Retry when connected.");
      }
    })();
    return () => c.abort();
  }, [page, table]);
  return (
    <section className="card private-panel">
      <h2>Financial change history</h2>
      <p>
        Server-recorded changes begin when this feature was installed; earlier
        activity is not invented. These records cannot be edited through the
        app. Imported archive history is labelled separately.
      </p>
      <label>
        Change history section
        <select
          value={table}
          onChange={(e) => {
            setTable(e.target.value);
            setPage(0);
            setRows([]);
          }}
        >
          <option value="">All sections</option>
          {Object.entries(names).map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </label>
      {rows.map((r) => {
        const keys = [
          ...new Set([
            ...Object.keys(r.before_data ?? {}),
            ...Object.keys(r.after_data ?? {}),
          ]),
        ].filter(
          (k) =>
            !["id", "user_id", "created_at", "updated_at"].includes(k) &&
            JSON.stringify(r.before_data?.[k]) !==
              JSON.stringify(r.after_data?.[k]),
        );
        return (
          <details key={r.id}>
            <summary>
              {displayDate(r.occurred_at)} ·{" "}
              {names[r.table_name] ?? "Financial record"} ·{" "}
              {(
                {
                  INSERT: "Created",
                  UPDATE: "Changed",
                  DELETE: "Removed",
                  RESTORE: "Restored",
                } as Record<string, string>
              )[r.action] ?? r.action}
            </summary>
            {r.provenance === "archive" && (
              <p>Imported history — not independently verified.</p>
            )}
            {r.reason && <p>{r.reason}</p>}
            <dl>
              {keys.map((k) => (
                <div key={k}>
                  <dt>{k.replace(/_paise$/, "").replaceAll("_", " ")}</dt>
                  <dd className="audit-value">
                    {value(k, r.before_data?.[k])} →{" "}
                    {value(k, r.after_data?.[k])}
                  </dd>
                </div>
              ))}
            </dl>
          </details>
        );
      })}
      {!rows.length && !error && <p>No changes recorded in this section.</p>}
      {error && <p role="status">{error}</p>}
      <div className="page-actions">
        <Button
          variant="outline"
          disabled={page === 0}
          onClick={() => setPage((p) => p - 1)}
        >
          Previous changes
        </Button>
        <span>Page {page + 1}</span>
        <Button
          variant="outline"
          disabled={rows.length < 50}
          onClick={() => setPage((p) => p + 1)}
        >
          Next changes
        </Button>
      </div>
    </section>
  );
}
