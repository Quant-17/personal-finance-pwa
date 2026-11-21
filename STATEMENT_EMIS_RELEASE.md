# Statement EMI extension · v0.3.5-rc.1

The owner explicitly approved PR #16 merge, the EMI migration and private deployment on 21 November 2026 IST. PR #16 is merged as `5972915a492a2b3140bd3db98c8a3e94344d931e`. Private **v0.3.5-rc.1** is live at https://folio-review.sid-17061999.workers.dev/. The public synthetic demo is unchanged.

## Behavior

Type → **EMI / loan repayment**, choose an existing standalone loan, then enter the lender-reviewed principal and interest. The selected bank account pays the total once; only principal reduces debt. Monthly actual debt payments include the total, while living expense budgets exclude it. Nothing posts without the owner's review/confirmation.

No automatic estimates, owner data seeds, mailbox access or raw document uploads. Card-linked plans and card bill repayment tracking remain separate. Exclude payments already incorporated in the loan tracking balance.

## Validation

- Lint, TypeScript checks and production build passed.
- 130 Vitest and 2 release verification tests passed.
- All 25 private browser tests passed, including exact-split PDF EMI review and linked RPC payload, existing import retries, mobile containment and private-view locking.
- Sorted migrations replayed on disposable PostgreSQL 17; the existing accounting/security, saved comparison, CSV, loan, investment, email retirement and statement suites passed. Statement assertions now cover exact splits, bank/debt/summary/net-worth effects, manual repayment matches, source reimport after closing, overpayment, atomic multi-row rollback, ownership, baseline dates and card exclusions.
- Investment, CSV, statement and new statement-EMI concurrency harnesses passed. Concurrent EMI imports post one debit and one principal reduction.
- Existing PDF bundle-size and dependency annotation warnings are non-blocking. Readable PDFs only; no OCR was added.

## Release record

1. PR #16 merged after owner approval; branch/PR CI passed; merged-main CI run `44922265366` passed.
2. Hosted migration `20261121160204` (`statement_loan_repayments`) applied. All **42 hosted rollback assertions passed** using disposable synthetic records; no real bank records were imported. The filename is aligned with the managed version, with identical SQL bytes.
3. Clean merged-source production build and private-origin artifact preflight passed. Published only `folio-review` at **21 November 2026, 21:33:30 IST**. Worker version `b645433d-4959-4475-866c-151579ca3f2f`, deployment `4d27575e-def6-4130-85b9-715bd3ede524`, 100% traffic.
4. Hosted root/release metadata, manifest, app shell, service worker, exact-origin CSP, all **20 asset byte comparisons** and JavaScript/PDF worker MIME checks passed. Public demo deployment `92d02c4b-850d-46ae-81ea-3b51d7ed58a6` / version `5e0cb7ff-e84b-4095-9d17-cff53db0d267` remains unchanged. Actual imports and physical-device acceptance remain the owner’s in-app review task.

The migration preserves existing public RPC signatures, tables, private function grants and source/retry receipts. Install it before serving the new frontend. Source duplicate markers and existing loan/account mutations remain authoritative. Conservative matching of same-loan/date/account/amount payments can require manual reconciliation when two equal payments were genuinely made that day.

## Existing advisor findings

Supabase security/performance advisors were checked after the migration. The four private receipt/source tables intentionally have RLS with no browser policies and revoked browser table access ([advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)). No new tables or indexes were added. Existing informational foreign-key/index findings remain ([index guidance](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys)). Supabase still reports the existing disabled leaked-password protection setting ([Auth guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)); this release does not change Auth configuration or the no-paid-services requirement.

Rollback: previous private v0.3.4-rc.1 Worker version `3a69b746-8bef-4193-aa34-9c13e45536c5`. The additive/backward-compatible statement RPC changes retain existing income/expense clients; do not delete repayment ledger rows as a frontend rollback action.
