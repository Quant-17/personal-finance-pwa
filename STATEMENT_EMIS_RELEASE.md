# Statement EMI extension · v0.3.5-rc.1

Review branch: `feature/statement-emis`. This release has not been merged, migrated on hosted Supabase or published. The existing private v0.3.4-rc.1 and public synthetic demo remain unchanged.

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

## Release order after review

1. Merge the reviewed PR.
2. Apply `supabase/migrations/20261121153540_statement_loan_repayments.sql` to the existing free project; run hosted rollback acceptance. Match the migration filename to the managed recorded version if needed, preserving SQL bytes.
3. Build the clean merged source, run the private-origin release/CSP/PWA preflight, and publish only `folio-review`.
4. Verify hosted release metadata/assets and preserve the existing public demo. The owner then reviews a statement in-app; do not post actual owner records as part of deployment.

The migration preserves existing public RPC signatures, tables, private function grants and source/retry receipts. Install it before serving the new frontend. Source duplicate markers and existing loan/account mutations remain authoritative. Conservative matching of same-loan/date/account/amount payments can require manual reconciliation when two equal payments were genuinely made that day.
