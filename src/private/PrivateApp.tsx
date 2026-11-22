import { useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import {
  LayoutDashboard,
  Wallet,
  ReceiptText,
  Target,
  Sparkles,
  CalendarClock,
  SlidersHorizontal,
  Moon,
  Sun,
  LogOut,
  RefreshCw,
  Plus,
  ShieldCheck,
  Landmark,
} from "lucide-react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { Button } from "../components/ui/button";
import { MonthlyReview } from "./MonthlyReview";
import { CashForecast } from "./CashForecast";
import { StatementTransfers } from "./StatementTransfers";
import { DataControls } from "./DataControls";
import { DebtSimulator } from "./DebtSimulator";
import { SavedSimulations } from "./SavedSimulations";
import type { SimulatorInputs } from "../components/Simulator";
import { formatExactMoney as money } from "../lib/finance";
import { AuthGate } from "./AuthGate";
import { Editor } from "./Editor";
import type { EditIntent, EditorKind } from "./Editor";
import { useWorkspace, db, check } from "./workspace";
import { displayDate, moneyToInput, safeTotal } from "./domain";
import { loanSchedule } from "./schedule";
import { LoanDocumentImport } from "./LoanDocumentImport";
import { Investments } from "./Investments";
import { StatementImport } from "./StatementImport";
import { RecurringDeductions } from "./RecurringDeductions";
import { LoanProgress } from "./LoanProgress";
import { FinancialInsights } from "./FinancialInsights";
import { MonthlySummary } from "./MonthlySummary";
import { CsvImport } from "./CsvImport";
import "./private.css";
const pages = [
  ["overview", "Overview", LayoutDashboard],
  ["accounts", "Accounts", Wallet],
  ["activity", "Transactions", ReceiptText],
  ["investments", "Savings & investments", Landmark],
  ["budgets", "Budgets & goals", Target],
  ["commitments", "Loans & subscriptions", CalendarClock],
  ["simulator", "Buy simulator", Sparkles],
  ["debt-plan", "Debt repayment simulator", CalendarClock],
  ["settings", "Monthly plan", SlidersHorizontal],
  ["data", "Data & privacy", ShieldCheck],
  ["review", "Monthly review", ReceiptText],
  ["forecast", "Cash-flow forecast", CalendarClock],
] as const;
type Page = (typeof pages)[number][0];
const currentPage = (): Page =>
  pages.find(([id]) => "#" + id === window.location.hash)?.[0] ?? "overview";
export default function PrivateApp() {
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem("folio-theme") ?? "light";
    } catch {
      return "light";
    }
  });
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    try {
      localStorage.setItem("folio-theme", theme);
    } catch {
      /* appearance is optional */
    }
  }, [theme]);
  const toggleTheme = () =>
    setTheme((value) => (value === "dark" ? "light" : "dark"));
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  return (
    <>
      {needRefresh && (
        <div className="private-update" role="status">
          A new version is ready. Save your changes before updating.
          <Button onClick={() => void updateServiceWorker(true)}>
            Update app
          </Button>
        </div>
      )}
      <AuthGate theme={theme} toggleTheme={toggleTheme} component={Workspace} />
    </>
  );
}
function Workspace({
  user,
  signOut,
  theme,
  toggleTheme,
}: {
  user: User;
  signOut: () => Promise<void>;
  theme: string;
  toggleTheme: () => void;
}) {
  const {
    snapshot: s,
    entries,
    count,
    page: ledgerPage,
    setPage: setLedgerPage,
    loading,
    error,
    refresh,
    includeEarlier,
    setIncludeEarlier,
  } = useWorkspace();
  const [page, setPage] = useState<Page>(currentPage);
  const [editor, setEditor] = useState<EditIntent | null>(null);
  const [documentReview, setDocumentReview] = useState<{
    id: string | null;
  } | null>(null);
  const [loanNotice, setLoanNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const [importNotice, setImportNotice] = useState("");
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const [inputs, setInputs] = useState<SimulatorInputs>({
    price: "50000",
    apr: "12",
    months: "12",
    delay: "6",
    method: "cash",
  });
  useEffect(() => {
    const change = () => {
      setPage(currentPage());
      setEditor(null);
      setDocumentReview(null);
    };
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  const open = (kind: EditorKind) => setEditor({ kind });
  const action = async (
    perform: () => Promise<unknown>,
    confirmation?: string,
  ) => {
    if (busy.current || (confirmation && !window.confirm(confirmation))) return;
    busy.current = true;
    setPending(true);
    setActionError("");
    try {
      await perform();
      refresh();
    } catch (failure) {
      setActionError(
        failure instanceof Error
          ? failure.message
          : "The change could not be saved. Refresh before retrying.",
      );
    } finally {
      busy.current = false;
      setPending(false);
    }
  };
  const remove = (
    table: "budgets" | "savings_goals" | "subscriptions" | "categories",
    id: string,
    label: string,
  ) =>
    void action(async () => {
      check(await db().from(table).delete().eq("id", id));
    }, `Delete ${label}? Goal allocations will be released. Posted transactions are retained.`);
  const add = (kind: EditorKind, label: string) => (
    <Button variant="outline" onClick={() => open(kind)}>
      <Plus size={16} />
      {label}
    </Button>
  );
  const empty = (text: string) => <p className="empty-message">{text}</p>;
  const accountName = (id: string) =>
    s?.accounts.find((a) => a.id === id)?.name ?? "Account";
  const categoryName = (id: string) =>
    s?.categories.find((c) => c.id === id)?.name ?? "Category";
  const plan = s
    ? {
        income: s.profile.monthly_income_paise,
        expenses: s.profile.monthly_living_budget_paise,
        existingEmi: s.summary.existing_emi_paise,
        liquidCash: s.summary.liquid_cash_paise,
        reserve: s.profile.emergency_reserve_paise,
        savings: 0,
        month: s.summary.month,
      }
    : null;
  const subscriptionsPanel = s && (
    <section className="card private-panel">
      <div className="panel-heading">
        <h2>Subscriptions</h2>
        {add("subscription", "Add subscription")}
      </div>
      <p>
        Planned recurring charges stay inside your living budget. Statement
        imports record actual expenses once; review recurring charges in your
        monthly plan.
      </p>
      {s.subscriptions.map((sub) => (
        <article className="ledger-row" key={sub.id}>
          <div>
            <strong>
              {sub.name}
              {!sub.active ? " · Paused" : ""}
            </strong>
            <span>
              {sub.cadence} · schedule from {displayDate(sub.next_due_on)}
            </span>
          </div>
          <strong>{money(sub.amount_paise)}</strong>
          <Button
            variant="ghost"
            onClick={() =>
              setEditor({
                kind: "subscription",
                record: {
                  id: sub.id,
                  values: {
                    name: sub.name,
                    amount: moneyToInput(sub.amount_paise),
                    cadence: sub.cadence,
                    date: sub.next_due_on,
                  },
                },
              })
            }
          >
            Edit subscription
          </Button>
          <Button
            variant="outline"
            disabled={pending}
            onClick={() =>
              void action(async () => {
                check(
                  await db()
                    .from("subscriptions")
                    .update({ active: !sub.active })
                    .eq("id", sub.id),
                );
              })
            }
          >
            {sub.active ? "Pause" : "Resume"}
          </Button>
          <Button
            variant="ghost"
            disabled={pending}
            onClick={() => remove("subscriptions", sub.id, sub.name)}
          >
            Delete
          </Button>
        </article>
      ))}
      {!s.subscriptions.length && empty("No recurring subscriptions.")}
    </section>
  );
  return (
    <div className="private-shell">
      <aside className="private-sidebar">
        <a href="#overview" className="brand">
          folio<span className="brand-dot">.</span>
        </a>
        <span className="workspace-badge">
          <ShieldCheck size={14} />
          Private workspace
        </span>
        <nav aria-label="Main navigation">
          {pages.map(([id, label, Icon]) => (
            <a
              key={id}
              href={"#" + id}
              aria-current={page === id ? "page" : undefined}
            >
              <Icon size={19} />
              {label}
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span>INR · Asia/Kolkata</span>
          <Button variant="ghost" onClick={toggleTheme}>
            {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
            Appearance
          </Button>
          <Button variant="ghost" onClick={() => void signOut()}>
            <LogOut size={17} />
            Sign out
          </Button>
        </div>
      </aside>
      <main className="private-main">
        <header className="private-topbar">
          <span>Your money, thoughtfully managed.</span>
          <Button
            variant="ghost"
            disabled={loading}
            onClick={refresh}
            aria-label="Refresh records"
          >
            <RefreshCw size={17} />
          </Button>
        </header>
        <div className="private-content">
          <div className="private-heading">
            <div>
              <span className="eyebrow">YOUR PERSONAL FINANCE SPACE</span>
              <h1>{pages.find(([id]) => id === page)?.[1]}</h1>
              <p>
                {s?.profile.display_name
                  ? `Welcome, ${s.profile.display_name}. `
                  : ""}
                A clear view of what you have, owe and plan.
              </p>
            </div>
            {s && add("entry", "Add transaction")}
          </div>
          {(error || actionError) && (
            <div className="form-error" role="alert">
              {error || actionError}
              <Button variant="outline" onClick={refresh}>
                Reload records
              </Button>
            </div>
          )}
          {loading && <p role="status">Loading your records…</p>}
          {s && (
            <>
              {s.profile.tracking_start_date && (
                <div className="tracking-banner">
                  <CalendarClock size={20} />
                  <div>
                    <strong>
                      Transaction tracking from{" "}
                      {displayDate(s.profile.tracking_start_date)}
                    </strong>
                    <p>
                      Earlier history and balances are preserved. Planned
                      deductions are separate from actual payments.
                    </p>
                  </div>
                  <a href="#settings">Manage dates →</a>
                </div>
              )}
              {page === "overview" && (
                <>
                  <div className="private-stats">
                    {[
                      [
                        "Net worth",
                        s.summary.net_worth_paise,
                        "Accounts and separate investments, less debt",
                      ],
                      [
                        "Available liquid cash",
                        s.summary.liquid_cash_paise,
                        "Active cash accounts less goal earmarks",
                      ],
                      [
                        "Income this month",
                        s.summary.income_paise,
                        "Settled income only",
                      ],
                      [
                        "Outflow this month",
                        safeTotal([
                          s.summary.expense_paise,
                          s.summary.loan_payments_paise,
                        ]),
                        "Expenses plus loan principal and interest",
                      ],
                    ].map(([label, value, note]) => (
                      <section className="card private-stat" key={label}>
                        <span>{label}</span>
                        <strong>{money(Number(value))}</strong>
                        <small>{note}</small>
                      </section>
                    ))}
                  </div>
                  {!s.accounts.length && !s.investments.length && (
                    <section className="card welcome-card">
                      <ShieldCheck size={28} />
                      <h2>A fresh start for your finances.</h2>
                      <p>
                        Your workspace starts empty. Add an account with its
                        opening balance, then record activity from that date
                        onward.
                      </p>
                      {add("account", "Add your first account")}
                      {add("plan", "Set monthly plan")}
                    </section>
                  )}
                  <FinancialInsights snapshot={s} />
                  <section className="card private-panel">
                    <h2>Plan for the month</h2>
                    <p>
                      Planned income {money(s.profile.monthly_income_paise)} −
                      living expenses{" "}
                      {money(s.profile.monthly_living_budget_paise)} − active
                      loan EMI {money(s.summary.existing_emi_paise)}.
                    </p>
                    <strong className="large-amount">
                      {money(
                        safeTotal([
                          s.profile.monthly_income_paise,
                          -s.profile.monthly_living_budget_paise,
                          -s.summary.existing_emi_paise,
                        ]),
                      )}
                    </strong>
                    <p>
                      Planned surplus. Subscriptions belong within your
                      living-expense plan.
                    </p>
                    {add("plan", "Adjust plan")}
                    <a href="#simulator" className="text-link">
                      Try a purchase decision →
                    </a>
                  </section>
                </>
              )}
              {page === "accounts" && (
                <>
                  <div className="page-actions">
                    {add("account", "Add account")}
                    {add("transfer", "Transfer money")}
                  </div>
                  <p className="small-note">
                    Opening balances plus posted activity determine balances.
                    Negative credit-card balances represent debt. Archiving
                    preserves history and excludes an account from available
                    cash.
                  </p>
                  <div className="record-grid">
                    {s.accounts.map((a) => (
                      <section className="card private-panel" key={a.id}>
                        <span className="eyebrow">
                          {a.type.replace("_", " ")}
                          {a.archived_at ? " · Archived" : ""}
                        </span>
                        <h2>{a.name}</h2>
                        <strong className="large-amount">
                          {money(a.balance_paise)}
                        </strong>
                        <p>
                          Opened {displayDate(a.opening_date)} ·{" "}
                          {money(a.opening_balance_paise)}
                        </p>
                        <Button
                          variant="ghost"
                          onClick={() =>
                            setEditor({
                              kind: "account",
                              record: {
                                id: a.id,
                                values: {
                                  name: a.name,
                                  type: a.type,
                                  amount: moneyToInput(a.opening_balance_paise),
                                  date: a.opening_date,
                                },
                              },
                            })
                          }
                        >
                          Edit account
                        </Button>
                        <Button
                          variant="outline"
                          disabled={pending}
                          onClick={() =>
                            void action(async () => {
                              check(
                                await db()
                                  .from("accounts")
                                  .update({
                                    archived_at: a.archived_at
                                      ? null
                                      : new Date().toISOString(),
                                  })
                                  .eq("id", a.id),
                              );
                            })
                          }
                        >
                          {a.archived_at
                            ? "Restore account"
                            : "Archive account"}
                        </Button>
                      </section>
                    ))}
                  </div>
                  {!s.accounts.length &&
                    empty("No accounts yet. Add your first account to begin.")}
                </>
              )}
              {page === "activity" && (
                <>
                  {s.profile.tracking_start_date && (
                    <label className="history-toggle">
                      <input
                        type="checkbox"
                        checked={includeEarlier}
                        onChange={(e) => {
                          setIncludeEarlier(e.target.checked);
                          setLedgerPage(0);
                        }}
                      />{" "}
                      Show earlier records for reference (excluded from tracking
                      reports)
                    </label>
                  )}
                  {importNotice && <p role="status">{importNotice}</p>}
                  <StatementTransfers snapshot={s} onSaved={refresh} />
                  <StatementImport
                    snapshot={s}
                    onImported={({ inserted, skipped }) => {
                      setImportNotice(
                        `Statement import complete: ${inserted} added, ${skipped} matched existing entries.`,
                      );
                      refresh();
                    }}
                  />
                  <details className="other-import">
                    <summary>Other: CSV import</summary>
                    <CsvImport
                      snapshot={s}
                      onImported={({ inserted, skipped, excluded }) => {
                        setImportNotice(
                          `Import complete: ${inserted} added, ${skipped} matched the ledger at posting, ${excluded} excluded from the selection.`,
                        );
                        refresh();
                      }}
                    />
                  </details>
                  <div className="page-actions">
                    {add("entry", "Add transaction")}
                    {add("transfer", "Transfer")}
                    {add("payment", "Loan payment")}
                  </div>
                  <section className="card private-panel">
                    <h2>Your ledger</h2>
                    <p>
                      Income, expenses, paired transfers and loan repayments.
                      Transfer legs cancel each other. Deleting a loan payment
                      restores its outstanding principal.
                    </p>
                    <div className="ledger-list">
                      {entries.map((e) => (
                        <article className="ledger-row" key={e.id}>
                          <div>
                            <strong>
                              {e.description || e.kind.replace("_", " ")}
                            </strong>
                            <span>
                              {accountName(e.account_id)} ·{" "}
                              {e.category_id
                                ? categoryName(e.category_id)
                                : e.kind.replace("_", " ")}{" "}
                              · {displayDate(e.occurred_on)}
                            </span>
                          </div>
                          <strong
                            className={e.amount_paise > 0 ? "positive" : ""}
                          >
                            {money(e.amount_paise)}
                          </strong>
                          <div className="row-actions">
                            {["income", "expense"].includes(e.kind) && (
                              <Button
                                variant="ghost"
                                onClick={() =>
                                  setEditor({ kind: "entry", entry: e })
                                }
                              >
                                Edit
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              disabled={pending}
                              onClick={() => {
                                const requestId = crypto.randomUUID();
                                void action(
                                  async () => {
                                    check(
                                      await db().rpc("delete_entry", {
                                        p_entry: e.id,
                                        p_request_id: requestId,
                                      }),
                                    );
                                  },
                                  e.transfer_id
                                    ? "Delete both sides of this transfer?"
                                    : "Delete this posted transaction?",
                                );
                              }}
                            >
                              Delete
                            </Button>
                          </div>
                        </article>
                      ))}
                    </div>
                    {!entries.length &&
                      empty("No posted activity on this page.")}
                    <div className="page-actions">
                      <Button
                        variant="outline"
                        disabled={ledgerPage === 0 || loading}
                        onClick={() => setLedgerPage(ledgerPage - 1)}
                      >
                        Previous
                      </Button>
                      <span>
                        Page {ledgerPage + 1} · {count} entries
                      </span>
                      <Button
                        variant="outline"
                        disabled={(ledgerPage + 1) * 50 >= count || loading}
                        onClick={() => setLedgerPage(ledgerPage + 1)}
                      >
                        Next
                      </Button>
                    </div>
                  </section>
                </>
              )}
              {page === "budgets" && (
                <>
                  <div className="page-actions">
                    {add("budget", "Set monthly budget")}
                    {add("goal", "Create goal")}
                    {add("allocation", "Earmark savings")}
                  </div>
                  <section className="card private-panel">
                    <h2>This month’s budgets</h2>
                    <p>
                      Category limits track settled expenses in the current
                      India calendar month.
                    </p>
                    {s.budgets.map((b) => (
                      <article className="budget-record" key={b.id}>
                        <div>
                          <strong>{categoryName(b.category_id)}</strong>
                          <span>
                            {money(b.spent_paise)} of {money(b.limit_paise)}
                          </span>
                        </div>
                        <progress
                          max={Math.max(1, b.limit_paise)}
                          value={b.spent_paise}
                          aria-label={
                            categoryName(b.category_id) + " budget used"
                          }
                        />
                        <Button
                          variant="ghost"
                          disabled={pending}
                          onClick={() => remove("budgets", b.id, "this budget")}
                        >
                          Delete
                        </Button>
                      </article>
                    ))}
                    {!s.budgets.length &&
                      empty(
                        "No category limits set. Set a monthly budget to track spending.",
                      )}
                  </section>
                  <section className="card private-panel">
                    <h2>Savings with a purpose</h2>
                    <p>
                      Earmarks reserve existing cash. They do not create an
                      extra asset and can become underfunded if you later spend
                      the source balance.
                    </p>
                    {s.goals.map((g) => (
                      <article className="goal-record" key={g.id}>
                        <h3>{g.name}</h3>
                        <strong>
                          {money(g.allocated_paise)} / {money(g.target_paise)}
                        </strong>
                        {g.target_on && (
                          <p>Target {displayDate(g.target_on)}</p>
                        )}
                        <progress
                          max={g.target_paise}
                          value={g.allocated_paise}
                          aria-label={g.name + " allocated"}
                        />
                        {s.allocations
                          .filter((a) => a.goal_id === g.id)
                          .map((a) => (
                            <p key={a.id}>
                              {accountName(a.account_id)} ·{" "}
                              {money(a.amount_paise)}
                            </p>
                          ))}
                        <Button
                          variant="ghost"
                          onClick={() =>
                            setEditor({
                              kind: "goal",
                              record: {
                                id: g.id,
                                values: {
                                  name: g.name,
                                  amount: moneyToInput(g.target_paise),
                                  date: g.target_on ?? "",
                                },
                              },
                            })
                          }
                        >
                          Edit goal
                        </Button>
                        <Button
                          variant="ghost"
                          disabled={pending}
                          onClick={() => remove("savings_goals", g.id, g.name)}
                        >
                          Delete goal
                        </Button>
                      </article>
                    ))}
                    {!s.goals.length && empty("No savings goals yet.")}
                  </section>
                </>
              )}
              {page === "commitments" && (
                <>
                  <div className="page-actions">
                    {add("loan", "Track loan")}
                    <Button
                      variant="outline"
                      onClick={() => setDocumentReview({ id: null })}
                    >
                      Import loan PDF
                    </Button>
                    {add("payment", "Record repayment")}
                  </div>
                  <LoanProgress snapshot={s} onRefresh={refresh} />
                  {loanNotice && <p role="status">{loanNotice}</p>}
                  {documentReview && (
                    <LoanDocumentImport
                      key={documentReview.id ?? "new"}
                      snapshot={s}
                      loanId={documentReview.id}
                      onTarget={(id) => setDocumentReview({ id })}
                      onClose={() => setDocumentReview(null)}
                      onSaved={() => {
                        setDocumentReview(null);
                        setLoanNotice(
                          "Reviewed loan saved. No bank transactions were posted.",
                        );
                        refresh();
                      }}
                    />
                  )}
                  <section className="card private-panel">
                    <h2>Loans</h2>
                    <p>
                      Estimated EMI uses monthly reducing balance. Actual lender
                      principal and interest must be recorded manually. Closing
                      a loan stops its planned EMI; it does not erase remaining
                      debt.
                    </p>
                    {s.loans.map((l) => (
                      <article className="ledger-row" key={l.id}>
                        <div>
                          <strong>
                            {l.name} · {l.status}
                          </strong>
                          <span>
                            {l.apr}% annual interest · {l.tenure_months} months
                            ·{" "}
                            {l.reported_emi_paise !== null
                              ? "quoted"
                              : "estimated"}{" "}
                            EMI {money(l.reported_emi_paise ?? l.emi_paise)}
                            {l.card_account_id && " · included in card balance"}
                          </span>
                        </div>
                        <strong>{money(l.outstanding_paise)} remaining</strong>
                        <Button
                          variant="ghost"
                          onClick={() =>
                            l.has_document
                              ? setDocumentReview({ id: l.id })
                              : setEditor({
                                  kind: "loan",
                                  record: {
                                    id: l.id,
                                    values: {
                                      name: l.name,
                                      amount: moneyToInput(l.principal_paise),
                                      apr: String(l.apr),
                                      tenure: String(l.tenure_months),
                                      date: l.start_date,
                                    },
                                  },
                                })
                          }
                        >
                          Edit loan
                        </Button>
                        <Button
                          variant="outline"
                          disabled={
                            pending ||
                            (l.status === "closed" && l.outstanding_paise === 0)
                          }
                          onClick={() =>
                            void action(async () => {
                              check(
                                await db()
                                  .from("loans")
                                  .update({
                                    status:
                                      l.status === "active"
                                        ? "closed"
                                        : "active",
                                  })
                                  .eq("id", l.id),
                              );
                            })
                          }
                        >
                          {l.status === "active"
                            ? "Close tracking"
                            : "Reopen tracking"}
                        </Button>
                        {!l.has_document && (
                          <details className="loan-schedule">
                            <summary>Estimated repayment schedule</summary>
                            <p>
                              Original tracking principal, fixed APR, monthly
                              payments. Actual repayments may differ. No fees or
                              GST; final payment clears paise rounding.
                            </p>
                            <table>
                              <thead>
                                <tr>
                                  <th>Month</th>
                                  <th>Payment</th>
                                  <th>Principal</th>
                                  <th>Interest</th>
                                  <th>Balance</th>
                                </tr>
                              </thead>
                              <tbody>
                                {loanSchedule(
                                  l.principal_paise,
                                  l.apr,
                                  l.tenure_months,
                                ).map((row) => (
                                  <tr key={row.month}>
                                    <td>{row.month}</td>
                                    <td>{money(row.paymentPaise)}</td>
                                    <td>{money(row.principalPaise)}</td>
                                    <td>{money(row.interestPaise)}</td>
                                    <td>{money(row.balancePaise)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </details>
                        )}
                      </article>
                    ))}
                    {!s.loans.length && empty("No tracked loans.")}
                  </section>
                  <RecurringDeductions
                    snapshot={s}
                    onRefresh={refresh}
                    onEdit={setEditor}
                  />
                  {subscriptionsPanel}
                </>
              )}
              {page === "simulator" && plan && (
                <>
                  <p className="private-notice">
                    Uses your monthly plan and available liquid cash after
                    earmarks. A comparison only; it never posts a purchase or
                    creates a loan.
                  </p>
                  <SavedSimulations
                    inputs={inputs}
                    onChange={setInputs}
                    financialContext={plan}
                  />
                </>
              )}
              {page === "debt-plan" && (
                <DebtSimulator snapshot={s} onRefresh={refresh} />
              )}
              {page === "investments" && (
                <Investments snapshot={s} onRefresh={refresh} />
              )}
              {page === "review" && <MonthlyReview snapshot={s} />}
              {page === "forecast" && (
                <CashForecast snapshot={s} onRefresh={refresh} />
              )}
              {page === "data" && (
                <DataControls
                  snapshot={s}
                  owner={user.id}
                  email={user.email ?? ""}
                  onDeleted={signOut}
                />
              )}
              {page === "settings" && (
                <>
                  <MonthlySummary snapshot={s} />
                  <RecurringDeductions
                    snapshot={s}
                    onRefresh={refresh}
                    onEdit={setEditor}
                  />
                  {subscriptionsPanel}
                  <section className="card private-panel">
                    <h2>Your monthly assumptions</h2>
                    <p>
                      Income {money(s.profile.monthly_income_paise)} · Living{" "}
                      {money(s.profile.monthly_living_budget_paise)} · Reserve{" "}
                      {money(s.profile.emergency_reserve_paise)}
                    </p>
                    {add("plan", "Edit monthly plan")}
                    <p className="small-note">
                      Forecast assumptions are separate from settled income and
                      expenses. Loan EMIs come from tracked active loans.
                      Subscriptions are included in the living budget you enter.
                    </p>
                  </section>
                  <section className="card private-panel">
                    <div className="panel-heading">
                      <h2>Categories</h2>
                      {add("category", "Add category")}
                    </div>
                    {s.categories.map((c) => (
                      <div key={c.id} className="category-record">
                        <span>
                          {c.name} · {c.kind}
                        </span>
                        <Button
                          variant="ghost"
                          onClick={() =>
                            setEditor({
                              kind: "category",
                              record: {
                                id: c.id,
                                values: { name: c.name, kind: c.kind },
                              },
                            })
                          }
                        >
                          Edit category
                        </Button>
                        <Button
                          variant="ghost"
                          disabled={pending}
                          onClick={() => remove("categories", c.id, c.name)}
                        >
                          Delete
                        </Button>
                      </div>
                    ))}
                    <p className="small-note">
                      Categories referenced by posted entries or budgets cannot
                      be deleted.
                    </p>
                  </section>
                  <section className="card private-panel">
                    <h2>Privacy on this device</h2>
                    <p>
                      Financial records stay in memory and in your Supabase
                      database. The offline cache contains the app shell only.
                      Supabase stores the authentication session on this device
                      until you sign out.
                    </p>
                    <p>Signed in as {user.email}</p>
                    <Button variant="outline" onClick={() => void signOut()}>
                      Sign out on this device
                    </Button>
                  </section>
                </>
              )}
              {editor && (
                <Editor
                  intent={editor}
                  snapshot={s}
                  onClose={() => setEditor(null)}
                  onSaved={refresh}
                />
              )}
            </>
          )}
        </div>
        <footer className="private-footer">
          <ShieldCheck size={14} />
          Private records · INR · India calendar dates
          <span className="app-version" aria-label="App version">
            v{__FOLIO_VERSION__}
          </span>
        </footer>
      </main>
    </div>
  );
}
