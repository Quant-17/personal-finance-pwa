# Data model · proposed Phase 2 contract

No migrations or backend tables are created in Phase 1. This document defines the intended model for review. Every amount is integer paise (`bigint` in PostgreSQL). Serialize bigint safely; validate safe integer boundaries in TypeScript and never blindly coerce arbitrary database bigint values. Rates use fixed precision decimal columns, not floating point.

| Table | Principal fields | Rules |
| --- | --- | --- |
| profiles | id uuid → auth.users, display_name, currency, timezone | One row per user; INR, Asia/Kolkata defaults |
| accounts | id, user_id, name, type (bank/savings/credit_card/cash/investment), opening_balance_paise, opening_date, archived_at | No full card numbers, PINs or bank credentials; liabilities negative |
| categories | id, user_id, name, kind (income/expense) | User-owned taxonomy |
| transactions | id, user_id, account_id, category_id, amount_paise, kind, occurred_on date, description, transfer_id?, created_at timestamptz | Signed amounts; transfers paired atomically and excluded from income/expenses |
| loans | id, user_id, account_id?, name, principal_paise, apr numeric(7,4), tenure_months, start_date, status | Track remaining balance from repayment records; don't decrement twice |
| loan_payments | id, user_id, loan_id, transaction_id?, due_on, principal_paise, interest_paise, paid_at? | Paise precision; unique loan/due date; link actual repayments |
| subscriptions | id, user_id, account_id?, name, amount_paise, cadence, next_due_on, active | Forecast only until matched to a transaction; no expense double counting |
| budgets | id, user_id, category_id, month date, limit_paise | Unique owner/category/month; month normalized to first day |
| savings_goals | id, user_id, name, target_paise, target_on?, status | Contributions tracked separately from expenses |
| goal_allocations | id, user_id, goal_id, account_id, amount_paise | Earmarking, not a new asset; prevent over-allocation |
| purchase_scenarios | id, user_id, name, price_paise, apr, tenure_months, delay_months, selected_method | Optional future saved inputs; recalculate results with versioned assumptions |

## Ownership and integrity
Every financial row has `user_id uuid not null references auth.users(id)` and a unique `(id, user_id)` key for composite references. Child references include both the referenced ID and `user_id` so a row cannot point at another owner's account/category/loan. Index ownership, due dates and transaction occurrence dates. Enforce positive price/budget/tenure and supported enum constraints. IDs are UUIDs; creation/audit timestamps use UTC `timestamptz`. Display timestamps in Asia/Kolkata. Accounting dates and month boundaries use local `date`, avoiding UTC day shifts.

## Access control
Enable RLS before exposing any table. SELECT/DELETE policies use `auth.uid() = user_id`; INSERT uses the same `WITH CHECK`; UPDATE needs both `USING` and `WITH CHECK`. Apply equivalent ownership policies to profiles (`auth.uid() = id`). Test owner A, owner B and anonymous sessions against every operation. No public financial read policy. Any SECURITY DEFINER function must pin its search_path, validate the caller and have narrowly granted execution rights.

Use transactional SQL functions for transfer pairs, repayment posting and allocations requiring cross-row invariants. Never rely solely on client validation. Reconcile credit card payments as transfers to liabilities, not a second expense. Record fees, interest and refunds explicitly. Decide balance reconciliation rules before CRUD implementation. Retention, export and deletion remain Phase 2 design work.

## Prototype distinctions
Static fixtures aren't a ledger. The sample transaction list is intentionally incomplete. Account examples represent liquid cash and a credit liability; total savings also includes investments not itemized in the account preview. No real account identifiers or personal financial records are included.
