# Data model · Phase 2

The executable contract is `supabase/migrations/*.sql`; generated client types are in `src/private/database.types.ts`. Eight migrations are applied to the connected free Supabase project. No real records are seeded. Fresh workspace initialization inserts only a zero-valued profile and category taxonomy.

Money is integer paise (`bigint`), bounded to ±1,000,000,000,000 paise at input boundaries. SQL aggregates are serialized as integer strings; client parsing rejects values beyond supported safe limits rather than rounding. Loan principal is limited to 1,000,000,000 paise (₹1 crore), APR numeric(7,4) 0–60, tenure 1–120 months. Accounting dates use India `date`; timestamps use UTC timestamptz displayed in Asia/Kolkata.

| Table | Core fields | Accounting rule |
| --- | --- | --- |
| profiles | id → auth.users, display_name, monthly_income_paise, monthly_living_budget_paise, emergency_reserve_paise, currency, timezone | Plan values; INR and Asia/Kolkata fixed |
| accounts | id, user_id, name, type, opening_balance_paise, opening_date, archived_at | Signed balance = opening + all posted entries; credit-card debt negative; archive retains history |
| categories | id, user_id, name, kind | Owner/kind/name unique; entries must match kind |
| transactions | id, user_id, account_id, category_id?, kind, amount_paise, occurred_on, description, transfer_id? | Signed nonzero amounts; only protected RPCs can write |
| loans | id, user_id, name, principal_paise, apr, tenure_months, start_date, status, generated emi_paise | Starting tracking principal less repayments = outstanding debt; closing stops planned EMI but retains debt |
| loan_payments | id, user_id, loan_id, transaction_id, principal_paise, interest_paise, paid_on | One linked cash outflow for principal + interest; only principal reduces debt; deletion reverses both |
| subscriptions | id, user_id, account_id?, name, amount_paise, cadence, next_due_on, active | Forecast only; monthly/yearly/weekly; settled charge entered separately |
| budgets | id, user_id, category_id, month, limit_paise | Owner/category/month unique; expense category; first-day month; spent derives from actual expense rows |
| savings_goals | id, user_id, name, target_paise, target_on? | Goal target; not an asset |
| goal_allocations | id, user_id, goal_id, account_id, amount_paise | Unique goal/account earmark; counts against available cash and target, not net worth |
| folio_private.mutation_receipts | user_id, request_id, operation, payload_hash, result_id, created_at | Retry deduplication; no raw payload; not exposed to clients |

## Ownership and permissions

Public financial rows carry an auth.users owner FK and unique (id,user_id) keys. Composite child FKs preserve ownership, including category kind. SELECT/INSERT/UPDATE/DELETE policies use `(select auth.uid())` plus a cached JWT anonymous-user denial; UPDATE enforces USING and WITH CHECK. Anon has no financial table/RPC privileges. Transactions, loan_payments and goal_allocations have no direct client writes. Accounts/loans are archived/closed, not deleted through the app. Categories referenced by history cannot be deleted. Goal deletion releases earmarks.

Private SECURITY DEFINER functions validate the caller, fixed search_path, parent ownership, dates and amounts. `record_transfer` posts balanced debit/credit legs atomically, including credit-card payments. `record_loan_payment` locks the loan and account, rejects overpayment and posts cash/principal once. `set_goal_allocation` locks goal/account, prevents initial over-allocation, and permits zero release even from an archived account. Later spending can underfund earmarks; allocations are planning reservations, not bank-enforced holds. `delete_entry` removes both transfer legs or the associated repayment row. UUID retry IDs deduplicate each operation and reject altered payload reuse.

## Reporting and reconciliation

`workspace_snapshot()` is a caller/RLS-scoped aggregate. Current-month income and expense exclude transfers. Debt cash outflow includes both loan principal and interest once. Net worth sums all account balances (including archived and negative liabilities) minus remaining tracked loan principal. Available cash sums active bank/savings/cash balances minus their earmarks; investments and credit cards are excluded. Six-month cash flow uses actual settled activity. The ledger page is never used to calculate balances.

Use an opening date before the first included transaction. When onboarding an existing loan, enter its then-outstanding principal and remaining term, without also posting loan proceeds. Do not duplicate credit-card debt as a tracked loan. To reconcile a bank difference, inspect missing/duplicate entries and opening balance; editing an opening balance is explicit and retains a single opening baseline. This version has no immutable audit trail or separate reconciliation journal.

Planned surplus uses profile income − living budget − active loan EMI. Include subscriptions in the entered living budget; subscription forecasts do not reduce this twice. Purchase comparisons never create transactions, debt or saved scenarios. Actual repayments can differ from estimated schedules. Fees/GST/refunds require explicit manual entries; dedicated refund matching is not included.

## Validation and future scope

`supabase/tests/security_and_accounting.sql` contains 101 isolation/accounting assertions on rolled-back fixtures. `bootstrap.sql` is for disposable non-Supabase Postgres only; never run it hosted. `hosted_acceptance.sql` is DDL-free and rolls back generated Auth/financial fixtures. User exports/deletion UI, immutable audit history, reminders and encrypted offline editing are later work. Database owner deletion cascades owned records, but no client account-deletion flow is provided.

## Phase 3 · saved_simulations (applied migration)

Immutable owner-scoped v1 purchase snapshots store a name, integer price paise, numeric APR, EMI/delay months, payment method and integer-paise income/living/EMI/liquid-cash/reserve assumptions, plus UUID/version/creation time. RLS restricts SELECT/INSERT/DELETE to the non-anonymous owner; no UPDATE is granted. An owner/date/id index supports ten-record pages. A snapshot is independent of financial rows and never modifies balances or loans. The additive migration is applied; filenames match the hosted migration versions. A follow-up policy migration caches the JWT object without changing access rules.

## Phase 3 · CSV import (applied migration)

public.preview_csv_import and public.import_csv_entries are authenticated invoker wrappers around owner-checking private functions. Normalized rows post through the existing record_entry path under the destination account lock; no new public financial table is introduced. folio_private.csv_import_receipts stores owner/request UUID, payload hash, original result counts and creation time, with RLS and all client table access revoked. Batch retry does not retain raw file contents or change duplicate entries. See CSV_IMPORT.md.

## Loan document review extension (applied migration)

`20261120205247_loan_document_review.sql` adds nullable `loans.reported_emi_paise` and an owned credit-card account link. Existing generated `emi_paise` stays an estimate; monthly commitments prefer the reported EMI. Net worth deducts standalone outstanding loans, while linked plans are already represented by the card balance. Card type is guarded and linked plans reject duplicate loan-payment postings.

`loan_document_details` stores one owner-scoped structured review per loan: unique owner/SHA-256 fingerprint, strict terms JSON, schedule rows/page references, positive revision and update time. Authenticated SELECT uses cached owner/JWT identity; anonymous reads and all direct writes are denied. `save_loan_document` is an invoker wrapper around an unexposed, tightly scoped owner-checking implementation. Unknown keys, raw text payloads, oversized data, invalid dates/rates/paise and unreconciled rows are rejected. Small lender-table rounding differences up to 100 paise are retained; only reconciliation within one paise qualifies for schedule-derived balance calculations.

Original principal/tenure and disclosure APR live in reviewed details. The existing tracking principal becomes the current confirmed outstanding plus previously posted principal, preserving historical ledger entries. Fully paid plans can have zero tracking principal only when closed. A save never inserts proceeds or historical repayments. Saving and any subsequent loan/repayment changes advance the review revision. Snapshot payloads expose `has_document`, reported EMI and card link, without loading full document details. Saved review balances are dated snapshots, not a live lender balance; edits require current balance/remaining-term review.

## Savings & investments extension (applied migration)

`20261121092504_savings_investments.sql` introduces `investment_holdings` (owner, scheme, provider, funding source, optional owned investment-account link, lock-in date, archive flag and revision) and `investment_entries` (owner/holding composite FK, kind, integer paise, settled date, note, creation time). Kinds are valuation, own contribution, employer contribution and withdrawal. Direct client writes and anonymous reads are revoked; authenticated SELECT uses owner-only cached-identity RLS. Account links are owner/type checked and unique per account; the account's investment type cannot change while referenced.

The latest valuation by date/creation/id supplies reported value. Contributions/withdrawals supply separate history and FY totals; they never post transactions or mutate that valuation. All mutations go through retry-safe owner-checking functions, with holding revisions and per-owner serialization. Removing the last valuation is rejected. `investment_portfolio()` is an owner-scoped invoker read; `workspace_snapshot()` adds unlinked reported values to assets/net worth only, including archived holdings. Linked account balances remain authoritative for net worth. Liquid cash and simulator spendable funds are unchanged. No ROI is inferred from incomplete history.

## Statement import source markers · review migration

Historical email tables/functions are dropped by forward removal migration 20261121115333. Settled `transactions`, `subscriptions`, budgets and holdings are preserved. The historical Gmail migration remains immutable in replay history.

`folio_private.statement_rows` keys confirmed source markers by owner, account, document SHA-256 and page/line ID. Its owner-composite account FK prevents cross-workspace links. It contains no financial row content or raw document. `folio_private.statement_requests` stores request payload hashes and inserted/skipped counts for safe unchanged retries. Both tables enable RLS, revoke browser access and are reached only through owner-checked private definer functions with empty search paths and public invoker wrappers.

`preview_statement_import` validates selected structured rows and returns duplicate flags. `import_statement_entries` atomically records reviewed entries, source markers and its retry receipt, reusing existing accounting/range checks. A previously imported same-file row stays blocked after edits or intentional ledger deletion; exact existing date/type/amount/description matches across files are also skipped independent of category. Genuine identical payments need manual reconciliation. These new statement APIs are not deployed yet; see STATEMENT_IMPORT.md.
