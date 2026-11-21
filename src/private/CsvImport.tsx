import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { Button } from "../components/ui/button";
import { formatExactMoney } from "../lib/finance";
import type { Snapshot } from "./domain";
import { check, db } from "./workspace";
import { CSV_MAX_BYTES, CSV_TEMPLATE, csvPreview } from "./csv";
import type { CsvRow } from "./csv";

const resultSchema = z.object({
  inserted: z.number().int().min(0).max(500),
  skipped: z.number().int().min(0).max(500),
});
type Row = CsvRow & { selected: boolean; existing: boolean };
export function CsvImport({
  snapshot,
  onImported,
}: {
  snapshot: Snapshot;
  onImported: (
    result: z.infer<typeof resultSchema> & { excluded: number },
  ) => void;
}) {
  const accounts = snapshot.accounts.filter((a) => !a.archived_at);
  const [account, setAccount] = useState(accounts[0]?.id ?? "");
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [checked, setChecked] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [fileKey, setFileKey] = useState(0);
  const busy = useRef(false);
  const mounted = useRef(true);
  const epoch = useRef(0);
  const request = useRef({ signature: "", id: crypto.randomUUID() });
  const readController = useRef<AbortController | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      readController.current?.abort();
    };
  }, []);
  const selected = rows.filter(
    (r) => r.selected && r.entry && !r.repeated && !r.existing,
  );
  const candidates = rows.filter((r) => r.entry && !r.repeated);
  // At most 500 integer-paise rows, each <= 10^12: totals stay below 2^53.
  const total = (kind: "income" | "expense") =>
    selected.reduce(
      (sum, row) =>
        sum + (row.entry!.kind === kind ? row.entry!.amount_paise : 0),
      0,
    );
  const reset = () => {
    epoch.current++;
    request.current = { signature: "", id: crypto.randomUUID() };
    readController.current?.abort();
    setRows([]);
    setError("");
    setChecked(false);
    setConfirmed(false);
    setFileKey((k) => k + 1);
  };
  const chooseFile = async (file: File | undefined) => {
    if (busy.current || !file) return;
    busy.current = true;
    setPending(true);
    reset();
    const version = epoch.current;
    try {
      if (file.size > CSV_MAX_BYTES)
        throw new Error("Choose a CSV file no larger than 1 MiB.");
      const text = new TextDecoder("utf-8", { fatal: true }).decode(
        await file.arrayBuffer(),
      );
      const opening = accounts.find((a) => a.id === account)?.opening_date;
      if (!opening) throw new Error("Choose an active account first.");
      const parsed = csvPreview(
        text,
        snapshot.categories,
        [opening, snapshot.profile.tracking_start_date ?? opening]
          .sort()
          .at(-1)!,
      );
      if (mounted.current && epoch.current === version)
        setRows(
          parsed.map((row) => ({
            ...row,
            selected: !!row.entry && !row.repeated,
            existing: false,
          })),
        );
    } catch (failure) {
      if (mounted.current && epoch.current === version)
        setError(
          failure instanceof Error
            ? failure.message
            : "Use a UTF-8 CSV file in the Folio template format.",
        );
    } finally {
      busy.current = false;
      if (mounted.current) setPending(false);
    }
  };
  const duplicates = async () => {
    if (busy.current || !candidates.length) return;
    busy.current = true;
    setPending(true);
    setError("");
    setConfirmed(false);
    const controller = new AbortController();
    readController.current = controller;
    try {
      const result = await db()
        .rpc("preview_csv_import", {
          p_account: account,
          p_rows: candidates.map((r) => r.entry),
        })
        .abortSignal(controller.signal);
      check(result);
      const found = z
        .object({ duplicates: z.array(z.boolean()).length(candidates.length) })
        .parse(result.data).duplicates;
      if (mounted.current) {
        const byRow = new Map(candidates.map((row, i) => [row.line, found[i]]));
        setRows((current) =>
          current.map((row) => ({
            ...row,
            existing: byRow.get(row.line) ?? false,
            selected: row.selected && !byRow.get(row.line),
          })),
        );
        setChecked(true);
      }
    } catch {
      if (mounted.current)
        setError(
          "Could not check duplicates. Nothing has been imported. Please retry.",
        );
    } finally {
      busy.current = false;
      if (mounted.current) setPending(false);
    }
  };
  const commit = async () => {
    if (busy.current || !checked || !confirmed || !selected.length) return;
    busy.current = true;
    setPending(true);
    setError("");
    const payload = {
      p_account: account,
      p_rows: selected.map((r) => r.entry),
    };
    const signature = JSON.stringify(payload);
    if (request.current.signature !== signature)
      request.current = { signature, id: crypto.randomUUID() };
    try {
      const result = await db().rpc("import_csv_entries", {
        ...payload,
        p_request_id: request.current.id,
      });
      if (result.error?.code === "22003") {
        if (mounted.current)
          setError(
            "Selected rows exceed the supported financial totals. Reduce the file amounts or select fewer rows. Nothing was imported.",
          );
        return;
      }
      check(result);
      const counts = resultSchema.parse(result.data);
      if (counts.inserted + counts.skipped !== selected.length)
        throw new Error("Unexpected import response.");
      if (mounted.current) {
        reset();
        onImported({ ...counts, excluded: rows.length - selected.length });
      }
    } catch {
      if (mounted.current)
        setError(
          "The import could not be confirmed. Retry the unchanged selection to safely check its result, or refresh the ledger before starting again.",
        );
    } finally {
      busy.current = false;
      if (mounted.current) setPending(false);
    }
  };
  return (
    <section className="card private-panel" aria-labelledby="csv-import-title">
      <h2 id="csv-import-title">Import transactions from CSV</h2>
      <p>
        Use UTF-8 CSV with date, type, amount, category and description columns.
        Dates: YYYY-MM-DD. Amounts: positive rupees, up to two decimals, without
        ₹ or grouping commas. Type: income or expense. Category must match an
        existing category of that type.
      </p>
      <p className="small-note">
        Up to 500 rows / 1 MiB. Transfers and loan repayments use their
        dedicated forms. Exact matches are skipped; genuine identical repeat
        purchases should be entered manually.
      </p>
      <a
        download="folio-import-template.csv"
        href={"data:text/csv;charset=utf-8," + encodeURIComponent(CSV_TEMPLATE)}
      >
        Download empty CSV template
      </a>
      <div className="csv-import-controls">
        <label>
          Import into account
          <select
            value={account}
            disabled={pending || !accounts.length}
            onChange={(e) => {
              setAccount(e.target.value);
              reset();
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
          Choose CSV file
          <input
            key={fileKey}
            type="file"
            accept=".csv,text/csv"
            disabled={pending || !account}
            onChange={(e) => void chooseFile(e.target.files?.[0])}
          />
        </label>
        <Button
          variant="outline"
          disabled={pending || !rows.length}
          onClick={reset}
        >
          Clear preview
        </Button>
      </div>
      {!accounts.length && <p>Add an active account before importing.</p>}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {rows.length > 0 && (
        <>
          <p>
            {rows.length} rows · {rows.filter((r) => !!r.error).length} invalid
            · {rows.filter((r) => r.repeated || r.existing).length} duplicates ·{" "}
            {selected.length} selected
          </p>
          <div
            className="csv-preview-scroll"
            tabIndex={0}
            aria-label="CSV row preview"
          >
            <table className="csv-preview">
              <thead>
                <tr>
                  <th>Select</th>
                  <th>Row</th>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.line}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Select CSV row ${row.line}`}
                        checked={row.selected}
                        disabled={
                          pending || !row.entry || row.repeated || row.existing
                        }
                        onChange={(e) => {
                          setConfirmed(false);
                          setRows((current) =>
                            current.map((r) =>
                              r.line === row.line
                                ? { ...r, selected: e.target.checked }
                                : r,
                            ),
                          );
                        }}
                      />
                    </td>
                    <td>{row.line}</td>
                    <td>{row.entry?.occurred_on ?? "—"}</td>
                    <td>{row.entry?.description ?? "—"}</td>
                    <td>{row.entry?.kind ?? "—"}</td>
                    <td>
                      {row.entry
                        ? formatExactMoney(row.entry.amount_paise)
                        : "—"}
                    </td>
                    <td>
                      {row.error ||
                        (row.repeated
                          ? "Repeated in this file"
                          : row.existing
                            ? "Already in ledger"
                            : checked
                              ? "Ready"
                              : "Not checked against ledger")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="page-actions">
            <Button
              variant="outline"
              disabled={pending || !candidates.length}
              onClick={() => void duplicates()}
            >
              {pending ? "Working…" : "Check duplicates"}
            </Button>
          </div>
          <p className="small-note">
            The file is parsed on this device. Check duplicates sends valid row
            details to your private Supabase workspace, without posting them.
            Invalid and duplicate rows are excluded.
          </p>
          {checked && (
            <>
              <p>
                Selected income {formatExactMoney(total("income"))} · Selected
                expenses {formatExactMoney(total("expense"))}
              </p>
              <label className="csv-confirm">
                <input
                  type="checkbox"
                  checked={confirmed}
                  disabled={pending || !selected.length}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                I reviewed the selected rows and want to post them to this
                account.
              </label>
              <Button
                disabled={pending || !confirmed || !selected.length}
                onClick={() => void commit()}
              >
                Import {selected.length} transactions
              </Button>
            </>
          )}
        </>
      )}
    </section>
  );
}
