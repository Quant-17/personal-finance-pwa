import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { Button } from "../components/ui/button";
import { formatExactMoney as money } from "../lib/finance";
import { indiaDate } from "./domain";
import type { Snapshot } from "./domain";
import { readPdfText } from "./readPdfText";
import { extractStatement, reviewedStatementEntry } from "./statements";
import type { StatementDraft, StatementEntry } from "./statements";
import { check, db } from "./workspace";
import {
  RememberStatementRow,
  RememberedStatementRules,
} from "./StatementRules.tsx";
import { StatementMatches } from "./StatementMatches";
import { ViewToggle } from "./ViewToggle";
import { statementRuleSchema, suggestStatementRule } from "./statementRules";
import type { StatementRule, RuleInput } from "./statementRules";
const countsSchema = z.object({
  inserted: z.number().int().min(0).max(500),
  skipped: z.number().int().min(0).max(500),
});
export function StatementImport({
  snapshot: s,
  onImported,
}: {
  snapshot: Snapshot;
  onImported: (counts: {
    inserted: number;
    skipped: number;
    account: string;
    month: string;
  }) => void;
}) {
  const accounts = s.accounts.filter(
    (a) =>
      !a.archived_at && ["bank", "savings", "credit_card"].includes(a.type),
  );
  const [account, setAccount] = useState(accounts[0]?.id ?? "");
  const [rules, setRules] = useState<StatementRule[]>([]);
  const [ruleError, setRuleError] = useState("");
  const [rulePending, setRulePending] = useState(false);
  const [month, setMonth] = useState(indiaDate().slice(0, 7));
  const [issuer, setIssuer] = useState("");
  const [view, setView] = useState("All rows");
  const [reviewRow, setReviewRow] = useState("");
  const rowHeading = useRef<HTMLHeadingElement>(null);
  const reviewSummary = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (view === "Needs attention" && reviewRow) rowHeading.current?.focus();
  }, [view, reviewRow]);
  const [password, setPassword] = useState("");
  const [hash, setHash] = useState("");
  const [rows, setRows] = useState<StatementDraft[]>([]);
  const [pageCount, setPageCount] = useState(0);
  const [duplicates, setDuplicates] = useState<string[]>([]);
  const [checked, setChecked] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [bulkCategory, setBulkCategory] = useState("");
  const [fileKey, setFileKey] = useState(0);
  const busy = useRef(false),
    mounted = useRef(true);
  const controller = useRef<AbortController | null>(null);
  const rulesRead = useRef<AbortController | null>(null);
  const request = useRef({ signature: "", id: crypto.randomUUID() });
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, []);
  useEffect(() => {
    const c = new AbortController();
    rulesRead.current = c;
    if (account)
      void (async () => {
        try {
          const result = await db()
            .from("statement_rules")
            .select("*", { count: "exact" })
            .eq("account_id", account)
            .order("id")
            .limit(1000)
            .abortSignal(c.signal);
          check(result);
          if (
            result.count === null ||
            result.count !== result.data!.length ||
            result.count > 1000
          )
            throw new Error("Rules could not be loaded completely");
          const data = z.array(statementRuleSchema).parse(result.data);
          if (!c.signal.aborted) setRules(data);
        } catch {
          if (!c.signal.aborted)
            setRuleError(
              "Remembered rules could not load. PDF review remains manual; retry when connected.",
            );
        }
      })();
    return () => c.abort();
  }, [account]);
  const saveRule = async (rule: RuleInput) => {
    if (busy.current || rulePending)
      throw new Error("Wait for the current operation.");
    busy.current = true;
    rulesRead.current?.abort();
    setRulePending(true);
    try {
      const result = await db()
        .from("statement_rules")
        .upsert(
          { ...rule, enabled: true },
          {
            onConflict:
              "account_id,direction,recipient_key,amount_paise,match_day",
          },
        )
        .select("*")
        .single();
      check(result);
      const saved = statementRuleSchema.parse(result.data);
      if (mounted.current)
        setRules((current) => [
          ...current.filter((r) => r.id !== saved.id),
          saved,
        ]);
    } catch {
      throw new Error(
        "Could not save rule. Nothing was imported. Retry when connected.",
      );
    } finally {
      busy.current = false;
      if (mounted.current) setRulePending(false);
    }
  };
  const mutateRule = async (rule: StatementRule, remove: boolean) => {
    if (busy.current || rulePending)
      throw new Error("Wait for the current operation.");
    busy.current = true;
    rulesRead.current?.abort();
    setRulePending(true);
    try {
      const result = remove
        ? await db()
            .from("statement_rules")
            .delete()
            .eq("id", rule.id)
            .select("id")
            .single()
        : await db()
            .from("statement_rules")
            .update({ enabled: !rule.enabled })
            .eq("id", rule.id)
            .select("id")
            .single();
      check(result);
      if (mounted.current)
        setRules((current) =>
          remove
            ? current.filter((r) => r.id !== rule.id)
            : current.map((r) =>
                r.id === rule.id ? { ...r, enabled: !r.enabled } : r,
              ),
        );
    } finally {
      busy.current = false;
      if (mounted.current) setRulePending(false);
    }
  };
  const invalidate = () => {
    setChecked(false);
    setConfirmed(false);
    setDuplicates([]);
  };
  const clear = () => {
    controller.current?.abort();
    setIssuer("");
    setView("All rows");
    setReviewRow("");
    setRows([]);
    setHash("");
    setPageCount(0);
    setError("");
    setPassword("");
    setBulkCategory("");
    setFileKey((k) => k + 1);
    invalidate();
    request.current = { signature: "", id: crypto.randomUUID() };
  };
  const update = (id: string, patch: Partial<StatementDraft>) => {
    setRows((current) =>
      current.map((r) => (r.source_row === id ? { ...r, ...patch } : r)),
    );
    invalidate();
  };
  const parsed = rows.map((row, index) => {
    let entry: StatementEntry | null = null;
    let issue = "";
    try {
      entry = reviewedStatementEntry(row, s, account);
    } catch (e) {
      issue = e instanceof Error ? e.message : "Review this row.";
    }
    const excluded = !row.kind && row.note.startsWith("Remembered exclusion");
    let status = issue || (row.selected ? "Selected for import." : "Ready for selection.");
    if (excluded) status = "Excluded by remembered rule.";
    if (duplicates.includes(row.source_row)) status = "Already imported / ledger match";
    return { row, index, entry, status, unresolved: !entry && !excluded };
  });
  const attention = parsed.filter((p) => p.unresolved);
  // Keep the active draft on screen until the reviewer advances, even when
  // typing a single character makes the row valid.
  const current = parsed.find((p) => p.row.source_row === reviewRow);
  const next =
    attention.find((p) => p.index > (current?.index ?? -1)) ??
    attention.find((p) => p !== current);
  const changeView = (value: string) => {
    setReviewRow(
      value === "Needs attention" ? attention[0]?.row.source_row ?? "" : "",
    );
    setView(value);
  };
  const visible =
    view === "Needs attention"
      ? parsed.filter((p) => p === current)
      : view === "Remembered"
        ? parsed.filter(
            (p) =>
              p.row.note?.startsWith("Remembered recipient") ||
              p.row.note?.startsWith("Remembered exclusion"),
          )
        : parsed;
  const dates = rows
    .map((r) => r.date)
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();
  const selected = parsed.filter(
    (p): p is typeof p & { entry: StatementEntry } =>
      p.row.selected && !!p.entry && !duplicates.includes(p.row.source_row),
  );
  const valid = parsed.filter(
    (p): p is typeof p & { entry: StatementEntry } => !!p.entry,
  );
  // <=500 integer-paise rows, each <=10^12: sums stay within JS's safe integer range.
  const total = (kind: "expense" | "income" | "loan_payment") =>
    selected.reduce(
      (sum, p) =>
        sum + (p.entry.entry.kind === kind ? p.entry.entry.amount_paise : 0),
      0,
    );
  const read = async (file: File | undefined) => {
    if (!file || busy.current) return;
    busy.current = true;
    setPending(true);
    rulesRead.current?.abort();
    const localPassword = password;
    clear();
    const c = new AbortController();
    controller.current = c;
    try {
      if (
        !/^\d{4}-\d{2}$/.test(month) ||
        Number(month.slice(5)) < 1 ||
        Number(month.slice(5)) > 12
      )
        throw new Error("Choose the statement ending month.");
      const doc = await readPdfText(file, c.signal, localPassword || undefined);
      const header = doc.pages[0]?.text.slice(0, 650) ?? "";
      const lenders = [
        [/\b(?:SBI|State Bank of India)\b/i, "SBI"],
        [/\bKotak(?: Mahindra)?\b/i, "Kotak"],
      ] as const;
      const detected = lenders.filter(([pattern]) => pattern.test(header));
      if (!c.signal.aborted && mounted.current)
        setIssuer(detected.length === 1 ? detected[0][1] : "");
      const drafts = extractStatement(
        doc.lines,
        month,
        s.accounts.find((a) => a.id === account)?.type === "credit_card",
      );
      if (mounted.current && !c.signal.aborted) {
        // Fetch again for another tab/device’s edits. Do not use stale rules after a failed request.
        let fresh: StatementRule[] = [];
        try {
          const result = await db()
            .from("statement_rules")
            .select("*", { count: "exact" })
            .eq("account_id", account)
            .order("id")
            .limit(1000)
            .abortSignal(c.signal);
          check(result);
          if (
            result.count === null ||
            result.count !== result.data!.length ||
            result.count > 1000
          )
            throw new Error("Rules could not be loaded completely");
          fresh = z.array(statementRuleSchema).parse(result.data);
          if (!c.signal.aborted) {
            setRules(fresh);
            setRuleError("");
          }
        } catch {
          if (!c.signal.aborted)
            setRuleError(
              "Rules unavailable. These rows need manual classification.",
            );
        }
        if (c.signal.aborted || !mounted.current) return;
        setRows(
          drafts.map((row) => suggestStatementRule(row, fresh, account, s)),
        );
        setHash(doc.source_sha256);
        setPageCount(doc.pages.length);
      }
    } catch (e) {
      if (mounted.current && !c.signal.aborted)
        setError(
          e instanceof Error
            ? e.message
            : "Could not read this PDF. Nothing was imported.",
        );
    } finally {
      busy.current = false;
      if (mounted.current) setPending(false);
    }
  };
  const preview = async () => {
    if (busy.current || !selected.length) return;
    busy.current = true;
    setPending(true);
    setError("");
    setConfirmed(false);
    const c = new AbortController();
    controller.current = c;
    try {
      const result = await db()
        .rpc("preview_statement_import", {
          p_account: account,
          p_source_sha256: hash,
          p_rows: selected.map((p) => p.entry),
        })
        .abortSignal(c.signal);
      check(result);
      const found = z
        .object({ duplicates: z.array(z.boolean()).length(selected.length) })
        .parse(result.data).duplicates;
      if (mounted.current && !c.signal.aborted) {
        const ids = selected
          .filter((_, i) => found[i])
          .map((p) => p.row.source_row);
        setDuplicates(ids);
        setRows((current) =>
          current.map((r) =>
            ids.includes(r.source_row) ? { ...r, selected: false } : r,
          ),
        );
        setChecked(true);
      }
    } catch {
      if (mounted.current && !c.signal.aborted)
        setError(
          "Could not check existing entries. No statement rows were imported. Retry when connected.",
        );
    } finally {
      busy.current = false;
      if (mounted.current) setPending(false);
    }
  };
  const commit = async () => {
    if (busy.current || !confirmed || !checked || !selected.length) return;
    busy.current = true;
    setPending(true);
    setError("");
    const payload = {
      p_account: account,
      p_source_sha256: hash,
      p_rows: selected.map((p) => p.entry),
    };
    const signature = JSON.stringify(payload);
    if (request.current.signature !== signature)
      request.current = { signature, id: crypto.randomUUID() };
    try {
      const result = await db().rpc("import_statement_entries", {
        ...payload,
        p_request_id: request.current.id,
      });
      if (result.error?.code === "22003") {
        if (mounted.current)
          setError(
            "The selected rows exceed supported financial totals. Nothing was imported. Review amounts or select fewer rows.",
          );
        return;
      }
      check(result);
      const counts = countsSchema.parse(result.data);
      if (counts.inserted + counts.skipped !== selected.length)
        throw new Error("Unexpected import result.");
      if (mounted.current) {
        clear();
        onImported({ ...counts, account, month });
      }
    } catch {
      if (mounted.current)
        setError(
          "The import could not be confirmed. Retry the unchanged selection safely, or refresh the ledger before starting again.",
        );
    } finally {
      busy.current = false;
      if (mounted.current) setPending(false);
    }
  };
  return (
    <section
      className="card private-panel"
      aria-labelledby="statement-import-title"
    >
      <h2 id="statement-import-title">Import monthly PDF statement</h2>
      <p>
        Read your Kotak Mahindra or SBI bank/card statement on this device.
        Review and import the month’s settled transactions together. The
        original PDF and password are never uploaded or stored.
      </p>
      <div className="statement-controls">
        <label>
          Statement account
          <select
            disabled={pending || rulePending || !accounts.length}
            value={account}
            onChange={(e) => {
              setRules([]);
              setRuleError("");
              setAccount(e.target.value);
              clear();
            }}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ·{" "}
                {a.type === "credit_card" ? "Credit card" : "Bank account"}
              </option>
            ))}
          </select>
        </label>
        <label>
          Statement ending month
          <input
            disabled={pending || rulePending}
            type="month"
            value={month}
            onChange={(e) => {
              setMonth(e.target.value);
              clear();
            }}
          />
        </label>
        <label>
          PDF password (optional)
          <input
            disabled={pending || rulePending}
            type="password"
            autoComplete="off"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <label>
          Choose statement PDF
          <input
            key={fileKey}
            disabled={pending || rulePending || !account}
            type="file"
            accept=".pdf,application/pdf"
            onChange={(e) => void read(e.target.files?.[0])}
          />
        </label>
      </div>
      <p className="small-note">
        Text-based tables with dates and debit/credit columns, or card amounts
        with CR/DR markers, can be detected. Layouts vary; compare every
        selected row and total with the PDF. Scanned images need manual entry;
        OCR is not included.
      </p>
      <p className="small-note">
        Before your first full-month import,{" "}
        <a className="text-link" href="#data">
          check opening balances and loan baselines
        </a>
        . Rule-only teaching never requires importing an older payment.
      </p>
      <RememberedStatementRules
        rules={rules}
        snapshot={s}
        pending={pending || rulePending}
        onToggle={(r) => mutateRule(r, false)}
        onDelete={(r) => mutateRule(r, true)}
      />
      {ruleError && <p role="status">{ruleError}</p>}
      <p className="small-note">
        For a protected PDF, enter its password before choosing the file.
        Limits: 10 MiB, 60 pages, 500 detected rows. Missing years use the
        ending month; verify inferred dates. Transfers, refunds and card
        repayments need their dedicated forms. Standalone loan EMIs can be
        linked below with a reviewed principal/interest split.
      </p>
      <p className="small-note">
        SBI’s two-date grid uses Post Date, with Value Date kept in the source
        details. Kotak row numbers are skipped and wrapped descriptions are
        joined. Verify the detected dates before posting.
      </p>
      {!accounts.length && (
        <p>Add an active bank or credit-card account before importing.</p>
      )}
      {pending && <p role="status">Working on your statement…</p>}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {!!rows.length && (
        <>
          <p>
            {rows.length} dated rows detected across {pageCount} pages ·{" "}
            {valid.length} ready for selection · {duplicates.length} matched
            entries · {selected.length} selected
          </p>
          <div className="page-actions">
            <label>
              Default expense category
              <select
                disabled={pending || rulePending}
                value={bulkCategory}
                onChange={(e) => setBulkCategory(e.target.value)}
              >
                <option value="">Choose a category</option>
                {s.categories
                  .filter((c) => c.kind === "expense")
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </label>
            <Button
              variant="outline"
              disabled={pending || rulePending || !bulkCategory}
              onClick={() => {
                setRows((current) =>
                  current.map((r) =>
                    r.kind === "expense"
                      ? { ...r, category_id: bulkCategory }
                      : r,
                  ),
                );
                invalidate();
              }}
            >
              Apply category to expense rows
            </Button>
            <Button
              variant="outline"
              disabled={pending || rulePending || !valid.length}
              onClick={() => {
                const ids = new Set(
                  visible
                    .filter(
                      (p) => p.entry && !duplicates.includes(p.row.source_row),
                    )
                    .map((p) => p.row.source_row),
                );
                setRows((current) =>
                  current.map((r) => ({
                    ...r,
                    selected: r.selected || ids.has(r.source_row),
                  })),
                );
                invalidate();
              }}
            >
              Select reviewed valid rows
            </Button>
            <Button
              variant="ghost"
              disabled={pending || rulePending}
              onClick={clear}
            >
              Clear statement preview
            </Button>
          </div>
          <p ref={reviewSummary} tabIndex={-1}>
            {attention.length} of {rows.length} rows need classification or
            correction. {selected.length} selected for import. Leaving Import clears
            this preview and any unposted edits.
          </p>
          <p>
            {issuer && issuer + " PDF · "}Reviewing{" "}
            {s.accounts.find((a) => a.id === account)?.name} · statement ending{" "}
            {month}
            {dates.length > 0 &&
              " · Row dates " + dates[0] + " to " + dates[dates.length - 1]}
          </p>
          <ViewToggle
            label="Review statement rows"
            options={["All rows", "Needs attention", "Remembered"]}
            value={view}
            onChange={changeView}
          />
          {visible.length === 0 && (
            <p>{view === "Needs attention" ? "No unresolved rows." : "No rows in this view."}</p>
          )}
          <div
            className="csv-preview-scroll"
            tabIndex={0}
            aria-label="Statement transaction review"
          >
            <table className="csv-preview statement-preview">
              <thead>
                <tr>
                  <th>Row status and selection</th>
                  <th>Source</th>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Type</th>
                  <th>Amount ₹</th>
                  <th>Category / loan</th>
                  <th>Review</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(({ row: r, index, entry, status }) => (
                  <tr key={r.source_row}>
                    <td className="statement-row-status">
                      <h3
                        ref={view === "Needs attention" ? rowHeading : undefined}
                        tabIndex={-1}
                        aria-describedby={`statement-status-${r.source_row}`}
                      >
                        Row {index + 1} of {rows.length}
                      </h3>
                      <p
                        id={`statement-status-${r.source_row}`}
                        aria-live={view === "Needs attention" ? "polite" : undefined}
                      >
                        {status}
                      </p>
                      <label>
                        <input
                          type="checkbox"
                          aria-label={`Select statement row ${r.source_row}`}
                          checked={r.selected}
                          disabled={pending || !entry || duplicates.includes(r.source_row)}
                          onChange={(e) =>
                            update(r.source_row, { selected: e.target.checked })
                          }
                        />
                        Include
                      </label>
                    </td>
                    <td data-label="Statement detail">
                      <details>
                        <summary>
                          Page {r.page}, row {r.source_row}
                        </summary>
                        <p>{r.source}</p>
                        {entry && (
                          <StatementMatches
                            key={account + r.date + r.amount + r.direction}
                            account={account}
                            date={r.date}
                            amount={
                              (r.direction === "credit" ? 1 : -1) *
                              entry.entry.amount_paise
                            }
                          />
                        )}
                      </details>
                    </td>
                    <td data-label="Posting date">
                      <input
                        aria-label={`Date ${r.source_row}`}
                        disabled={pending || rulePending}
                        type="date"
                        value={r.date}
                        onChange={(e) =>
                          update(r.source_row, { date: e.target.value })
                        }
                      />
                    </td>
                    <td data-label="Description">
                      <input
                        aria-label={`Description ${r.source_row}`}
                        disabled={pending || rulePending}
                        maxLength={240}
                        value={r.description}
                        onChange={(e) =>
                          update(r.source_row, { description: e.target.value })
                        }
                      />
                    </td>
                    <td data-label="Type">
                      <select
                        aria-label={`Type ${r.source_row}`}
                        disabled={pending || rulePending}
                        value={r.kind}
                        onChange={(e) =>
                          update(r.source_row, {
                            kind: e.target.value as StatementDraft["kind"],
                            category_id: "",
                            loan_id: "",
                            principal: "",
                            interest: "",
                            subscription_id: "",
                            selected: false,
                          })
                        }
                      >
                        <option value="">Exclude / needs review</option>
                        <option value="expense">Expense</option>
                        <option value="income">Income</option>
                        <option value="loan_payment">
                          EMI / loan repayment
                        </option>
                      </select>
                    </td>
                    <td data-label="Amount (₹)">
                      <input
                        aria-label={`Amount ${r.source_row}`}
                        disabled={pending || rulePending}
                        inputMode="decimal"
                        value={r.amount}
                        onChange={(e) =>
                          update(r.source_row, { amount: e.target.value })
                        }
                      />
                    </td>
                    <td data-label="Category or loan">
                      {r.kind === "loan_payment" ? (
                        <>
                          <select
                            aria-label={`Loan ${r.source_row}`}
                            disabled={pending || rulePending}
                            value={r.loan_id ?? ""}
                            onChange={(e) =>
                              update(r.source_row, { loan_id: e.target.value })
                            }
                          >
                            <option value="">Choose loan</option>
                            {s.loans
                              .filter(
                                (l) =>
                                  l.status === "active" && !l.card_account_id,
                              )
                              .map((l) => (
                                <option key={l.id} value={l.id}>
                                  {l.name}
                                </option>
                              ))}
                          </select>
                          <label>
                            Principal (₹)
                            <input
                              aria-label={`Principal ${r.source_row}`}
                              disabled={pending || rulePending}
                              inputMode="decimal"
                              value={r.principal ?? ""}
                              onChange={(e) =>
                                update(r.source_row, {
                                  principal: e.target.value,
                                })
                              }
                            />
                          </label>
                          <label>
                            Interest (₹)
                            <input
                              aria-label={`Interest ${r.source_row}`}
                              disabled={pending || rulePending}
                              inputMode="decimal"
                              value={r.interest ?? ""}
                              onChange={(e) =>
                                update(r.source_row, {
                                  interest: e.target.value,
                                })
                              }
                            />
                          </label>
                          <small>
                            Use the lender’s split. Paid from the selected
                            account. Exclude payments already included in the
                            loan’s tracking balance; no fees or estimates.
                          </small>
                        </>
                      ) : (
                        <>
                          {" "}
                          <select
                            aria-label={`Category ${r.source_row}`}
                            disabled={pending || rulePending || !r.kind}
                            value={r.category_id}
                            onChange={(e) =>
                              update(r.source_row, {
                                category_id: e.target.value,
                              })
                            }
                          >
                            <option value="">Choose category</option>
                            {s.categories
                              .filter((c) => c.kind === r.kind)
                              .map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                          </select>
                        </>
                      )}
                    </td>
                    <td data-label="Review">
                      {r.kind === "expense" && (
                        <label>
                          Subscription (optional)
                          <select
                            aria-label={`Subscription ${r.source_row}`}
                            disabled={pending || rulePending}
                            value={r.subscription_id ?? ""}
                            onChange={(e) =>
                              update(r.source_row, {
                                subscription_id: e.target.value,
                              })
                            }
                          >
                            <option value="">No subscription link</option>
                            {s.subscriptions
                              .filter(
                                (sub) =>
                                  sub.active &&
                                  (!sub.account_id ||
                                    sub.account_id === account),
                              )
                              .map((sub) => (
                                <option key={sub.id} value={sub.id}>
                                  {sub.name}
                                </option>
                              ))}
                          </select>
                        </label>
                      )}
                      <RememberStatementRow
                        row={r}
                        account={account}
                        pending={pending || rulePending}
                        onSave={saveRule}
                      />
                      {r.note}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {view === "Needs attention" && (
            <div className="page-actions">
              {next && (
                <Button variant="outline" disabled={pending || rulePending}
                  onClick={() => setReviewRow(next.row.source_row)}>
                  Next unresolved row
                </Button>
              )}
              <Button variant="ghost" onClick={() => {
                changeView("All rows");
                reviewSummary.current?.focus();
              }}>
                Back to all rows
              </Button>
            </div>
          )}
          <p>
            Selected expenses {money(total("expense"))} · Selected income{" "}
            {money(total("income"))} · Selected EMIs{" "}
            {money(total("loan_payment"))}
          </p>
          <Button
            variant="outline"
            disabled={pending || rulePending || !selected.length}
            onClick={() => void preview()}
          >
            Check statement duplicates
          </Button>
          <p className="small-note">
            Only selected reviewed row details and a document fingerprint are
            sent for duplicate checking/posting. Same-file rows cannot repost
            after category edits; exact ledger matches are also checked.
            Missing/unreadable rows are not imported. Genuine identical payments
            require manual reconciliation.
          </p>
          {checked && (
            <>
              <label className="csv-confirm">
                <input
                  type="checkbox"
                  disabled={pending || rulePending || !selected.length}
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                I compared the selected rows, dates, categories and totals with
                the original statement, reviewed EMI principal/interest splits
                and excluded transfers, card repayments and unclassified
                credits.
              </label>
              <Button
                disabled={
                  pending || rulePending || !confirmed || !selected.length
                }
                onClick={() => void commit()}
              >
                Import {selected.length} statement transactions
              </Button>
            </>
          )}
        </>
      )}
    </section>
  );
}
