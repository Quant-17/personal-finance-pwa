import { useState } from "react";
import type { Snapshot, Entry } from "./domain";
import { displayDate, indiaDate, indiaMonth, safeTotal } from "./domain";
import { deductionsInMonth } from "./recurring";
import { formatExactMoney as money } from "../lib/finance";
import { Button } from "../components/ui/button";
import { db, check } from "./workspace";
import type { EditIntent } from "./Editor";
export function RecurringDeductions({
  snapshot: s,
  onRefresh,
  onEdit,
}: {
  snapshot: Snapshot;
  onRefresh: () => void;
  onEdit: (intent: EditIntent) => void;
}) {
  const [month, setMonth] = useState(
    () =>
      [
        indiaMonth().slice(0, 7),
        s.profile.tracking_start_date?.slice(0, 7) ?? "",
      ]
        .sort()
        .at(-1)!,
  );
  const [loanId, setLoanId] = useState(s.loans[0]?.id ?? "");
  const [anchor, setAnchor] = useState(s.loans[0]?.deduction_anchor_on ?? "");
  const [subscription, setSubscription] = useState(
    s.subscriptions[0]?.id ?? "",
  );
  const [expense, setExpense] = useState("");
  const [choices, setChoices] = useState<Entry[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);
  const events = deductionsInMonth(s, month);
  let plannedTotal: string;
  try {
    plannedTotal = money(safeTotal(events.map((e) => e.amount_paise)));
  } catch {
    plannedTotal = "Over supported range";
  }
  const history = (s.deductions ?? []).filter((d) =>
    d.paid_on.startsWith(month),
  );
  const [selectedKind, setSelectedKind] = useState("all");
  async function action(fn: () => Promise<void>, message: string) {
    if (pending) return;
    setPending(true);
    setError("");
    setNotice("");
    try {
      await fn();
      setNotice(message);
      onRefresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not save deduction details.",
      );
    } finally {
      setPending(false);
    }
  }
  async function loadExpenses() {
    await action(async () => {
      const from = month + "-01";
      const until = new Date(
        Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 1),
      )
        .toISOString()
        .slice(0, 10);
      const r = await db()
        .from("transactions")
        .select("*")
        .eq("kind", "expense")
        .is("subscription_id", null)
        .is("card_emi_loan_id", null)
        .gte(
          "occurred_on",
          [from, s.profile.tracking_start_date ?? from].sort().at(-1)!,
        )
        .lt("occurred_on", until)
        .order("occurred_on", { ascending: false })
        .limit(200);
      check(r);
      setChoices((r.data ?? []) as Entry[]);
      setExpense(r.data?.[0]?.id ?? "");
    }, "Loaded up to 200 unlinked expenses for the selected month.");
  }
  return (
    <section
      className="card private-panel"
      aria-labelledby="deduction-calendar"
    >
      <div className="panel-heading">
        <div>
          <span className="eyebrow">DATES, WITHOUT THE GUESSWORK</span>
          <h2 id="deduction-calendar">Deduction calendar</h2>
        </div>
        <label>
          Deduction month
          <input
            aria-label="Deduction month"
            type="month"
            value={month}
            onChange={(e) => {
              setMonth(e.target.value);
              setChoices([]);
              setExpense("");
            }}
          />
        </label>
      </div>
      <p>
        Saved expected dates for subscriptions and EMIs. Planned dates never
        post money. Confirmed dates come from your recorded payments.
      </p>
      {s.profile.tracking_start_date && (
        <p className="small-note">
          Tracking from {displayDate(s.profile.tracking_start_date)}. Earlier
          balances and loan history are preserved.
        </p>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <div className="deduction-total">
        <span>Planned deductions in {month}</span>
        <strong>{plannedTotal}</strong>
      </div>
      <p className="small-note">
        Subscriptions sit inside the living budget; EMIs stay separate. Card
        EMIs are shown as card charges, not a second bank repayment.
      </p>
      <div className="page-actions" role="group" aria-label="Filter deductions">
        {["all", "loan", "subscription"].map((kind) => (
          <Button
            key={kind}
            variant={selectedKind === kind ? "default" : "outline"}
            aria-pressed={selectedKind === kind}
            onClick={() => setSelectedKind(kind)}
          >
            {kind === "all"
              ? "All deductions"
              : kind === "loan"
                ? "EMIs"
                : "Subscriptions"}
          </Button>
        ))}
      </div>
      <ol className="deduction-timeline">
        {events
          .filter((e) => selectedKind === "all" || e.kind === selectedKind)
          .map((e) => (
            <li key={e.key}>
              <time dateTime={e.due_on}>
                <strong>{e.due_on.slice(8)}</strong>
                {new Intl.DateTimeFormat("en-IN", {
                  month: "short",
                  timeZone: "UTC",
                }).format(new Date(e.due_on))}
              </time>
              <div>
                <strong>{e.name}</strong>
                <span>
                  {e.kind === "loan" ? "EMI" : "Subscription"}
                  {e.card ? " · card charge" : ""} ·{" "}
                  {e.due_on < indiaDate()
                    ? "Date passed · check actual history"
                    : "Planned"}
                </span>
              </div>
              <strong>{money(e.amount_paise)}</strong>
            </li>
          ))}
      </ol>
      {!events.length && (
        <p className="empty-message">
          No saved deductions in this month. Set missing EMI dates below or add
          a subscription.
        </p>
      )}
      <details>
        <summary>Save or change an EMI deduction date</summary>
        <form
          className="statement-controls"
          onSubmit={(e) => {
            e.preventDefault();
            void action(async () => {
              check(
                await db()
                  .from("loans")
                  .update({ deduction_anchor_on: anchor })
                  .eq("id", loanId),
              );
            }, "EMI deduction date saved. No payment was posted.");
          }}
        >
          <label>
            Scheduled loan
            <select
              value={loanId}
              required
              onChange={(e) => {
                setLoanId(e.target.value);
                setAnchor(
                  s.loans.find((l) => l.id === e.target.value)
                    ?.deduction_anchor_on ?? "",
                );
              }}
            >
              {s.loans.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            First tracked deduction
            <input
              type="date"
              required
              value={anchor}
              onChange={(e) => setAnchor(e.target.value)}
            />
          </label>
          <Button disabled={pending || !loanId || !anchor} type="submit">
            Save EMI date
          </Button>
        </form>
        <p className="small-note">
          The day repeats monthly. For the 29th–31st, shorter months use their
          last day and later months restore the original day. A loan without a
          saved date needs your input.
        </p>
      </details>
      <div className="panel-heading">
        <h3>Confirmed deductions · {month}</h3>
        <Button
          variant="outline"
          onClick={() => onEdit({ kind: "subscriptionCharge" })}
          disabled={!s.subscriptions.some((x) => x.active)}
        >
          Record subscription deduction
        </Button>
      </div>
      <p className="small-note">
        Record a charge only if it is not already in Transactions. For a
        statement-imported charge, link its existing expense below. Loan
        repayments automatically retain their actual paid date and reviewed
        split. Card bill transfers are separate; do not create another expense
        for a card EMI.
      </p>
      <ul className="deduction-history">
        {history.map((d) => (
          <li key={d.transaction_id}>
            <div>
              <strong>
                {(d.kind !== "subscription" ? s.loans : s.subscriptions).find(
                  (x) => x.id === d.commitment_id,
                )?.name ?? "Saved deduction"}
              </strong>
              <span>
                Actual deduction {displayDate(d.paid_on)}
                {d.kind === "loan"
                  ? ` · Principal ${money(d.principal_paise ?? 0)} · Interest ${money(d.interest_paise ?? 0)}`
                  : ""}
              </span>
            </div>
            <strong>{money(d.amount_paise)}</strong>
            {d.kind !== "loan" && (
              <Button
                variant="ghost"
                disabled={pending}
                onClick={() =>
                  void action(async () => {
                    check(
                      await (d.kind === "card_emi"
                        ? db().rpc("link_card_emi_deduction", {
                            p_loan: null,
                            p_transaction: d.transaction_id,
                          })
                        : db().rpc("link_subscription_deduction", {
                            p_subscription: null,
                            p_transaction: d.transaction_id,
                          })),
                    );
                  }, "Unlinked. The expense remains in Transactions.")
                }
              >
                Unlink
              </Button>
            )}
          </li>
        ))}
      </ul>
      {!history.length && (
        <p className="empty-message">
          No confirmed deductions recorded in this month.
        </p>
      )}
      <details>
        <summary>
          Link an already-recorded subscription or card EMI expense
        </summary>
        <div className="statement-controls">
          <label>
            Subscription to link
            <select
              aria-label="Subscription to link"
              value={subscription}
              onChange={(e) => setSubscription(e.target.value)}
            >
              {s.subscriptions.map((sub) => (
                <option value={sub.id} key={sub.id}>
                  {sub.name}
                </option>
              ))}
              {s.loans
                .filter((l) => l.card_account_id)
                .map((l) => (
                  <option key={l.id} value={"card:" + l.id}>
                    {l.name} · card EMI
                  </option>
                ))}{" "}
            </select>
          </label>
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => void loadExpenses()}
          >
            Find recorded expenses
          </Button>
          <label>
            Recorded expense
            <select
              aria-label="Recorded expense"
              value={expense}
              onChange={(e) => setExpense(e.target.value)}
            >
              <option value="">Choose an expense</option>
              {choices.map((t) => (
                <option key={t.id} value={t.id}>
                  {displayDate(t.occurred_on)} · {t.description || "Expense"} ·{" "}
                  {money(Math.abs(t.amount_paise))}
                </option>
              ))}
            </select>
          </label>
          <Button
            disabled={pending || !subscription || !expense}
            onClick={() =>
              void action(async () => {
                check(
                  await (subscription.startsWith("card:")
                    ? db().rpc("link_card_emi_deduction", {
                        p_loan: subscription.slice(5),
                        p_transaction: expense,
                      })
                    : db().rpc("link_subscription_deduction", {
                        p_subscription: subscription,
                        p_transaction: expense,
                      })),
                );
                setChoices([]);
                setExpense("");
              }, "Deduction linked. No additional money was posted.")
            }
          >
            Link expense without reposting
          </Button>
        </div>
      </details>
    </section>
  );
}
