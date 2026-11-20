import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Button } from "../components/ui/button";
import { check, db } from "./workspace";
import { indiaDate, moneyInput, moneyToInput } from "./domain";
import type { Snapshot } from "./domain";
import {
  documentBalance,
  instalmentDate,
  loanDocumentSchema,
  providerNames,
} from "./loanDocuments";
import type {
  LoanDocumentTerms,
  LoanExtraction,
  DocumentScheduleRow,
} from "./loanDocuments";
import { readLoanPdf } from "./readLoanPdf";

type Draft = Record<string, string>;
const fields = [
  ["name", "Loan name", "text"],
  ["original_principal_paise", "Original sanctioned principal (₹)", "text"],
  ["original_months", "Original tenure (months)", "number"],
  ["nominal_rate", "Annual nominal interest (%)", "number"],
  ["disclosure_apr", "Disclosed APR (%) · optional", "number"],
  ["reported_emi_paise", "Quoted monthly EMI (₹)", "text"],
  ["net_disbursed_paise", "Net disbursed (₹) · optional", "text"],
  ["fees_paise", "Disclosed processing fees (₹) · optional", "text"],
  ["first_due_on", "Actual first EMI due date · optional", "date"],
  ["as_of", "Current balance as of", "date"],
  ["current_outstanding_paise", "Current outstanding principal (₹)", "text"],
  ["remaining_months", "Remaining instalments", "number"],
] as const;
const fieldSources: Record<string, keyof LoanExtraction> = {
  original_principal_paise: "principal",
  original_months: "tenure",
  nominal_rate: "rate",
  disclosure_apr: "apr",
  reported_emi_paise: "emi",
  first_due_on: "first_due",
  net_disbursed_paise: "net",
  fees_paise: "fees",
};
const amountFields = new Set([
  "original_principal_paise",
  "reported_emi_paise",
  "net_disbursed_paise",
  "fees_paise",
  "current_outstanding_paise",
]);
function toDraft(t: LoanDocumentTerms): Draft {
  return Object.fromEntries(
    fields.map(([k]) => [
      k,
      t[k] === null
        ? ""
        : amountFields.has(k)
          ? moneyToInput(t[k] as number)
          : String(t[k]),
    ]),
  );
}
export function LoanDocumentImport({
  snapshot,
  loanId,
  onTarget,
  onClose,
  onSaved,
}: {
  snapshot: Snapshot;
  loanId: string | null;
  onTarget: (id: string | null) => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const target = loanId ?? "";
  const [source, setSource] = useState<
    (LoanExtraction & { source_sha256: string }) | null
  >(null);
  const [stored, setStored] = useState<LoanDocumentTerms | null>(null);
  const [revision, setRevision] = useState(0);
  const [draft, setDraft] = useState<Draft>({ as_of: indiaDate() });
  const [schedule, setSchedule] = useState<DocumentScheduleRow[]>([]);
  const [origin, setOrigin] =
    useState<LoanDocumentTerms["schedule_origin"]>("none");
  const [basis, setBasis] =
    useState<LoanDocumentTerms["balance_basis"]>("manual");
  const [card, setCard] = useState("");
  const [paidThrough, setPaidThrough] = useState(indiaDate());
  const [paidConfirmed, setPaidConfirmed] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [pending, setPending] = useState(!!loanId);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const active = useRef(true);
  const controller = useRef<AbortController | null>(null);
  const busy = useRef(!!loanId);
  const request = useRef({ signature: "", id: crypto.randomUUID() });
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      controller.current?.abort();
    };
  }, []);
  useEffect(() => {
    const abort = new AbortController();
    controller.current?.abort();
    controller.current = abort;
    if (!target) return () => abort.abort();
    void (async () => {
      try {
        const result = await db()
          .from("loan_document_details")
          .select("details,revision")
          .eq("loan_id", target)
          .abortSignal(abort.signal)
          .maybeSingle();
        check(result);
        if (abort.signal.aborted) return;
        if (result.data) {
          const t = loanDocumentSchema.parse(result.data.details);
          setStored(t);
          setRevision(result.data.revision);
          setDraft({
            ...toDraft(t),
            as_of: indiaDate(),
            current_outstanding_paise: "",
            remaining_months: "",
          });
          setSchedule(t.schedule);
          setOrigin(t.schedule_origin);
          setBasis(t.balance_basis);
          setCard(t.card_account_id ?? "standalone");
          setPaidThrough(t.paid_through ?? indiaDate());
          setNotice(
            "Saved review loaded. Its balance is a dated snapshot; enter a fresh lender balance when updating. Posted repayments are preserved.",
          );
        }
      } catch {
        if (!abort.signal.aborted)
          setError(
            "Could not load the saved review. Close and reopen before editing.",
          );
      } finally {
        if (!abort.signal.aborted) {
          busy.current = false;
          setPending(false);
        }
      }
    })();
    return () => abort.abort();
  }, [target]);
  const change = (key: string, value: string) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setReviewed(false);
    if (
      [
        "original_principal_paise",
        "original_months",
        "nominal_rate",
        "reported_emi_paise",
        "first_due_on",
        "as_of",
        "current_outstanding_paise",
        "remaining_months",
      ].includes(key)
    ) {
      setBasis("manual");
      setPaidConfirmed(false);
    }
  };
  const choose = async (file: File | undefined) => {
    if (!file || busy.current) return;
    busy.current = true;
    setPending(true);
    setError("");
    setReviewed(false);
    setPaidConfirmed(false);
    setStored(null);
    setSource(null);
    setSchedule([]);
    setOrigin("none");
    setNotice("");
    const abort = new AbortController();
    controller.current?.abort();
    controller.current = abort;
    try {
      const extracted = await readLoanPdf(file, abort.signal);
      if (!active.current || abort.signal.aborted) return;
      setSource(extracted);
      setSchedule(extracted.schedule);
      setOrigin(extracted.schedule.length ? "lender" : "none");
      setBasis("manual");
      const value = (k: keyof LoanExtraction, money = false) => {
        const f = extracted[k] as { value: number | string | null };
        return f.value === null
          ? ""
          : money
            ? moneyToInput(f.value as number)
            : String(f.value);
      };
      setDraft({
        name: providerNames[extracted.provider],
        original_principal_paise: value("principal", true),
        original_months: value("tenure"),
        nominal_rate: value("rate"),
        disclosure_apr: value("apr"),
        reported_emi_paise: value("emi", true),
        net_disbursed_paise: value("net", true),
        fees_paise: value("fees", true),
        first_due_on:
          extracted.provider === "lt_finance" ? "" : value("first_due"),
        as_of: indiaDate(),
        current_outstanding_paise: "",
        remaining_months: "",
      });
      setCard(extracted.provider === "kotak" ? "" : "standalone");
    } catch (f) {
      if (active.current && !abort.signal.aborted)
        setError(f instanceof Error ? f.message : "Could not read this PDF.");
    } finally {
      if (active.current && !abort.signal.aborted) {
        busy.current = false;
        setPending(false);
      }
    }
  };
  const estimate = () => {
    setError("");
    setReviewed(false);
    try {
      if (!paidConfirmed)
        throw new Error("Confirm paid-through history first.");
      if (paidThrough > draft.as_of || draft.as_of > indiaDate())
        throw new Error(
          "Paid-through cannot follow the current balance date or today.",
        );
      const result = documentBalance({
        principal: moneyInput(draft.original_principal_paise),
        rate: Number(draft.nominal_rate),
        emi: moneyInput(draft.reported_emi_paise),
        months: Number(draft.original_months),
        firstDue: draft.first_due_on,
        paidThrough,
        schedule,
      });
      setDraft((d) => ({
        ...d,
        current_outstanding_paise: moneyToInput(result.balance),
        remaining_months: String(result.remaining),
      }));
      setBasis(result.basis);
      setNotice(
        result.basis === "estimate"
          ? "Estimated from your confirmed payments and quoted EMI. Fees, taxes and lender rounding may differ; prefer a current statement."
          : "Balance derived from the complete reviewed schedule and your confirmed payments. Verify against the lender before saving.",
      );
    } catch (f) {
      setError(
        f instanceof Error
          ? f.message
          : "Review the first due date and loan terms.",
      );
    }
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (busy.current || !reviewed) return;
    setError("");
    try {
      if (!card) throw new Error("Choose how this liability is counted.");
      const pages = source
        ? Object.fromEntries(
            ["principal", "rate", "apr", "emi", "tenure", "first_due"].map(
              (k) => [
                k,
                (source[k as keyof LoanExtraction] as { page: number | null })
                  .page,
              ],
            ),
          )
        : stored?.source_pages;
      const parsed = loanDocumentSchema.safeParse({
        name: draft.name,
        provider: source?.provider ?? stored?.provider,
        source_sha256: source?.source_sha256 ?? stored?.source_sha256,
        source_page_count:
          source?.source_page_count ?? stored?.source_page_count,
        original_principal_paise: moneyInput(draft.original_principal_paise),
        original_months: Number(draft.original_months),
        nominal_rate:
          draft.nominal_rate === "" ? NaN : Number(draft.nominal_rate),
        disclosure_apr: draft.disclosure_apr
          ? Number(draft.disclosure_apr)
          : null,
        net_disbursed_paise: draft.net_disbursed_paise
          ? moneyInput(draft.net_disbursed_paise)
          : null,
        fees_paise: draft.fees_paise ? moneyInput(draft.fees_paise) : null,
        reported_emi_paise: moneyInput(draft.reported_emi_paise),
        current_outstanding_paise: moneyInput(draft.current_outstanding_paise),
        remaining_months: Number(draft.remaining_months),
        as_of: draft.as_of,
        first_due_on: draft.first_due_on || null,
        paid_through: paidConfirmed ? paidThrough : null,
        balance_basis: paidConfirmed ? basis : "manual",
        card_account_id: card === "standalone" ? null : card,
        schedule_origin: origin,
        schedule,
        source_pages: pages,
      });
      if (!parsed.success)
        throw new Error(
          parsed.error.issues
            .map((i) => i.message)
            .slice(0, 3)
            .join(" "),
        );
      const signature = JSON.stringify([target, revision, parsed.data]);
      if (request.current.signature !== signature)
        request.current = { signature, id: crypto.randomUUID() };
      busy.current = true;
      setPending(true);
      const result = await db().rpc("save_loan_document", {
        p_loan: target || null,
        p_expected_revision: revision,
        p_terms: parsed.data,
        p_request_id: request.current.id,
      });
      if (result.error)
        throw new Error(
          result.error.code === "23505"
            ? "This document already belongs to a tracked loan. Select that loan to update it."
            : result.error.code === "40001"
              ? "This loan changed elsewhere. Close and reopen before saving."
              : "Could not save this review. Check connectivity and retry; the same request will not create a second loan.",
        );
      if (active.current) onSaved();
    } catch (f) {
      if (active.current)
        setError(f instanceof Error ? f.message : "Review the entered terms.");
    } finally {
      busy.current = false;
      if (active.current) setPending(false);
    }
  };
  const ready = !!(source || stored);
  return (
    <section
      className="card private-panel document-import"
      aria-labelledby="document-title"
    >
      <div className="page-actions">
        <h2 id="document-title">Review a loan document</h2>
        <Button variant="ghost" disabled={pending} onClick={onClose}>
          Close document review
        </Button>
      </div>
      <p>
        Read a digital PDF on this device. The PDF, filename and full text are
        never uploaded or saved. Only the fields and schedule you confirm are
        saved privately. Keep your original copy.
      </p>
      <div className="csv-import-controls">
        <label>
          Save to loan
          <select
            value={target}
            disabled={pending}
            onChange={(e) => onTarget(e.target.value || null)}
          >
            <option value="">Create a new tracked loan</option>
            {snapshot.loans.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Loan PDF · up to 10 MiB, 60 pages
          <input
            type="file"
            accept="application/pdf,.pdf"
            disabled={pending}
            onChange={(e) => {
              void choose(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {pending && <p role="status">Processing securely…</p>}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {ready && (
        <form onSubmit={(e) => void save(e)}>
          <p>
            <strong>
              {providerNames[source?.provider ?? stored!.provider]}
            </strong>{" "}
            · {source?.source_page_count ?? stored!.source_page_count} pages ·
            Check each value against the PDF. Blank fields need manual entry.
          </p>
          <ul className="document-warnings">
            {(
              source?.warnings ?? [
                "Saved terms are not a live lender statement. Review the balance and payment history when updating.",
              ]
            ).map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
          <fieldset disabled={pending}>
            <legend>Terms and current position</legend>
            <div className="document-fields">
              {fields.map(([k, label, type]) => {
                const sourceKey = fieldSources[k];
                const page = source
                  ? (source[sourceKey] as { page?: number } | undefined)?.page
                  : stored?.source_pages[
                      sourceKey as keyof LoanDocumentTerms["source_pages"]
                    ];
                return (
                  <label key={k}>
                    {label}
                    {page ? <small>Source p. {page} · editable</small> : null}
                    <input
                      required={!label.includes("optional")}
                      type={type}
                      step={type === "number" ? "any" : undefined}
                      inputMode={
                        type === "text" && k !== "name" ? "decimal" : undefined
                      }
                      value={draft[k] ?? ""}
                      maxLength={k === "name" ? 80 : undefined}
                      onChange={(e) => change(k, e.target.value)}
                    />
                  </label>
                );
              })}
              <label>
                Liability treatment
                <select
                  required
                  value={card}
                  onChange={(e) => {
                    setCard(e.target.value);
                    setReviewed(false);
                  }}
                >
                  <option value="">Choose explicitly</option>
                  <option value="standalone">
                    Separate debt — subtract from net worth
                  </option>
                  {snapshot.accounts
                    .filter((a) => a.type === "credit_card" && !a.archived_at)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        Already included in {a.name} balance
                      </option>
                    ))}
                </select>
              </label>
            </div>
            <p>
              A linked card plan still counts toward monthly EMI commitments.
              Its principal is not subtracted twice from net worth. Pay that
              card using a transfer, then update the plan balance here.
            </p>
            <details>
              <summary>
                Use confirmed payment history to suggest a balance
              </summary>
              <div className="csv-import-controls">
                <label>
                  Paid through
                  <input
                    type="date"
                    value={paidThrough}
                    max={draft.as_of}
                    onChange={(e) => {
                      setPaidThrough(e.target.value);
                      setPaidConfirmed(false);
                      setReviewed(false);
                      setBasis("manual");
                    }}
                  />
                </label>
              </div>
              <label className="csv-confirm">
                <input
                  type="checkbox"
                  checked={paidConfirmed}
                  onChange={(e) => {
                    setPaidConfirmed(e.target.checked);
                    setReviewed(false);
                    setBasis("manual");
                  }}
                />
                I confirm every scheduled instalment through this date was paid
                on time. I verified the actual first due date.
              </label>
              <Button
                type="button"
                variant="outline"
                disabled={!paidConfirmed}
                onClick={estimate}
              >
                Suggest balance from confirmed payments
              </Button>
              <p>
                This records your confirmation only. It does not post historical
                transactions.
              </p>
            </details>
            <details className="loan-schedule">
              <summary>
                Review repayment schedule · {schedule.length} rows · {origin}
              </summary>
              <p>
                Source page references are retained. Dates below are projected
                monthly from the first due date you entered. Edits mark the
                table as manually reviewed; rows must reconcile within ₹1 lender
                rounding before saving. Rounded tables only support estimated
                balances.
              </p>
              {schedule.length ? (
                <div className="csv-preview-scroll">
                  <table className="csv-preview">
                    <thead>
                      <tr>
                        <th># / due</th>
                        <th>Opening ₹</th>
                        <th>Principal ₹</th>
                        <th>Interest ₹</th>
                        <th>EMI ₹</th>
                        <th>Page</th>
                      </tr>
                    </thead>
                    <tbody>
                      {schedule.map((r, i) => (
                        <tr key={r.sequence}>
                          <td>
                            {r.sequence}
                            {draft.first_due_on && (
                              <small>
                                {instalmentDate(draft.first_due_on, i)}
                              </small>
                            )}
                          </td>
                          {(
                            [
                              "opening_paise",
                              "principal_paise",
                              "interest_paise",
                              "payment_paise",
                            ] as const
                          ).map((k) => (
                            <td key={k}>
                              <input
                                aria-label={`Row ${r.sequence} ${k.replace("_paise", "")}`}
                                inputMode="decimal"
                                defaultValue={moneyToInput(r[k])}
                                onBlur={(e) => {
                                  try {
                                    const amount = moneyInput(e.target.value);
                                    setSchedule((rows) =>
                                      rows.map((row, j) =>
                                        j === i ? { ...row, [k]: amount } : row,
                                      ),
                                    );
                                    setOrigin("manual");
                                    setReviewed(false);
                                    setBasis("manual");
                                    setPaidConfirmed(false);
                                    setError("");
                                  } catch {
                                    e.target.value = moneyToInput(r[k]);
                                    setError(
                                      "Use rupees with up to two decimal places for schedule amounts.",
                                    );
                                  }
                                }}
                              />
                            </td>
                          ))}
                          <td>{r.source_page ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p>
                  No populated lender table. A calculated estimate is not a
                  lender repayment schedule.
                </p>
              )}
              <div className="page-actions">
                <Button
                  type="button"
                  variant="outline"
                  disabled={schedule.length >= 120}
                  onClick={() => {
                    const last = schedule.at(-1);
                    let opening = last
                      ? last.opening_paise - last.principal_paise
                      : 0;
                    if (!last) {
                      try {
                        opening = moneyInput(draft.original_principal_paise);
                      } catch {
                        /* Fill the original principal first. */
                      }
                    }
                    setSchedule((rows) => [
                      ...rows,
                      {
                        sequence: rows.length + 1,
                        opening_paise: opening,
                        principal_paise: 0,
                        interest_paise: 0,
                        payment_paise: 0,
                        source_page: null,
                      },
                    ]);
                    setOrigin("manual");
                    setReviewed(false);
                    setPaidConfirmed(false);
                    setBasis("manual");
                  }}
                >
                  Add manual schedule row
                </Button>
                {!!schedule.length && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setSchedule((rows) => rows.slice(0, -1));
                      setOrigin(schedule.length === 1 ? "none" : "manual");
                      setReviewed(false);
                      setPaidConfirmed(false);
                      setBasis("manual");
                    }}
                  >
                    Remove last schedule row
                  </Button>
                )}
              </div>
              {!!schedule.length && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setSchedule([]);
                    setOrigin("none");
                    setReviewed(false);
                    setBasis("manual");
                    setPaidConfirmed(false);
                  }}
                >
                  Discard extracted table
                </Button>
              )}
            </details>
            <label className="csv-confirm">
              <input
                type="checkbox"
                checked={reviewed}
                onChange={(e) => setReviewed(e.target.checked)}
              />
              I reviewed the original terms, quoted EMI, current balance,
              liability treatment and schedule. Save these fields without
              posting transactions.
            </label>
            <Button type="submit" disabled={!reviewed || pending}>
              Save reviewed loan
            </Button>
          </fieldset>
        </form>
      )}
    </section>
  );
}
