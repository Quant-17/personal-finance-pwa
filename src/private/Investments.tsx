import { InvestmentPerformance } from "./InvestmentPerformance";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  Landmark,
  Plus,
  ArrowUpRight,
  History,
  ShieldCheck,
} from "lucide-react";
import { z } from "zod";
import { Button } from "../components/ui/button";
import { formatExactMoney as money } from "../lib/finance";
import { db, check } from "./workspace";
import { indiaDate, displayDate, moneyInput, moneyToInput } from "./domain";
import type { Snapshot, InvestmentHolding } from "./domain";
import {
  schemeNames,
  fundingNames,
  entryNames,
  financialYear,
  portfolioSummary,
  holdingTerms,
  investmentEntrySchema,
  settledEntry,
  investmentError,
} from "./investments";
import type { InvestmentEntry } from "./investments";

type Intent =
  | { kind: "holding"; holding: InvestmentHolding | null }
  | {
      kind: "entry";
      holding: InvestmentHolding;
      entry: InvestmentEntry | null;
      defaultKind?: string;
    };
export function Investments({
  snapshot,
  onRefresh,
}: {
  snapshot: Snapshot;
  onRefresh: () => void;
}) {
  const [intent, setIntent] = useState<Intent | null>(null);
  const [history, setHistory] = useState<string | null>(null);
  const [returns, setReturns] = useState<string | null>(null);
  const [archived, setArchived] = useState(false);
  const [notice, setNotice] = useState("");
  const open = (next: Intent) => {
    setNotice("");
    setIntent(next);
  };
  const holdings = snapshot.investments;
  const summary = portfolioSummary(holdings);
  const year = financialYear();
  return (
    <>
      <section className="investment-hero card">
        <div className="investment-hero-copy">
          <span className="eyebrow">
            <Landmark size={16} /> Long-term wealth
          </span>
          <h2>Give your future a place.</h2>
          <p>
            Track NPS, PPF, EPF and other savings with dated statement values
            and contribution history.
          </p>
          <Button
            onClick={() => {
              open({ kind: "holding", holding: null });
              setNotice("");
            }}
          >
            <Plus size={16} />
            Add investment
          </Button>
        </div>
        <div className="investment-hero-total">
          <span>Latest reported portfolio value</span>
          <strong>{money(summary.value)}</strong>
          <small>
            Includes archived holdings. These are dated snapshots, not live
            market prices.
          </small>
        </div>
      </section>
      <div className="investment-stats">
        {[
          ["Your contributions", summary.self, year.label],
          ["Employer contributions", summary.employer, year.label],
          [
            "Additional net-worth assets",
            summary.additionalNetWorth,
            "Linked account values are already counted",
          ],
        ].map(([label, value, hint]) => (
          <article className="card investment-stat" key={String(label)}>
            <span>{label}</span>
            <strong>{money(Number(value))}</strong>
            <small>{hint}</small>
          </article>
        ))}
      </div>
      <p className="investment-policy">
        <ShieldCheck size={16} /> Contribution history does not post bank
        transactions or change reported valuations. NPS/PPF default to
        self-funded; EPF defaults to payroll. Update the statement value
        separately.
      </p>
      {notice && <p role="status">{notice}</p>}
      {intent?.kind === "holding" && (
        <HoldingForm
          key={intent.holding?.id ?? "new"}
          holding={intent.holding}
          snapshot={snapshot}
          onClose={() => setIntent(null)}
          onSaved={() => {
            setIntent(null);
            setNotice("Investment saved. No bank transaction was posted.");
            onRefresh();
          }}
        />
      )}
      {intent?.kind === "entry" && (
        <EntryForm
          key={intent.entry?.id ?? intent.defaultKind ?? "new-entry"}
          holding={intent.holding}
          entry={intent.entry}
          defaultKind={intent.defaultKind}
          onClose={() => setIntent(null)}
          onSaved={() => {
            setIntent(null);
            setHistory(null);
            setNotice(
              "Investment history saved. Review the latest statement value separately.",
            );
            onRefresh();
          }}
        />
      )}
      <div className="investment-layout">
        <section className="card private-panel">
          <div className="page-actions">
            <h2>Your holdings</h2>
            <label className="csv-confirm">
              <input
                type="checkbox"
                checked={archived}
                onChange={(e) => setArchived(e.target.checked)}
              />
              Show archived
            </label>
          </div>
          {!holdings.filter((h) => archived || !h.archived).length && (
            <div className="investment-empty">
              <Landmark size={34} />
              <h3>A clearer view of your savings</h3>
              <p>
                Add a holding and its latest statement value. No PRAN, UAN,
                account number or provider login is required.
              </p>
            </div>
          )}
          {holdings
            .filter((h) => archived || !h.archived)
            .map((h) => (
              <article className="investment-holding" key={h.id}>
                <div className="investment-holding-heading">
                  <div>
                    <span className="investment-tag">
                      {schemeNames[h.scheme]}
                    </span>
                    <h3>
                      {h.name}
                      {h.archived ? " · Archived" : ""}
                    </h3>
                    <p>
                      {h.provider || "Provider not specified"} ·{" "}
                      {fundingNames[h.funding_source]}
                    </p>
                  </div>
                  <div className="investment-value">
                    <strong>{money(h.value_paise)}</strong>
                    <small>Reported {displayDate(h.valued_on)}</small>
                  </div>
                </div>
                <div className="investment-holding-meta">
                  <span>
                    Your recorded contributions <b>{money(h.self_paise)}</b>
                  </span>
                  <span>
                    Employer <b>{money(h.employer_paise)}</b>
                  </span>
                  <span>
                    Withdrawals <b>{money(h.withdrawn_paise)}</b>
                  </span>
                </div>
                {h.locked_until && (
                  <p className="investment-hint">
                    Lock-in / target access date: {displayDate(h.locked_until)}{" "}
                    · entered manually, not a withdrawal eligibility check.
                  </p>
                )}
                {h.activity_after_valuation > 0 && (
                  <p className="investment-attention">
                    {h.activity_after_valuation} recorded activity item(s)
                    follow this valuation date. Update the reported value to
                    reflect them.
                  </p>
                )}
                {h.account_id && (
                  <p className="investment-hint">
                    Already represented by{" "}
                    {snapshot.accounts.find((a) => a.id === h.account_id)
                      ?.name ?? "an investment account"}
                    . Net worth uses that account balance; changing this
                    statement value does not change the linked account.
                  </p>
                )}
                <div className="page-actions">
                  <Button
                    variant="outline"
                    disabled={h.archived}
                    onClick={() =>
                      open({
                        kind: "entry",
                        holding: h,
                        entry: null,
                        defaultKind: "valuation",
                      })
                    }
                  >
                    <ArrowUpRight size={15} />
                    Update value
                  </Button>
                  <Button
                    variant="outline"
                    disabled={h.archived}
                    onClick={() =>
                      open({
                        kind: "entry",
                        holding: h,
                        entry: null,
                        defaultKind: "self",
                      })
                    }
                  >
                    Record contribution
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => open({ kind: "holding", holding: h })}
                  >
                    Edit holding
                  </Button>
                  <Button
                    variant="ghost"
                    aria-expanded={history === h.id}
                    onClick={() => setHistory(history === h.id ? null : h.id)}
                  >
                    <History size={15} />
                    History
                  </Button>
                </div>
                <Button
                  variant="ghost"
                  onClick={() => setReturns(returns === h.id ? null : h.id)}
                >
                  Investment returns for {h.name}
                </Button>
                {returns === h.id && <InvestmentPerformance holding={h} />}
                {history === h.id && (
                  <InvestmentHistory
                    holding={h}
                    onEdit={(entry) =>
                      open({ kind: "entry", holding: h, entry })
                    }
                  />
                )}
              </article>
            ))}
        </section>
        <aside className="card private-panel investment-allocation">
          <h2>Allocation</h2>
          <p>By reported value, including archived holdings.</p>
          {summary.allocation.map((g) => (
            <div className="investment-allocation-row" key={g.scheme}>
              <div>
                <span>{g.name}</span>
                <strong>{money(g.value)}</strong>
              </div>
              <progress
                max={summary.value || 1}
                value={g.value}
                aria-label={`${g.name} allocation`}
              />
            </div>
          ))}
          {!summary.value && (
            <p className="empty-message">
              Your allocation appears after adding a reported value.
            </p>
          )}
          <hr />
          <h3>Value, not available cash</h3>
          <p>
            These holdings contribute to net worth when counted separately. They
            never increase the Buy Simulator’s available cash.
          </p>
          <p>
            EPF balances should exclude EPS pension amounts that are not part of
            your EPF balance. No statutory rates, tax benefits or interest
            accruals are assumed.
          </p>
        </aside>
      </div>
    </>
  );
}
function useSaveGuard() {
  const active = useRef(true);
  const busy = useRef(false);
  const request = useRef({ signature: "", id: crypto.randomUUID() });
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  return {
    isBusy: () => busy.current,
    isActive: () => active.current,
    begin: (signature: string) => {
      if (busy.current) return null;
      if (request.current.signature !== signature)
        request.current = { signature, id: crypto.randomUUID() };
      busy.current = true;
      return request.current.id;
    },
    end: () => {
      busy.current = false;
    },
  };
}
function HoldingForm({
  holding: h,
  snapshot,
  onClose,
  onSaved,
}: {
  holding: InvestmentHolding | null;
  snapshot: Snapshot;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [scheme, setScheme] = useState(h?.scheme ?? "nps_tier_1");
  const [funding, setFunding] = useState(h?.funding_source ?? "self");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const guard = useSaveGuard();
  const save = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (guard.isBusy()) return;
    setError("");
    const form = new FormData(e.currentTarget);
    try {
      const terms = holdingTerms.parse({
        name: String(form.get("name")),
        scheme,
        provider: String(form.get("provider")),
        funding_source: funding,
        locked_until: String(form.get("lock")) || null,
        account_id: String(form.get("account")) || null,
        archived: form.get("archived") === "on",
      });
      const value = h ? null : moneyInput(String(form.get("value")));
      const date = h ? null : String(form.get("date"));
      if (!h) settledEntry("valuation", value!, date!, "");
      const payload = {
        p_holding: h?.id ?? null,
        p_expected_revision: h?.revision ?? 0,
        p_terms: terms,
        p_initial_value_paise: value,
        p_valued_on: date,
      };
      const signature = JSON.stringify(payload);
      const requestId = guard.begin(signature);
      if (!requestId) return;
      setPending(true);
      const r = await db().rpc("save_investment_holding", {
        ...payload,
        p_request_id: requestId,
      });
      if (r.error) throw new Error(investmentError(r.error.code));
      if (guard.isActive()) onSaved();
    } catch (f) {
      if (guard.isActive())
        setError(
          f instanceof z.ZodError
            ? f.issues
                .map((i) => i.message)
                .slice(0, 2)
                .join(" ")
            : f instanceof Error
              ? f.message
              : "Review the holding details.",
        );
    } finally {
      guard.end();
      if (guard.isActive()) setPending(false);
    }
  };
  return (
    <section
      className="card private-panel investment-form"
      aria-labelledby="holding-form-title"
    >
      <div className="page-actions">
        <h2 id="holding-form-title">
          {h ? "Edit investment holding" : "Add savings or investment"}
        </h2>
        <Button variant="ghost" disabled={pending} onClick={onClose}>
          Close investment form
        </Button>
      </div>
      <form onSubmit={(e) => void save(e)}>
        <fieldset disabled={pending}>
          <div className="document-fields">
            <label>
              Holding name
              <input
                name="name"
                required
                maxLength={80}
                defaultValue={h?.name ?? ""}
                placeholder="e.g. My PPF"
              />
            </label>
            <label>
              Scheme
              <select
                aria-label="Scheme"
                value={scheme}
                onChange={(e) => {
                  const value = e.target.value as typeof scheme;
                  setScheme(value);
                  setFunding(value === "epf" ? "payroll" : "self");
                }}
              >
                {Object.entries(schemeNames).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Provider · optional
              <input
                name="provider"
                maxLength={80}
                defaultValue={h?.provider ?? ""}
                placeholder="Bank, CRA or EPFO"
              />
            </label>
            <label>
              Contribution source
              <select
                aria-label="Contribution source"
                value={funding}
                onChange={(e) => setFunding(e.target.value as typeof funding)}
              >
                {Object.entries(fundingNames).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            {!h && (
              <>
                <label>
                  Latest reported value (₹)
                  <input
                    name="value"
                    required
                    inputMode="decimal"
                    placeholder="0.00"
                  />
                </label>
                <label>
                  Valuation date
                  <input
                    name="date"
                    type="date"
                    required
                    max={indiaDate()}
                    defaultValue={indiaDate()}
                  />
                </label>
              </>
            )}
            <label>
              Lock-in / target access date · optional
              <input
                name="lock"
                type="date"
                defaultValue={h?.locked_until ?? ""}
              />
            </label>
            <label>
              Net-worth treatment
              <select
                aria-label="Net-worth treatment"
                name="account"
                defaultValue={h?.account_id ?? ""}
              >
                <option value="">Count this reported value separately</option>
                {snapshot.accounts
                  .filter(
                    (a) =>
                      a.type === "investment" &&
                      (!a.archived_at || a.id === h?.account_id),
                  )
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      Already included in {a.name}
                      {a.archived_at ? " (archived)" : ""}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <p>
            Keep ordinary bank savings in Accounts. Choose an existing
            investment account only if its balance already includes this
            holding. This prevents double-counting; the linked account remains
            the source for net worth.
          </p>
          {h && (
            <label className="csv-confirm">
              <input
                name="archived"
                type="checkbox"
                defaultChecked={h.archived}
              />
              Archive this holding. Its reported value remains in portfolio
              totals and net worth.
            </label>
          )}
          <p>
            Statement value is a dated snapshot. Contribution history does not
            automatically change it or deduct cash from a bank account.
          </p>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save investment"}
          </Button>
        </fieldset>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
      </form>
    </section>
  );
}
function EntryForm({
  holding: h,
  entry,
  defaultKind,
  onClose,
  onSaved,
}: {
  holding: InvestmentHolding;
  entry: InvestmentEntry | null;
  defaultKind?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [kind, setKind] = useState(entry?.kind ?? defaultKind ?? "self");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const guard = useSaveGuard();
  const save = async (form: HTMLFormElement, remove = false) => {
    if (guard.isBusy()) return;
    setError("");
    try {
      const f = new FormData(form);
      const v = remove
        ? {
            kind: entry!.kind,
            amount_paise: entry!.amount_paise,
            occurred_on: entry!.occurred_on,
            note: entry!.note,
          }
        : settledEntry(
            kind,
            moneyInput(String(f.get("amount"))),
            String(f.get("date")),
            String(f.get("note")),
          );
      if (
        remove &&
        !window.confirm(
          "Remove this history entry? Removing a valuation may restore the previous reported value. Bank transactions are unchanged.",
        )
      )
        return;
      const payload = {
        p_holding: h.id,
        p_expected_revision: h.revision,
        p_entry: entry?.id ?? null,
        p_kind: v.kind,
        p_amount_paise: v.amount_paise,
        p_occurred_on: v.occurred_on,
        p_note: v.note,
        p_delete: remove,
      };
      const signature = JSON.stringify(payload);
      const requestId = guard.begin(signature);
      if (!requestId) return;
      setPending(true);
      const r = await db().rpc("record_investment_entry", {
        ...payload,
        p_request_id: requestId,
      });
      if (r.error) throw new Error(investmentError(r.error.code));
      if (guard.isActive()) onSaved();
    } catch (f) {
      if (guard.isActive())
        setError(
          f instanceof z.ZodError
            ? f.issues
                .map((i) => i.message)
                .slice(0, 2)
                .join(" ")
            : f instanceof Error
              ? f.message
              : "Review the history entry.",
        );
    } finally {
      guard.end();
      if (guard.isActive()) setPending(false);
    }
  };
  return (
    <section
      className="card private-panel investment-form"
      aria-labelledby="investment-entry-title"
    >
      <div className="page-actions">
        <h2 id="investment-entry-title">
          {entry ? "Edit investment history" : "Record investment activity"} ·{" "}
          {h.name}
        </h2>
        <Button variant="ghost" disabled={pending} onClick={onClose}>
          Close history form
        </Button>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save(e.currentTarget);
        }}
      >
        <fieldset disabled={pending}>
          <div className="document-fields">
            <label>
              Activity type
              <select
                aria-label="Activity type"
                value={kind}
                onChange={(e) => setKind(e.target.value)}
              >
                {Object.entries(entryNames).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {kind === "valuation"
                ? "Reported value (₹)"
                : "Activity amount (₹)"}
              <input
                name="amount"
                required
                inputMode="decimal"
                defaultValue={entry ? moneyToInput(entry.amount_paise) : ""}
              />
            </label>
            <label>
              Activity / statement date
              <input
                name="date"
                type="date"
                required
                max={indiaDate()}
                defaultValue={entry?.occurred_on ?? indiaDate()}
              />
            </label>
            <label>
              Note · optional
              <input
                name="note"
                maxLength={160}
                defaultValue={entry?.note ?? ""}
              />
            </label>
          </div>
          <p>
            {kind === "valuation"
              ? "Enter the full statement balance, not its change. The most recent valuation date determines the reported value. Backdated values are retained as history."
              : h.funding_source === "payroll"
                ? "Payroll contribution history only. Your bank balance and salary income are not deducted again. Update the reported value separately."
                : "Contribution / withdrawal history only. Record any actual bank movement separately, and update the reported value when your statement changes."}
          </p>
          <div className="page-actions">
            <Button type="submit" disabled={pending || h.archived}>
              {pending ? "Saving…" : "Save history entry"}
            </Button>
            {entry && (
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={(e) => {
                  const form = e.currentTarget.closest("form");
                  if (form) void save(form, true);
                }}
              >
                Remove history entry
              </Button>
            )}
          </div>
          <p>
            Keep at least one valuation. Recorded contributions are history, not
            lifetime cost basis; no investment return or tax calculation is
            inferred.
          </p>
        </fieldset>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
      </form>
    </section>
  );
}
function InvestmentHistory({
  holding: h,
  onEdit,
}: {
  holding: InvestmentHolding;
  onEdit: (entry: InvestmentEntry) => void;
}) {
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<InvestmentEntry[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      setLoading(true);
      setError("");
      try {
        const r = await db()
          .from("investment_entries")
          .select("*", { count: "exact" })
          .eq("holding_id", h.id)
          .order("occurred_on", { ascending: false })
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .range(page * 20, page * 20 + 19)
          .abortSignal(controller.signal);
        check(r);
        const parsed = investmentEntrySchema.array().parse(r.data);
        if (!controller.signal.aborted) {
          setRows(parsed);
          setCount(r.count ?? 0);
        }
      } catch {
        if (!controller.signal.aborted) {
          setRows([]);
          setError(
            "Could not load investment history. Close and reopen to retry.",
          );
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [h.id, h.revision, page]);
  return (
    <div className="investment-history">
      <h4>Statement & contribution history</h4>
      {loading ? (
        <p role="status">Loading history…</p>
      ) : error ? (
        <p role="alert">{error}</p>
      ) : (
        <>
          <div className="csv-preview-scroll">
            <table className="csv-preview">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Amount / value</th>
                  <th>Note</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{displayDate(r.occurred_on)}</td>
                    <td>{entryNames[r.kind]}</td>
                    <td>{money(r.amount_paise)}</td>
                    <td>{r.note || "—"}</td>
                    <td>
                      <Button variant="ghost" onClick={() => onEdit(r)}>
                        Edit history entry
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="page-actions">
            <Button
              variant="outline"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous history
            </Button>
            <span>
              {count
                ? `${page * 20 + 1}–${Math.min((page + 1) * 20, count)} of ${count}`
                : "No history"}
            </span>
            <Button
              variant="outline"
              disabled={(page + 1) * 20 >= count}
              onClick={() => setPage((p) => p + 1)}
            >
              Next history
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
