# Loan payment progress

Loans & subscriptions adds an interactive principal-progress ring, repayment-balance curve, instalment inspector and accessible schedule table. The loan selector includes each EMI amount to distinguish similarly named loans.

Principal reduction uses the original principal from the saved reviewed document and the current tracked outstanding. Without original terms, the basis is explicitly the tracking opening principal. Outstanding above the original amount does not produce a negative/false repayment percentage. Saved balances may be manual or estimated; the graph labels the saved balance basis and review date and does not claim bank verification.

The curve uses a complete reviewed lender/manual schedule when available; otherwise it is labelled as a reducing-balance estimate using original principal, nominal rate and original tenure. It is not a historical actual-payment curve. The dashed reference is current tracked outstanding. Fees, flat-rate structures and changes in terms require review. The original scheduled final EMI date is indicative, not a promise of payoff.

New nullable loan metadata `progress_first_due_on` and `payments_reported_through` support the owner’s confirmation that due EMIs were paid on time. The count includes only due dates on/before the reported-through date and today, capped by original tenure. It does not advance automatically beyond that confirmation date or mark future EMIs paid. Recorded ledger repayments remain separate. Short-month dates clamp without drifting later months. An original first EMI date is distinct from the upcoming recurring deduction anchor and the accounting tracking baseline.

The owner supplied corrected first dates and an on-time report through 21 November 2026. Those are configured against existing owned records during release; no personal loan names, dates or figures are seeded into migrations/tests. Missing dates remain editable. Saving a report never posts repayments or changes principal, balances, APR or term. Existing ownership/RLS and loan-document revision guards remain; a database trigger rejects reported-through dates in the future. No new RPC grants or private-response caching.

The owner also clarified that the first monthly upload will occur on 1 December for November transactions. Live reporting starts 1 November; existing 21 November account/loan baselines still require reconciliation before posting earlier payments. The progress confirmation does not resolve or bypass those baselines.

Validation includes lint/typecheck, pure calculation tests, existing ledger/security tests, new progress metadata ownership/future-date/unchanged-balance checks, responsive browser interaction tests and production builds. No actual owner ledger records are imported as part of release. Release verification identifiers follow below.

## Published · v0.3.7-rc.1

PR #20 is merged as `9e97d69863686208268b2033fdd142cd6ccac84c`. Private https://folio-review.sid-17061999.workers.dev/ serves v0.3.7-rc.1. Migration **20261121170658** (`loan_progress_reporting`) is applied; its filename is aligned to the managed version with identical SQL bytes.

The owner’s first EMI dates and on-time report were saved and read back. Existing CRED labels were found reversed relative to the owner’s EMI identities, so records were matched by their reported EMI and labelled consistently. Reviewed first-date overrides were corrected with their manual source reference cleared. Recurring anchors now use confirmed first dates so November planning is available; monthly deduction days remain the same. Transaction-level comparisons verified all other financial loan/document fields remained unchanged and ledger/payment counts did not change. Existing account/loan tracking baselines were preserved.

- Lint/typecheck, **138 Vitest + 2 release tests**, full **28 private browser tests**, six demo browser tests, PostgreSQL migration replay/accounting/isolation suites and four concurrency harnesses passed.
- The initial PR mobile check measured before the chart’s ResizeObserver completed. The containment assertion now waits for the resize; the same resize wait was applied to the Overview chart containment test during bookkeeping. Final feature push/PR runs **44927862348 / 44927867106** and merged-main run **44928190244** passed.
- Hosted rollback acceptance verified owned metadata, snapshot output, future-date denial, unchanged financial terms/ledger and cross-owner isolation.
- Clean merged-source artifact and hosted version/root/manifest/shell/service-worker/exact-origin CSP checks passed. All **20 hosted files matched exact bytes**; JavaScript/PDF worker MIME is correct.
- Published **21 November 2026 at 22:38:58 IST**. Worker version `d78f7fce-8957-4219-b280-5ba07faa5b1f`, deployment `aa5403a7-5a24-457c-a23a-bbc2b441708d`, 100% traffic.
- Public demo deployment `92d02c4b-850d-46ae-81ea-3b51d7ed58a6` / version `5e0cb7ff-e84b-4095-9d17-cff53db0d267` remains unchanged. Previous private v0.3.6-rc.1 version `f3e56870-424f-4d9f-88fa-f9278e77f498` is the frontend rollback reference. Do not remove ledger records for a frontend rollback.

Refresh or use Update app, then Loans & subscriptions → Loan payment progress. The graph distinguishes saved principal, reported on-time instalments and reviewed/estimated schedules. It never creates transactions or guarantees lender payoff. Actual device/statement acceptance remains owner review; the November opening-balance reconciliation is still pending.

Supabase advisors show the same existing private receipt-table information ([RLS explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)), informational index findings ([index guidance](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys)) and disabled leaked-password-protection Auth warning ([Auth guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)). No new categories appeared; Auth configuration/no-paid-services constraint were preserved.
