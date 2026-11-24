# Loan and subscription removal

In **Loans & subscriptions**, choose **Delete loan** or a subscription's **Delete**. An iPhone sheet explains the financial effect. Type `DELETE` and choose **Delete from my finances**. Cancellation makes no changes.

Loans disappear from current balances, payment-progress charts, monthly EMI totals, upcoming deductions, forecasts and fresh simulations. Posted principal/interest payments and their original bank debits remain. Removing an outstanding standalone liability increases calculated net worth by its remaining tracked principal; it does **not** pay or forgive a real debt. For a settled loan, record its final repayment first. A removed card EMI plan leaves the card account balance intact, so the debt simulator treats that portion as card debt and may need revolving APR/minimum inputs.

Subscriptions disappear from monthly cost totals and future deductions. Because the app includes subscriptions inside the living budget, deletion offers **Reduce** (default for active subscriptions) or **Keep my current living budget**. Reduce deducts the plan's monthly equivalent, capped at the current budget. Annual charges divide by 12; weekly charges multiply by 52/12, rounded half up to integer paise. Paused plans release no budget. Lower living costs feed both the Buy simulator and debt repayment simulator. Actual historical expenses, cash balances and category budgets stay unchanged. Frozen saved comparisons retain their original figures; choose the current-plan option to recalculate one.

## Accounting and security

Removal is a tombstone (`removed_at`) rather than destruction of linked payment history. The `remove_commitment` invoker RPC delegates to an owner-checked private implementation. It locks the target, checks the reviewed loan balance or subscription monthly cost and living budget, then applies removal, any chosen budget adjustment and disables linked statement rules atomically. Retried and concurrent requests return without freeing money twice. Removed rows cannot be edited or reopened; active payment/import checks reject them. Direct subscription DELETE is revoked. Normal owner RLS remains in force, including historical rows.

The workspace snapshot excludes removed records from loans/subscriptions and loan aggregates. Existing projections and simulators therefore receive current figures without posting synthetic transactions. Audit history records removal, and financial exports retain the removed record and linked history. Existing version-1/2 archives remain supported; restored tombstones stay excluded. No real owner data is removed during implementation or verification. Removed names/financial terms remain private history, not a promise of permanent data erasure; whole-account deletion is separate under Data & privacy.

## Validation

Run the normal lint, typecheck, unit and production-build checks, private Chromium and iPhone WebKit tests. Replay all migrations on disposable Postgres, then `supabase/tests/commitment_removal.sql` and `supabase/tests/removal_concurrency.sh` (plus the existing SQL suites). The SQL acceptance fixture rolls back completely and supports hosted verification without reading real owner records. Browser tests intercept synthetic APIs; physical iPhone acceptance remains an owner check.
