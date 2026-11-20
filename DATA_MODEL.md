# Data model · Phase 2

The executable contract is `supabase/migrations/*.sql`; generated client types are in `src/private/database.types.ts`. Three migrations are applied to the connected, initially empty free Supabase project. No real records are seeded. Fresh workspace initialization inserts only a zero-valued profile and category taxonomy.

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
