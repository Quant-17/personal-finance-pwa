import { useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { Button } from "../components/ui/button";
import { indiaDate, displayDate } from "./domain";
import type { Snapshot } from "./domain";
import { financialExport, importReadiness } from "./dataPrivacy";
import { db, check } from "./workspace";
export function DataControls({
  snapshot: s,
  owner,
  email,
  onDeleted,
}: {
  snapshot: Snapshot;
  owner: string;
  email: string;
  onDeleted: () => Promise<void>;
}) {
  const [month, setMonth] = useState(indiaDate().slice(0, 7));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [password, setPassword] = useState("");
  const [understood, setUnderstood] = useState(false);
  const mounted = useRef(true),
    running = useRef(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      request.current?.abort();
    };
  }, []);
  let readiness: ReturnType<typeof importReadiness> | null = null;
  try {
    readiness = importReadiness(s, month);
  } catch {
    /* Incomplete month input remains editable. */
  }
  const download = async () => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setMessage("");
    const c = new AbortController();
    request.current = c;
    try {
      const result = await db()
        .rpc("export_financial_data")
        .abortSignal(c.signal);
      check(result);
      if (!mounted.current || c.signal.aborted) return;
      const text = financialExport(result.data, owner),
        url = URL.createObjectURL(
          new Blob([text], { type: "application/json" }),
        );
      const link = document.createElement("a");
      link.href = url;
      link.download = `folio-export-${indiaDate()}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage(
        "Export prepared. Check your downloads or use Save to Files on iPhone.",
      );
    } catch {
      if (mounted.current && !c.signal.aborted)
        setMessage(
          "Export could not be completed. No records were changed; retry when connected.",
        );
    } finally {
      running.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const erase = async () => {
    if (
      running.current ||
      confirmation !== "DELETE MY ACCOUNT" ||
      !password ||
      !understood
    )
      return;
    running.current = true;
    setBusy(true);
    setMessage("");
    const enteredPassword = password;
    setPassword("");
    // Isolated, memory-only sign-in avoids replacing the current UI session before the RPC completes.
    const fresh = createClient<Database>(
      import.meta.env.VITE_SUPABASE_URL,
      import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
        global: {
          fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
        },
      },
    );
    let sent = false;
    try {
      const signed = await fresh.auth.signInWithPassword({
        email,
        password: enteredPassword,
      });
      if (signed.error || signed.data.user?.id !== owner)
        throw new Error("Password confirmation failed. Nothing was deleted.");
      if (!mounted.current) return;
      sent = true;
      const result = await fresh.rpc("delete_own_account", {
        p_confirmation: confirmation,
      });
      check(result);
      if (result.data !== true)
        throw new Error("Deletion could not be confirmed.");
      if (mounted.current) await onDeleted();
    } catch {
      if (mounted.current)
        setMessage(
          sent
            ? "Deletion could not be confirmed. Sign out, then try signing in to check account status before taking further action."
            : "Password confirmation failed. Nothing was deleted.",
        );
    } finally {
      await fresh.auth.signOut({ scope: "local" }).catch(() => undefined);
      running.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  return (
    <div className="data-controls">
      <section className="card private-panel">
        <h2>Monthly import readiness</h2>
        <label>
          Month to reconcile
          <input
            aria-label="Month to reconcile"
            type="month"
            value={month}
            disabled={busy}
            onChange={(e) => setMonth(e.target.value)}
          />
        </label>
        <p>
          Opening balances must describe the start of the period you import.
          This check never changes balances or imports statements.
        </p>
        {readiness ? (
          <>
            {readiness.cutoff && (
              <p className="form-error">
                Your reporting start ({displayDate(readiness.cutoff)}) excludes
                part or all of this month. Review it in Monthly plan.
              </p>
            )}
            {readiness.accounts.length === 0 && (
              <p>Add an active bank or card account before importing.</p>
            )}
            {readiness.accounts.map((a) => (
              <p key={a.id}>
                <strong>{a.name}</strong> · Baseline{" "}
                {displayDate(a.opening_date)} ·{" "}
                {a.needsReview
                  ? "Review the opening date and statement opening balance before importing the full month."
                  : "Date covers this month; verify the opening amount against your statement."}
              </p>
            ))}
            {readiness.loans.length > 0 && (
              <p className="form-error">
                Some loan balances start after the beginning of this month:{" "}
                {readiness.loans.map((l) => l.name).join(", ")}. Earlier EMIs
                may already be included. Do not reduce principal again; review
                the loan baseline first.
              </p>
            )}
          </>
        ) : (
          <p>Choose a valid statement month.</p>
        )}
        <p>
          Compare opening balance + credits − debits with the closing statement
          balance. Keep self transfers and card bills in their dedicated
          transfer workflow. Review investment contributions in Savings &amp;
          investments; an exclusion rule alone does not record their bank
          outflow.
        </p>
        <div className="page-actions">
          <a className="text-link" href="#accounts">
            Review accounts →
          </a>
          <a className="text-link" href="#commitments">
            Review loans →
          </a>
          <a className="text-link" href="#activity">
            Review statement →
          </a>
        </div>
      </section>
      <section className="card private-panel">
        <h2>Download your financial data</h2>
        <p>
          Download all saved financial records, including earlier and archived
          history, investment valuations, loan terms and remembered rules.
          Amounts ending in “_paise” are exact integer strings.
        </p>
        <p>
          This JSON export contains private financial information. Save it
          somewhere you control. It excludes passwords, sessions and original
          PDFs. Automatic restore is not available; this is a portable data
          archive.
        </p>
        <Button disabled={busy} onClick={() => void download()}>
          Download financial data
        </Button>
      </section>
      <section className="card private-panel">
        <h2>Delete your account</h2>
        <p>
          Permanently delete your sign-in account and its live Folio financial
          records. Download anything you need first. Files you already
          downloaded remain on your device. This cannot be undone in the app.
        </p>
        <details>
          <summary>Open account deletion controls</summary>
          <label>
            Confirmation
            <input
              aria-label="Account deletion confirmation"
              value={confirmation}
              autoComplete="off"
              disabled={busy}
              onChange={(e) => setConfirmation(e.target.value)}
              placeholder="DELETE MY ACCOUNT"
            />
          </label>
          <label>
            Current password
            <input
              aria-label="Current password for deletion"
              type="password"
              autoComplete="current-password"
              value={password}
              disabled={busy}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={understood}
              disabled={busy}
              onChange={(e) => setUnderstood(e.target.checked)}
            />{" "}
            I have saved anything I need and understand that my account and live
            financial records will be deleted.
          </label>
          <p>
            Password confirmation happens with Supabase Auth. A recent password
            sign-in and an active session are also checked on the server.
          </p>
          <Button
            variant="outline"
            disabled={
              busy ||
              confirmation !== "DELETE MY ACCOUNT" ||
              !password ||
              !understood
            }
            onClick={() => void erase()}
          >
            Permanently delete my account
          </Button>
        </details>
      </section>
      {message && <p role="status">{message}</p>}
    </div>
  );
}
