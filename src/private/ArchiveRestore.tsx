import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { Button } from "../components/ui/button";
import { parseFinancialArchive } from "./dataPrivacy";
import { db, check } from "./workspace";
import type { Json } from "./database.types";
const previewSchema = z.object({
  can_restore: z.boolean(),
  archive_hash: z.string(),
  rows: z.number().int().nonnegative(),
  schema_version: z.number().int(),
  legacy_source_warning: z.boolean(),
  reason: z.string().optional(),
});
export function ArchiveRestore({ onRestored }: { onRestored: () => void }) {
  const [archive, setArchive] = useState<Json | null>(null),
    [preview, setPreview] = useState<z.infer<typeof previewSchema> | null>(
      null,
    ),
    [phrase, setPhrase] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const fileGeneration = useRef(0);
  const mounted = useRef(true),
    running = useRef(false),
    request = useRef({ hash: "", id: crypto.randomUUID() }),
    controller = useRef<AbortController | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, []);
  const read = async (file: File | undefined) => {
    const generation = ++fileGeneration.current;
    setArchive(null);
    setPreview(null);
    setConfirmed(false);
    setPhrase("");
    setMessage("");
    if (!file) return;
    try {
      if (file.size > 20 * 1024 * 1024)
        throw Error("Choose a financial JSON archive no larger than 20 MiB.");
      const value = parseFinancialArchive(JSON.parse(await file.text()));
      if (
        Object.values(value.data).reduce((sum, rows) => sum + rows.length, 0) >
        20000
      )
        throw Error("Restore supports at most 20,000 financial/history rows.");
      if (mounted.current && generation === fileGeneration.current)
        setArchive(value as Json);
    } catch (e) {
      if (mounted.current && generation === fileGeneration.current)
        setMessage(
          e instanceof Error ? e.message : "Could not read this archive.",
        );
    }
  };
  const inspect = async () => {
    if (!archive || running.current) return;
    running.current = true;
    setBusy(true);
    setMessage("");
    const c = new AbortController();
    controller.current = c;
    try {
      const r = await db()
        .rpc("preview_financial_restore", { p_archive: archive })
        .abortSignal(c.signal);
      check(r);
      const value = previewSchema.parse(r.data);
      if (mounted.current && !c.signal.aborted) {
        setPreview(value);
        setPhrase("");
        setConfirmed(false);
      }
    } catch (e) {
      if (mounted.current && !c.signal.aborted)
        setMessage(
          e instanceof Error ? e.message : "Archive validation failed.",
        );
    } finally {
      running.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const restore = async () => {
    if (
      !archive ||
      !preview?.can_restore ||
      !confirmed ||
      phrase !== "RESTORE INTO EMPTY WORKSPACE" ||
      running.current
    )
      return;
    running.current = true;
    setBusy(true);
    setMessage("");
    if (request.current.hash !== preview.archive_hash)
      request.current = { hash: preview.archive_hash, id: crypto.randomUUID() };
    try {
      const r = await db().rpc("confirm_financial_restore", {
        p_archive: archive,
        p_expected_hash: preview.archive_hash,
        p_confirmation: phrase,
        p_request_id: request.current.id,
      });
      check(r);
      if (mounted.current) {
        setArchive(null);
        setPreview(null);
        setPhrase("");
        setConfirmed(false);
        setMessage(
          "Archive restored once. Review the imported balances and reconcile statements before recording more activity.",
        );
        onRestored();
      }
    } catch (e) {
      if (mounted.current)
        setMessage(
          (e instanceof Error ? e.message : "Response interrupted.") +
            " Keep this archive selected and retry to reuse the restore request.",
        );
    } finally {
      running.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  return (
    <section className="card private-panel">
      <h2>Restore a financial archive</h2>
      <p>
        Preview a Folio JSON archive, then restore only into an empty financial
        workspace. Existing accounts, transactions, loans, subscriptions and
        investments will never be overwritten or merged. Default
        categories/profile settings in the empty target are replaced after
        confirmation.
      </p>
      <p>
        The archive must contain data you own. IDs and references are remapped
        to the signed-in account. Imported audit history is labelled unverified;
        imported monthly reviews require reconciliation again. No Auth
        credentials or source PDFs are restored.
      </p>
      <label>
        Financial archive JSON
        <input
          aria-label="Financial archive JSON"
          type="file"
          accept="application/json,.json"
          disabled={busy}
          onChange={(e) => void read(e.target.files?.[0])}
        />
      </label>
      <Button
        variant="outline"
        disabled={busy || !archive}
        onClick={() => void inspect()}
      >
        Validate restore preview
      </Button>
      {preview && (
        <>
          <p>
            {preview.rows} financial/history rows · Archive version{" "}
            {preview.schema_version}.
          </p>
          {preview.legacy_source_warning && (
            <p className="form-error">
              This legacy export has no statement source markers. Compare past
              ledger entries carefully before reimporting statements.
            </p>
          )}
          {!preview.can_restore ? (
            <p>{preview.reason}</p>
          ) : (
            <>
              <p>
                The complete archive passed a rolled-back validation. No
                financial records have been restored yet.
              </p>
              <label>
                Restore confirmation
                <input
                  aria-label="Restore confirmation"
                  value={phrase}
                  disabled={busy}
                  placeholder="RESTORE INTO EMPTY WORKSPACE"
                  onChange={(e) => setPhrase(e.target.value)}
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={confirmed}
                  disabled={busy}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />{" "}
                I own this archive, verified the preview and want these records
                in this empty workspace.
              </label>
              <Button
                disabled={
                  busy ||
                  !confirmed ||
                  phrase !== "RESTORE INTO EMPTY WORKSPACE"
                }
                onClick={() => void restore()}
              >
                Restore validated archive
              </Button>
            </>
          )}
        </>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
