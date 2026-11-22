import { useEffect, useRef, useState } from "react";
import { Button } from "../components/ui/button";
import { formatExactMoney as money } from "../lib/finance";
import { indiaMonth, moneyInput } from "./domain";
import type { Snapshot } from "./domain";
import { recurringDate } from "./recurring";
import { db, check } from "./workspace";
import { monthReportSchema } from "./workflowSchemas";
import type { AccountReport, MonthReport } from "./workflowSchemas";
export function MonthlyReview({ snapshot: s }: { snapshot: Snapshot }) {
  const [month, setMonth] = useState(
      recurringDate(indiaMonth(), -1).slice(0, 7),
    ),
    [account, setAccount] = useState(s.accounts[0]?.id ?? "");
  const [report, setReport] = useState<MonthReport | null>(null),
    [accountReport, setAccountReport] = useState<AccountReport | null>(null);
  const [opening, setOpening] = useState(""),
    [closing, setClosing] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [monthConfirmed, setMonthConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [reload, setReload] = useState(0);
  const mounted = useRef(true),
    working = useRef(false);
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
        const result = await db()
          .rpc("monthly_review_report", { p_month: month + "-01" })
          .abortSignal(c.signal);
        check(result);
        const data = monthReportSchema.parse(result.data);
        if (!c.signal.aborted) {
          setReport(data);
          setAccountReport(
            data.accounts.find((a) => a.account_id === account) ?? null,
          );
        }
      } catch {
        if (!c.signal.aborted)
          setMessage("Could not load this month. Retry when connected.");
      }
    })();
    return () => c.abort();
  }, [month, account, reload]);
  let difference: { opening: number; closing: number } | null = null;
  try {
    if (accountReport && opening && closing)
      difference = {
        opening: moneyInput(opening, true) - accountReport.opening_paise,
        closing: moneyInput(closing, true) - accountReport.closing_paise,
      };
  } catch {
    /* Inputs stay editable. */
  }
  const perform = async (kind: "account" | "month") => {
    if (working.current || !(kind === "account" ? confirmed : monthConfirmed))
      return;
    working.current = true;
    setBusy(true);
    setMessage("");
    try {
      const result =
        kind === "account"
          ? await db().rpc("reconcile_account", {
              p_account: account,
              p_month: month + "-01",
              p_opening: moneyInput(opening, true),
              p_closing: moneyInput(closing, true),
              p_expected_hash: accountReport!.ledger_hash,
            })
          : await db().rpc("review_month", {
              p_month: month + "-01",
              p_expected_hash: report!.report_hash,
            });
      check(result);
      if (mounted.current) {
        setMessage(
          kind === "account"
            ? "Account reconciled. No balances were changed."
            : "Month marked reviewed. Later edits will show this review as stale.",
        );
        setConfirmed(false);
        setMonthConfirmed(false);
        setReload((n) => n + 1);
      }
    } catch (e) {
      if (mounted.current)
        setMessage(
          e instanceof Error ? e.message : "Review could not be saved.",
        );
    } finally {
      working.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const reset = () => {
    setReport(null);
    setAccountReport(null);
    setOpening("");
    setClosing("");
    setConfirmed(false);
    setMonthConfirmed(false);
    setMessage("");
  };
  const reconciled =
    report?.accounts.every(
      (a) => a.baseline_covers_month && a.review?.current,
    ) ?? false;
  return (
    <div className="workflow-page">
      <section className="card private-panel">
        <h2>Close the month with confidence</h2>
        <p>
          Compare each full statement with the ledger. This report includes all
          recorded activity in the month, including entries hidden by your
          dashboard reporting cutoff. Transfers and card repayments are not
          spending.
        </p>
        <label>
          Review month
          <input
            type="month"
            value={month}
            disabled={busy}
            onChange={(e) => {
              setMonth(e.target.value);
              reset();
            }}
          />
        </label>
        {report && (
          <>
            <div className="investment-stats">
              {[
                ["Income", report.income_paise],
                ["Living expenses", report.expenses_paise],
                ["Principal repaid", report.principal_paise],
                ["Loan interest", report.interest_paise],
                ["Your investment contributions", report.self_invested_paise],
                ["Employer contributions", report.employer_invested_paise],
              ].map(([label, v]) => (
                <article className="investment-stat card" key={String(label)}>
                  <span>{label}</span>
                  <strong>{money(Number(v))}</strong>
                </article>
              ))}
            </div>
            <p>
              Loan cash paid {money(report.loan_cash_paise)} · Subscription
              charges included in expenses{" "}
              {money(report.subscription_paid_paise)} · Investment withdrawals{" "}
              {money(report.withdrawn_paise)}.
            </p>
            <p>
              Investment history and bank movements are separate records; these
              contribution totals do not imply another bank debit.
            </p>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Spent</th>
                    <th>Budget</th>
                    <th>Remaining</th>
                  </tr>
                </thead>
                <tbody>
                  {report.categories.map((c) => (
                    <tr key={c.id}>
                      <td>{c.name}</td>
                      <td>{money(c.spent_paise)}</td>
                      <td>
                        {c.budget_paise === null
                          ? "Not set"
                          : money(c.budget_paise)}
                      </td>
                      <td>
                        {c.budget_paise === null
                          ? "—"
                          : money(c.budget_paise - c.spent_paise)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>
              {report.review
                ? report.review.current
                  ? "This month is reviewed and current."
                  : "This month’s earlier review is stale because its data changed."
                : "This month has not been marked reviewed."}
            </p>
          </>
        )}
      </section>
      <section className="card private-panel">
        <h2>Statement reconciliation</h2>
        <label>
          Reconcile account
          <select
            value={account}
            disabled={busy}
            onChange={(e) => {
              setAccount(e.target.value);
              reset();
            }}
          >
            {s.accounts
              .filter((a) =>
                ["bank", "savings", "credit_card", "cash"].includes(a.type),
              )
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </select>
        </label>
        {accountReport ? (
          <>
            <p>
              {accountReport.row_count} ledger rows · Credits{" "}
              {money(accountReport.credits_paise)} · Debits{" "}
              {money(accountReport.debits_paise)}
            </p>
            {accountReport.baseline_covers_month ? (
              <p>
                Ledger opening {money(accountReport.opening_paise)} + credits −
                debits = closing {money(accountReport.closing_paise)}.
              </p>
            ) : (
              <p className="form-error">
                The saved account baseline starts after this month began. Review
                the actual opening date and amount in Accounts first; nothing
                will be backdated automatically.
              </p>
            )}
            {!accountReport.complete_month && (
              <p>
                This is a partial month. You can inspect it now and reconcile
                after the month ends.
              </p>
            )}
            <p>
              Enter signed ledger balances: a credit-card amount owed is
              negative. Compare every row and the full statement, not just these
              two totals.
            </p>
            <label>
              Statement opening balance (₹)
              <input
                aria-label="Statement opening balance"
                inputMode="decimal"
                value={opening}
                disabled={busy}
                onChange={(e) => {
                  setOpening(e.target.value);
                  setConfirmed(false);
                }}
              />
            </label>
            <label>
              Statement closing balance (₹)
              <input
                aria-label="Statement closing balance"
                inputMode="decimal"
                value={closing}
                disabled={busy}
                onChange={(e) => {
                  setClosing(e.target.value);
                  setConfirmed(false);
                }}
              />
            </label>
            {difference && (
              <p role="status">
                Opening difference {money(difference.opening)} · Closing
                difference {money(difference.closing)}
              </p>
            )}
            <p>
              {accountReport.review?.current
                ? "This account’s statement review is current."
                : accountReport.review
                  ? "Earlier reconciliation is stale. Compare it again."
                  : "Not reconciled yet."}
            </p>
            <label className="csv-confirm">
              <input
                type="checkbox"
                checked={confirmed}
                disabled={busy}
                onChange={(e) => setConfirmed(e.target.checked)}
              />{" "}
              I compared statement balances, dates and all movements, including
              excluded transfers and investment contributions.
            </label>
            <Button
              disabled={
                busy ||
                !confirmed ||
                !accountReport.complete_month ||
                !accountReport.baseline_covers_month ||
                !difference ||
                difference.opening !== 0 ||
                difference.closing !== 0
              }
              onClick={() => void perform("account")}
            >
              Confirm account reconciliation
            </Button>
          </>
        ) : (
          <p>No account report available. Choose an account and month.</p>
        )}
      </section>
      <section className="card private-panel">
        <h2>Monthly review status</h2>
        <p>
          {reconciled
            ? "All listed accounts have current reconciliations."
            : "Reconcile every listed account first."}{" "}
          Marking reviewed saves a snapshot; it does not prevent corrections.
          Later financial edits make the review stale.
        </p>
        <label className="csv-confirm">
          <input
            type="checkbox"
            checked={monthConfirmed}
            disabled={busy}
            onChange={(e) => setMonthConfirmed(e.target.checked)}
          />{" "}
          I have reviewed this month’s report.
        </label>
        <Button
          disabled={
            busy || !monthConfirmed || !report?.complete_month || !reconciled
          }
          onClick={() => void perform("month")}
        >
          Mark month reviewed
        </Button>
      </section>
      {message && <p role="status">{message}</p>}
    </div>
  );
}
