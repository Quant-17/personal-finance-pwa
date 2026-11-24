import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  ReferenceLine,
} from "recharts";
import { Button } from "../components/ui/button";
import { formatExactMoney as money } from "../lib/finance";
import { displayDate, indiaDate } from "./domain";
import type { Snapshot } from "./domain";
import { db, check } from "./workspace";
import { loanDocumentSchema } from "./loanDocuments";
import type { LoanDocumentTerms } from "./loanDocuments";
import { loanProgress } from "./loanProgress";
export function LoanProgress({
  snapshot: s,
  onRefresh,
}: {
  snapshot: Snapshot;
  onRefresh: () => void;
}) {
  const [selected, setSelected] = useState(s.loans[0]?.id ?? "");
  const loan = s.loans.find((l) => l.id === selected) ?? s.loans[0];
  const [document, setDocument] = useState<LoanDocumentTerms | null>(null),
    [loaded, setLoaded] = useState("");
  const [first, setFirst] = useState(""),
    [through, setThrough] = useState(indiaDate());
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [pending, setPending] = useState(false);
  const [period, setPeriod] = useState(1);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    if (!loan) return;
    async function load() {
      try {
        let terms: LoanDocumentTerms | null = null;
        if (loan!.has_document) {
          const r = await db()
            .from("loan_document_details")
            .select("details")
            .eq("loan_id", loan!.id)
            .abortSignal(controller.signal)
            .maybeSingle();
          check(r);
          if (r.data) terms = loanDocumentSchema.parse(r.data.details);
        }
        if (active) {
          setDocument(terms);
          setFirst(loan!.progress_first_due_on ?? terms?.first_due_on ?? "");
          setThrough(loan!.payments_reported_through ?? indiaDate());
          setLoaded(loan!.id);
        }
      } catch (e) {
        if (active)
          setError(
            e instanceof Error
              ? e.message
              : "Could not load reviewed loan terms.",
          );
      }
    }
    void load();
    return () => {
      active = false;
      controller.abort();
    };
  }, [loan]);
  if (!loan)
    return (
      <section className="card private-panel">
        <h2>Loan payment progress</h2>
        <p>Track a loan to explore principal and instalment progress.</p>
      </section>
    );
  const model = loanProgress(loan, loaded === loan.id ? document : null);
  const ready = loaded === loan.id;
  const slices =
    model.principal_reduction === null
      ? []
      : [
          { name: "Principal reduced", value: model.principal_reduction },
          { name: "Tracked outstanding", value: loan.outstanding_paise },
        ].filter((x) => x.value > 0);
  const inspection = model.schedule[Math.min(period, model.months) - 1];
  const recorded = (s.deductions ?? []).filter(
    (d) => d.kind === "loan" && d.commitment_id === loan.id,
  ).length;
  return (
    <section
      className="card private-panel loan-progress"
      aria-labelledby="loan-progress-title"
    >
      <div className="panel-heading">
        <div>
          <span className="eyebrow">SEE HOW FAR YOU’VE COME</span>
          <h2 id="loan-progress-title">Loan payment progress</h2>
        </div>
        <label>
          Progress loan
          <select
            value={loan.id}
            disabled={pending}
            onChange={(e) => {
              setSelected(e.target.value);
              setDocument(null);
              setLoaded("");
              setError("");
              setNotice("");
              setPeriod(1);
            }}
          >
            {s.loans.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} · EMI {money(l.reported_emi_paise ?? l.emi_paise)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {!ready ? (
        <p role="status">Loading reviewed loan terms…</p>
      ) : (
        <>
          <div className="private-stats loan-progress-stats">
            <div>
              <span>{model.basis}</span>
              <strong>{money(model.original)}</strong>
            </div>
            <div>
              <span>Tracked outstanding</span>
              <strong>{money(loan.outstanding_paise)}</strong>
            </div>
            <div>
              <span>EMIs reported on time</span>
              <strong>
                {model.paid === null
                  ? "Confirm dates"
                  : `${model.paid} / ${model.months}`}
              </strong>
            </div>
            <div>
              <span>Instalments after reported period</span>
              <strong>{model.remaining ?? "Not confirmed"}</strong>
            </div>
          </div>
          <div className="insight-pie-grid">
            <div
              className="private-chart"
              aria-label="Principal reduced and outstanding chart"
            >
              <ResponsiveContainer width="100%" height="100%">
                <PieChart accessibilityLayer>
                  <Pie
                    data={slices}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="60%"
                    outerRadius="85%"
                    isAnimationActive={false}
                  >
                    {slices.map((x, i) => (
                      <Cell
                        key={x.name}
                        fill={i === 0 ? "var(--primary)" : "var(--teal)"}
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
            <div className="loan-progress-detail">
              <h3>Principal progress</h3>
              {model.principal_reduction !== null ? (
                <>
                  <p>
                    <strong>{money(model.principal_reduction)}</strong> reduced
                    from {model.basis.toLowerCase()}.
                  </p>
                  <progress
                    aria-label="Principal repayment progress"
                    max={model.original}
                    value={model.principal_reduction}
                  />
                  <p>
                    {new Intl.NumberFormat("en-IN", {
                      style: "percent",
                      maximumFractionDigits: 1,
                    }).format(model.principal_reduction / model.original)}{" "}
                    of principal reduced
                  </p>
                </>
              ) : (
                <p>
                  The saved outstanding exceeds this original principal.
                  Reconcile the balance before displaying a repayment
                  percentage.
                </p>
              )}
              <p className="small-note">
                Uses saved balances, not an estimate of bank-verified
                repayments.{" "}
                {document
                  ? `Balance basis: ${document.balance_basis.replaceAll("_", " ")}; reviewed as of ${displayDate(document.as_of)}.`
                  : "Without original document terms this measures progress since the loan’s tracking opening balance."}
              </p>
            </div>
          </div>
          {model.first && (
            <div className="insight-detail">
              <span>
                First EMI {displayDate(model.first)} · Scheduled final EMI{" "}
                {displayDate(model.payoff!)}
              </span>
              <strong>
                {model.paid === null
                  ? "Payment history not yet confirmed"
                  : `Reported on time through ${displayDate(model.through!)}`}
              </strong>
            </div>
          )}
          <p className="small-note">
            “Reported on time” uses your confirmation only, capped at
            instalments due through that date. It never posts repayments or
            changes principal. {recorded} linked repayment records are currently
            in tracking history; these are separate from the reported instalment
            count.
          </p>
          <form
            className="statement-controls"
            onSubmit={async (e) => {
              e.preventDefault();
              if (pending) return;
              setPending(true);
              setError("");
              setNotice("");
              try {
                if (through > indiaDate())
                  throw new Error(
                    "Report payments only through today or earlier.",
                  );
                check(
                  await db()
                    .from("loans")
                    .update({
                      progress_first_due_on: first,
                      payments_reported_through: through,
                    })
                    .eq("id", loan.id),
                );
                setNotice(
                  "Progress dates saved. No repayments or balances were changed.",
                );
                onRefresh();
              } catch (e) {
                setError(
                  e instanceof Error
                    ? e.message
                    : "Could not save progress dates.",
                );
              } finally {
                setPending(false);
              }
            }}
          >
            <label>
              First EMI date
              <input
                type="date"
                required
                disabled={pending}
                value={first}
                onChange={(e) => setFirst(e.target.value)}
              />
            </label>
            <label>
              All due EMIs paid on time through
              <input
                type="date"
                required
                max={indiaDate()}
                disabled={pending}
                value={through}
                onChange={(e) => setThrough(e.target.value)}
              />
            </label>
            <Button type="submit" disabled={pending}>
              Save on-time payment report
            </Button>
          </form>
          <h3>
            {model.reviewed
              ? "Reviewed repayment schedule"
              : "Estimated principal remaining"}
          </h3>
          <div
            className="private-chart"
            aria-label="Loan principal remaining over instalments"
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={[
                  { period: 0, balance_paise: model.original },
                  ...model.schedule,
                ]}
                accessibilityLayer
              >
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="period" />
                <YAxis width={90} tickFormatter={(v) => money(Number(v))} />
                <Tooltip
                  formatter={(v) => money(Number(v))}
                  labelFormatter={(v) =>
                    Number(v) === 0
                      ? "Before first EMI"
                      : `EMI ${v}${model.schedule[Number(v) - 1]?.date ? " · " + displayDate(model.schedule[Number(v) - 1].date!) : ""}`
                  }
                  contentStyle={{
                    background: "var(--surface)",
                    borderColor: "var(--border)",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="balance_paise"
                  name={
                    model.reviewed ? "Scheduled balance" : "Estimated balance"
                  }
                  stroke="var(--primary)"
                  strokeWidth={3}
                  dot={false}
                  isAnimationActive={false}
                />
                <ReferenceLine
                  y={loan.outstanding_paise}
                  stroke="var(--teal)"
                  strokeDasharray="4 4"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="small-note">
            Horizontal dashed line: tracked outstanding.{" "}
            {model.reviewed
              ? "Uses the saved reviewed schedule."
              : "Estimate uses the original principal, nominal rate and tenure with monthly reducing balance. Fees, lender rounding and flat-rate structures may differ."}{" "}
            Scheduled final date assumes the original term; early closure,
            deferments or rate changes need review.
          </p>
          <label>
            Inspect instalment
            <input
              aria-label="Inspect instalment"
              type="range"
              min={1}
              max={model.months}
              value={Math.min(period, model.months)}
              onChange={(e) => setPeriod(Number(e.target.value))}
            />
          </label>
          <div className="insight-detail" aria-live="polite">
            <strong>
              EMI {inspection.period}
              {inspection.date ? " · " + displayDate(inspection.date) : ""}
            </strong>
            <span>
              Principal {money(inspection.principal_paise)} · Interest{" "}
              {money(inspection.interest_paise)} · Remaining{" "}
              {money(inspection.balance_paise)}
            </span>
          </div>
          <details>
            <summary>Repayment chart data</summary>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>EMI</th>
                    <th>Date</th>
                    <th>Principal</th>
                    <th>Interest</th>
                    <th>Remaining</th>
                  </tr>
                </thead>
                <tbody>
                  {model.schedule.map((r) => (
                    <tr key={r.period}>
                      <td>{r.period}</td>
                      <td>
                        {r.date ? displayDate(r.date) : "Set first EMI date"}
                      </td>
                      <td>{money(r.principal_paise)}</td>
                      <td>{money(r.interest_paise)}</td>
                      <td>{money(r.balance_paise)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </section>
  );
}
