# Phase 3 · CSV import review

This slice adds CSV preview/import to Transactions. The combined release branch now includes saved-simulations PR #4 and CSV PR #5, with both features and all tests preserved. No live database or app changes are part of integration. See PHASE3_RELEASE.md for the combined rollout.

## File format

Use UTF-8 comma-separated CSV with exactly five columns (any order):

```csv
date,type,amount,category,description
```

Dates are real YYYY-MM-DD calendar dates, on/after the destination account's opening and no later than today in Asia/Kolkata. Type is income or expense. Amount is a positive INR value with up to two decimal places, without a currency symbol, scientific notation or grouping commas; it becomes integer paise. Category must match exactly one existing category of the same type (case-insensitive, trimmed). Description is optional text up to 240 characters. Quoted commas/newlines, escaped double quotes, UTF-8 BOM and CRLF are supported. Blank records are ignored. Limits: 500 data records, 1 MiB file size, and the existing per-entry amount bound of 10^12 paise. This does not automatically map arbitrary bank-statement columns. Transfers and loan repayments must use their dedicated forms to preserve accounting semantics.

The downloadable template contains only a header, so it cannot accidentally post synthetic sample transactions. Preview row numbers identify CSV records after blank-record removal; multiline quoted descriptions do not correspond one-to-one to physical text lines.

## User flow and privacy

Choose an active destination account and a file. Parsing/validation and within-file repeat detection happen locally. Invalid and repeated rows are excluded; remaining rows can be deselected. Check duplicates sends normalized valid row details to the existing private Supabase workspace without posting them. It checks against the entire owned destination-account ledger, not just the visible ledger page. The user reviews the result, selected income/expense totals and the confirmation checkbox before Import becomes available. Changing selection clears confirmation; changing account/file clears the preview. A final summary distinguishes added rows, ledger matches at posting, and rows excluded from selection.

The file itself, its name and raw bytes are not uploaded or persisted by the app. Row details remain in React memory until cleared, navigation away, background/offline lock or sign-out. The existing AuthGate and no-store client apply; no CSV data or API response enters localStorage, URLs, logs or Workbox caches. Formula-looking descriptions are displayed as text; no spreadsheet formula is evaluated or exported. No real files are supplied by automation.

## Duplicate and retry semantics

An exact match has the same owner, destination account, date, income/expense kind, category, signed integer-paise amount and normalized description. CSV descriptions are trimmed at the boundary; comparisons to current ledger descriptions are exact. Within-file repeats and current ledger matches are skipped. Different categories/descriptions/amounts are separate entries. Genuine identical repeat purchases require deliberate manual entry; this conservative import has no force-duplicate switch.

The server revalidates every selected row and acquires the same account row lock used by existing financial posting paths. It rechecks duplicates while holding that lock and inserts through the existing private record_entry function. The combined candidate locks all owned account rows in UUID order during commit, then validates resulting account/summary/budget/cash-flow totals against the existing 10^12-paise dashboard bound. A range failure rolls back every posted row and returns a clear no-import message. One invalid row rolls back the whole batch, including its receipt. Concurrent imports at the standard READ COMMITTED isolation are tested to post one expense, not two. The existing per-entry date/category/ownership rules remain authoritative.

The client reuses a request UUID for an unchanged uncertain commit. A private owner-scoped receipt stores a SHA-256 payload hash and original inserted/skipped counts, without the CSV payload. A successful retry returns those counts without reposting, even if the account has since been archived; changed data with the same UUID is rejected. A fresh request for the same existing records skips them. Deleted/edited entries are not permanent duplicate history: a later deliberate import can post a record no longer matching the ledger. Preview results are advisory and may change before commit.

## Migration and review rollout

`supabase/migrations/20261120171312_csv_import_preview_and_commit.sql` adds the unexposed, deny-by-default RLS receipt table and narrow authenticated preview/commit RPC wrappers. Privileged functions stay in folio_private with explicit owner checks and empty search_path. No client access to the receipt table or validation/detection helpers is granted. PUBLIC/anon execution is revoked; anonymous Auth users are rejected. Existing tables/functions are retained.

The migration is prepared, not applied to hosted Supabase. After review, apply it to the existing project before publishing the CSV app candidate, refresh types if needed, run security/performance advisors, and check only disposable owner fixtures. The new receipt table intentionally has no client RLS policies, like existing mutation receipts. Retain it when rolling back assets; do not delete financial records or undo migrations as an app rollback. No paid resources or bank APIs are required.

CI replays every migration on disposable PostgreSQL 17, runs the existing accounting/isolation suites plus csv_import.sql, then executes csv_concurrency.sh with two independent clients. The race harness creates .invalid fixtures only on that disposable instance and deletes them after verification. Never run bootstrap.sql or the concurrency harness on managed Supabase. Local unit tests and intercepted browser tests send no live email or financial mutation.
