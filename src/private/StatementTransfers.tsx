import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { Button } from "../components/ui/button";
import { formatExactMoney as money } from "../lib/finance";
import { indiaDate } from "./domain";
import type { Snapshot } from "./domain";
import { readPdfText } from "./readPdfText";
import { extractStatement } from "./statements";
import type { StatementDraft } from "./statements";
import { transferPairs } from "./transferMatching";
import { db, check } from "./workspace";
type Document = { hash: string; rows: StatementDraft[] };
export function StatementTransfers({
  snapshot: s,
  onSaved,
}: {
  snapshot: Snapshot;
  onSaved: () => void;
}) {
  const accounts = s.accounts.filter((a) => !a.archived_at),
    [from, setFrom] = useState(accounts[0]?.id ?? ""),
    [to, setTo] = useState(accounts[1]?.id ?? ""),
    [month, setMonth] = useState(indiaDate().slice(0, 7));
  const [debit, setDebit] = useState<Document | null>(null),
    [credit, setCredit] = useState<Document | null>(null),
    [password, setPassword] = useState(""),
    [pairKey, setPairKey] = useState(""),
    [preview, setPreview] = useState<{
      matches: string[];
      already_linked: boolean;
    } | null>(null),
    [existing, setExisting] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const mounted = useRef(true),
    running = useRef(false),
    controller = useRef<AbortController | null>(null),
    request = useRef({ signature: "", id: crypto.randomUUID() });
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, []);
  const invalidate = () => {
    setPreview(null);
    setExisting("");
    setConfirmed(false);
  };
  const result = useMemo(() => {
    try {
      return {
        pairs: debit && credit ? transferPairs(debit.rows, credit.rows) : [],
        error: "",
      };
    } catch (e) {
      return {
        pairs: [],
        error: e instanceof Error ? e.message : "Review the pair manually.",
      };
    }
  }, [debit, credit]);
  const pair = result.pairs.find((p) => p.key === pairKey);
  const spec =
    pair && debit && credit
      ? {
          from_account: from,
          to_account: to,
          amount_paise: pair.amount,
          debit_on: pair.debit.date,
          credit_on: pair.credit.date,
          description:
            `Transfer: ${s.accounts.find((a) => a.id === from)?.name} → ${s.accounts.find((a) => a.id === to)?.name}`.slice(
              0,
              240,
            ),
          debit_source: { sha: debit.hash, row: pair.debit.source_row },
          credit_source: { sha: credit.hash, row: pair.credit.source_row },
          existing_transfer: existing || null,
        }
      : null;
  const read = async (file: File | undefined, side: "debit" | "credit") => {
    if (!file || running.current) return;
    running.current = true;
    setBusy(true);
    setMessage("");
    invalidate();
    setPairKey("");
    const c = new AbortController();
    controller.current = c;
    const secret = password;
    setPassword("");
    try {
      const doc = await readPdfText(file, c.signal, secret || undefined);
      const account = side === "debit" ? from : to;
      const rows = extractStatement(
        doc.lines,
        month,
        s.accounts.find((a) => a.id === account)?.type === "credit_card",
      );
      if (mounted.current && !c.signal.aborted) {
        const value = { hash: doc.source_sha256, rows };
        if (side === "debit") setDebit(value);
        else setCredit(value);
      }
    } catch (e) {
      if (mounted.current && !c.signal.aborted)
        setMessage(e instanceof Error ? e.message : "Could not read this PDF.");
    } finally {
      running.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const checkPair = async () => {
    if (!spec || running.current) return;
    running.current = true;
    setBusy(true);
    setMessage("");
    try {
      const response = await db().rpc("preview_transfer_match", {
        p_spec: { ...spec, existing_transfer: null },
      });
      check(response);
      const data = z
        .object({ matches: z.array(z.uuid()), already_linked: z.boolean() })
        .parse(response.data);
      if (mounted.current) {
        setPreview(data);
        setExisting("");
        setConfirmed(false);
      }
    } catch (e) {
      if (mounted.current)
        setMessage(
          e instanceof Error
            ? e.message
            : "Could not check existing transfers.",
        );
    } finally {
      running.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const save = async () => {
    if (
      !spec ||
      !preview ||
      !confirmed ||
      running.current ||
      (preview.matches.length > 0 && !existing)
    )
      return;
    running.current = true;
    setBusy(true);
    setMessage("");
    const signature = JSON.stringify(spec);
    if (request.current.signature !== signature)
      request.current = { signature, id: crypto.randomUUID() };
    try {
      const response = await db().rpc("confirm_transfer_match", {
        p_spec: spec,
        p_request_id: request.current.id,
      });
      check(response);
      if (mounted.current) {
        setDebit(null);
        setCredit(null);
        invalidate();
        setMessage(
          existing
            ? "Existing transfer linked. No second payment was posted."
            : "Reviewed transfer recorded once, with both settled dates.",
        );
        onSaved();
      }
    } catch (e) {
      if (mounted.current)
        setMessage(
          (e instanceof Error ? e.message : "Response interrupted.") +
            " Keep this pair and retry to reuse its request ID.",
        );
    } finally {
      running.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  return (
    <section className="card private-panel workflow-page">
      <details>
        <summary>Match transfers and card repayments from statements</summary>
        <p>
          Read the debit and credit statements locally. Equal amounts within
          three days are possible pairs, not proof of a transfer. Verify the
          parties and both dates before posting. Existing transfers can be
          linked without creating another debit. PDFs and passwords remain on
          this device.
        </p>
        <div className="statement-controls">
          <label>
            Transfer from
            <select
              aria-label="Transfer statement from"
              disabled={busy}
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setDebit(null);
                invalidate();
              }}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Transfer to
            <select
              aria-label="Transfer statement to"
              disabled={busy}
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setCredit(null);
                invalidate();
              }}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Statement month
            <input
              aria-label="Transfer statement month"
              type="month"
              value={month}
              disabled={busy}
              onChange={(e) => {
                setMonth(e.target.value);
                setDebit(null);
                setCredit(null);
                invalidate();
              }}
            />
          </label>
          <label>
            Local PDF password
            <input
              aria-label="Transfer PDF password"
              type="password"
              autoComplete="off"
              value={password}
              disabled={busy}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <label>
            Debit statement PDF
            <input
              aria-label="Debit statement PDF"
              type="file"
              accept="application/pdf"
              disabled={busy || !from || from === to}
              onChange={(e) => void read(e.target.files?.[0], "debit")}
            />
          </label>
          <label>
            Credit statement PDF
            <input
              aria-label="Credit statement PDF"
              type="file"
              accept="application/pdf"
              disabled={busy || !to || from === to}
              onChange={(e) => void read(e.target.files?.[0], "credit")}
            />
          </label>
        </div>
        {debit && <p>Debit statement parsed: {debit.rows.length} rows.</p>}
        {credit && <p>Credit statement parsed: {credit.rows.length} rows.</p>}
        {result.error && <p role="alert">{result.error}</p>}
        {debit && credit && (
          <label>
            Possible transfer pair
            <select
              aria-label="Possible transfer pair"
              value={pairKey}
              disabled={busy}
              onChange={(e) => {
                setPairKey(e.target.value);
                invalidate();
              }}
            >
              <option value="">
                Choose and verify a pair ({result.pairs.length})
              </option>
              {result.pairs.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.debit.date} → {p.credit.date} · {money(p.amount)} ·{" "}
                  {p.debit.source_row}/{p.credit.source_row}
                </option>
              ))}
            </select>
          </label>
        )}
        {pair && (
          <>
            <p>Debit: {pair.debit.description}</p>
            <p>Credit: {pair.credit.description}</p>
            <p>
              Amount {money(pair.amount)} · Settled dates {pair.debit.date} /{" "}
              {pair.credit.date}. This will move money between the two selected
              accounts, not create spending or income.
            </p>
            <Button
              disabled={busy}
              variant="outline"
              onClick={() => void checkPair()}
            >
              Check transfer duplicates
            </Button>
          </>
        )}
        {preview && (
          <>
            {preview.matches.length > 0 ? (
              <label>
                Existing matching transfer
                <select
                  aria-label="Existing matching transfer"
                  value={existing}
                  disabled={busy}
                  onChange={(e) => {
                    setExisting(e.target.value);
                    setConfirmed(false);
                  }}
                >
                  <option value="">Choose the existing payment to link</option>
                  {preview.matches.map((id, i) => (
                    <option key={id} value={id}>
                      Matching transfer {i + 1} · {id.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p>No existing transfer matches both legs.</p>
            )}
            <label className="csv-confirm">
              <input
                type="checkbox"
                checked={confirmed}
                disabled={busy}
                onChange={(e) => setConfirmed(e.target.checked)}
              />{" "}
              I verified these are the same own-account transfer or card
              repayment, not unrelated payments, refunds or a payment already
              counted elsewhere.
            </label>
            <Button
              disabled={
                busy || !confirmed || (preview.matches.length > 0 && !existing)
              }
              onClick={() => void save()}
            >
              {preview.matches.length
                ? "Link statement rows to existing transfer"
                : "Record reviewed transfer"}
            </Button>
          </>
        )}
        {message && <p role="status">{message}</p>}
      </details>
    </section>
  );
}
