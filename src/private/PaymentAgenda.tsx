import { useEffect, useState } from "react";
import { db } from "./workspace";
import { planningSchema } from "./forecast";
import { ViewToggle } from "./ViewToggle";
import { deductionsInMonth, recurringDate } from "./recurring";
import { displayDate, indiaDate, type Snapshot } from "./domain";
import { formatExactMoney as money } from "../lib/finance";
export function PaymentAgenda({ snapshot: s }: { snapshot: Snapshot }) {
  const [view, setView] = useState("Next 7 days");
  const [funding, setFunding] = useState<Record<string, string>>({});
  useEffect(() => {
    const c = new AbortController();
    void (async () => {
      const result = await db()
        .from("planning_settings")
        .select("*")
        .limit(1)
        .abortSignal(c.signal);
      const parsed = planningSchema.safeParse(result.data?.[0]);
      if (!c.signal.aborted)
        setFunding(parsed.success ? parsed.data.loan_funding : {});
    })();
    return () => c.abort();
  }, [s]);
  const today = indiaDate(),
    month = today.slice(0, 7);
  const end = new Date(Date.parse(today + "T00:00:00Z") + 7 * 86400000)
    .toISOString()
    .slice(0, 10);
  const dues = [
    ...deductionsInMonth(s, month),
    ...deductionsInMonth(s, recurringDate(today, 1).slice(0, 7)),
  ].filter(
    (d) =>
      d.due_on >= today &&
      (view === "Next 7 days" ? d.due_on < end : d.due_on.startsWith(month)),
  );
  return (
    <section className="card private-panel">
      <h2>Payment agenda</h2>
      <ViewToggle
        label="Agenda period"
        options={["Next 7 days", "This month", "Recorded"]}
        value={view}
        onChange={setView}
      />
      {view === "Recorded" ? (
        <>
          {(s.deductions ?? [])
            .filter((d) => d.paid_on.startsWith(month))
            .map((d) => (
              <p key={d.transaction_id}>
                {displayDate(d.paid_on)} ·{" "}
                {(d.kind === "subscription" ? s.subscriptions : s.loans).find(
                  (l) => l.id === d.commitment_id,
                )?.name ?? "Deduction"}{" "}
                · {money(d.amount_paise)} · Recorded
              </p>
            ))}
          {!s.deductions?.some((d) => d.paid_on.startsWith(month)) && (
            <p>No deductions recorded this month.</p>
          )}
        </>
      ) : (
        <>
          {dues.map((d) => {
            const loan = s.loans.find((l) => l.id === d.id),
              account = s.accounts.find(
                (a) =>
                  a.id ===
                  (loan?.card_account_id ??
                    funding[d.id] ??
                    s.subscriptions.find((x) => x.id === d.id)?.account_id),
              );
            const start = s.subscriptions.find(
              (x) => x.id === d.id,
            )?.payment_window_start;
            return (
              <p key={d.key}>
                <strong>
                  {start ? "Pay by " : ""}
                  {displayDate(d.due_on)} · {d.name}
                </strong>
                <br />
                {money(d.amount_paise)} ·{" "}
                {loan?.payments_reported_through &&
                loan.payments_reported_through >= d.due_on
                  ? "Reported paid"
                  : "Scheduled"}
                {start &&
                  " · Window opens " +
                    displayDate(
                      d.due_on.slice(0, 8) +
                        String(
                          Math.min(start, Number(d.due_on.slice(8))),
                        ).padStart(2, "0"),
                    )}
                {account && " · " + account.name}
              </p>
            );
          })}
          {!dues.length && <p>No scheduled deductions in this period.</p>}
        </>
      )}
    </section>
  );
}
