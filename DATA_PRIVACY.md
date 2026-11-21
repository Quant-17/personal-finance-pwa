# Data & privacy · V1 controls

The authenticated navigation includes **Data & privacy**. These controls act only after the owner chooses them; implementing, testing or deploying them never exports or deletes an existing owner's account.

## Monthly reconciliation

Select the month you intend to import. The checklist compares the profile reporting cutoff and active bank/card/standalone-loan baseline dates with the beginning of that month. It flags dates that prevent a complete import and links to existing account/loan review forms. A date that covers the month does not prove the opening amount is correct.

Verify the actual statement's opening balance and closing balance, and compare opening + credits − debits with closing. Account balances saved later in the month must not be silently backdated. EMIs already included in a tracked loan balance must not reduce principal again. Reported on-time instalment counts remain separate from recorded repayments. Reconcile self transfers/card bills with the dedicated transfer workflow and investment contributions with their dedicated history/bank accounting; excluding a statement row does not post that cash movement.

The owner's sample statement PDFs remain analysis/templates only. No sample transaction is imported as part of this setup. Actual first-month opening figures and physical device acceptance require the owner’s review.

## Portable financial archive

**Download financial data** calls `export_financial_data` and downloads a local JSON file. The stable invoker function uses a consistent database statement snapshot, explicit owner filters and existing RLS. It exports these public tables: profiles, accounts, categories, transactions, loans, loan_payments, subscriptions, budgets, savings_goals, goal_allocations, loan_document_details, saved_simulations, investment_holdings, investment_entries, statement_rules. Earlier, archived, closed and inactive records are included. It is independent of the ledger's current page and reporting cutoff.

Monetary keys ending in `_paise` become exact integer strings, recursively, including nested reviewed terms. The export has a format/version, owner ID, export timestamp, INR currency and Asia/Kolkata timezone. It excludes Auth users/sessions/passwords/credentials, internal retry/source-marker tables, and original PDFs. The frontend verifies ownership and the complete table set before creating a download. Database output is limited to 20 MiB; the final browser file to 24 MiB. Downloaded files contain private information and remain under the owner's control.

This is a portable data archive, **not an automatic database restore feature**. It does not contain internal duplicate/retry markers or all managed Auth configuration, and must not be blindly reimported. No export is fetched in the background or stored in localStorage/HTTP/Workbox caches. On iPhone Safari, use the browser's download/Save to Files flow; actual-device acceptance remains required.

## Permanent self-account deletion

The user expands deletion controls, types `DELETE MY ACCOUNT` exactly, acknowledges the irreversible operation, enters their current password and clicks the final deletion button. No other user ID can be supplied. A separate memory-only Supabase Auth client confirms the password without replacing the workspace's normal persistent session or broadcasting a UI sign-in. Password fields clear when submitted and are never logged or sent to the deletion RPC.

`public.delete_own_account` is an invoker wrapper. Its private SECURITY DEFINER implementation has an empty search path, derives the caller using the existing verified/non-anonymous owner gate, and verifies:

- Exact confirmation text.
- A signed root JWT password AMR timestamp between now and five minutes ago. `iat`, token refresh, recovery sign-in and editable `user_metadata` cannot substitute for password proof.
- An existing own Auth session with an unexpired `not_after`, when set.
- An existing email-confirmed Auth user.

It locks owned loans then accounts, matching financial mutation order, and deletes only that Auth user. Existing `ON DELETE CASCADE` owner foreign keys remove live financial records, private retry/source markers and Auth sessions atomically. A constraint failure rolls back deletion. Other owners are untouched. Neither the browser nor the agent retrieves a service-role key. Existing Supabase database privileges perform the narrow guarded operation; there is no new paid service or Edge Function.

Successful deletion clears the device's normal session and returns to sign-in. Supabase JWTs may remain cryptographically valid until expiry, but the deleted user/session and financial records no longer exist; FK constraints reject recreation under that deleted identity and server verification rejects the user. If a response is interrupted, the UI does not claim deletion succeeded; it tells the owner to sign out and check sign-in status before further action. Previously downloaded files and provider-managed backup retention are outside live account deletion. Storage-object ownership can prevent Auth deletion; this app does not upload source PDFs, and any such dependency must be resolved explicitly rather than bypassed.

## Validation and release

Disposable PostgreSQL tests in `supabase/tests/data_controls.sql` cover owned full-history export, precision, anonymous/other-owner isolation, stale/future/forged password proofs, missing/expired sessions and exact confirmation. They delete only newly created synthetic `.invalid` users, verify cascade cleanup/other-owner preservation, and roll back the whole fixture transaction. Never bootstrap a hosted database. Unit tests cover archive ownership/completeness and reconciliation-date checks. Private browser tests cover download contents, invalid-export rejection, responsive layout, password failure, deliberate deletion and sign-out with intercepted synthetic APIs.

Apply the versioned `private_data_controls` migration before publishing this frontend. An older frontend can continue using the additive schema/RPCs if a frontend rollback is needed. Rollback cannot restore a user who independently chose deletion. Test real-device downloads/installation and a reconciled first monthly import before declaring full personal-use acceptance complete.
