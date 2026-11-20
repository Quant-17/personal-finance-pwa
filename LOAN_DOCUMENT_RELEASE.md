# Loan document review · published 21 November 2026 IST

The owner explicitly answered yes to merging PR #8, applying its migration and deploying v0.3.1-rc.1. PR #8 merged as `a64f86468435fcff002feaac42ae2f0f92389ef9`, containing the reviewed head `22f5cd344cee313bb224b8ba7d31e46187431bcf`. Stage 4 remains paused. No real loan import, balance update or historical payment posting was performed.

## Private app

- URL: https://folio-review.sid-17061999.workers.dev/
- Version: `0.3.1-rc.1`.
- Deployed source: `22f5cd344cee313bb224b8ba7d31e46187431bcf`, the reviewed clean build included in the merged PR.
- Worker version: `0b770b99-ce3c-4698-9207-608003901603`.
- Deployment: `23536432-95df-48e0-a526-e0e14ac53e88`, 100% traffic on the private origin.
- Root, manifest, app shell, service worker and exact-origin CSP verification passed. All 20 served asset paths matched the clean private build byte-for-byte; the PDF worker is served as `application/javascript`. A fresh signed-out Chromium check at 390px rendered v0.3.1-rc.1, activated the service worker, cached only same-origin static files and showed no horizontal overflow. [Release screenshot](docs/screenshots/loan-document-signin.jpg). This is not physical-device or owner-login acceptance.

Open **Loans & subscriptions → Import loan PDF**. Read supported digital CRED/Credit Saison, Kotak card EMI and L&T PDFs locally; review terms/page references, quoted EMI, current principal, liability treatment and repayment rows before saving. Later **Edit loan** loads the reviewed fields without requiring the PDF. Files are not archived or uploaded. See LOAN_DOCUMENT_IMPORT.md for the complete workflow and limitations.

## Database

The connected migration tool assigned `20261120205247_loan_document_review.sql` to the reviewed loan-document DDL. The release bookkeeping renames the repository file from its original review version `20261120200827`; SQL bytes are unchanged. This prevents a future CLI push replaying an already applied CREATE/ALTER migration. Six previous hosted migrations remain intact; no bootstrap or destructive reset was run.

The DDL-free `supabase/tests/loan_documents_hosted_acceptance.sql` passed on the actual project: precise disclosed APR/quoted EMI, current balance, no historical postings, retry protection, duplicate rollback without orphan loans, card liability accounting, rejection of duplicate card repayments, stale-review rejection after repayment, preservation of recorded principal and owner/anonymous isolation. All generated .invalid Auth users and synthetic financial fixtures rolled back. No owner financial rows were inspected.

Permission inspection confirmed RLS is enabled, authenticated SELECT is granted with owner policy, and direct INSERT/UPDATE plus anonymous SELECT are denied. All new functions deny anonymous execution; the public save wrapper is an invoker and the private privileged functions retain empty search paths and owner checks.

Post-migration advisors reported no new WARN/ERROR. The existing [leaked-password-protection warning](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) remains; Supabase documents that protection as Pro-only, while this app must stay free. Intentional private receipt no-policy INFO and unused-index INFO remain. The [composite foreign-key index INFO](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys) concerns loan_document_details(loan_id,user_id); its loan_id primary key already limits each lookup to one row, so no redundant covering index was added.

## Validation and remaining acceptance

[Quality run 44814725647](https://github.com/Quant-17/personal-finance-pwa/actions/runs/44814725647) passed both jobs on the reviewed head: lint/typecheck, 101 Vitest plus two release tests, six demo and sixteen private browser tests, build/release checks and disposable Postgres 17 replay. Database suites include 39 loan assertions, rollback-only hosted-compatible acceptance and the CSV concurrency harness. A clean configured production build passed before publication; production dependency audit was clear.

All four supplied PDFs were checked locally through the actual browser PDF worker with saving disabled. Key terms were populated; original PDF data and owner financial figures were not added to repository fixtures. Small lender rounding differences stay labelled as estimates; missing dates and L&T's empty repayment table need manual review.

Physical iPhone Safari/installed-PWA and Windows feature acceptance remain owner work. Save any open edits before **Update app**, then verify the v0.3.1-rc.1 footer. On each device, choose a supported PDF, review extracted values and correction controls, and confirm saving only when the current balance/date and card-liability treatment are correct. No original files are stored, and no automatic historical transactions are posted. Current estimates are not lender-confirmed balances.

## Recovery

Previous private recovery version: `58afee9a-fb3d-48d0-a376-0f9af9121bc2` (v0.3.0-rc.3). For a frontend regression restore that private asset version and verify the root/headers; retain the additive migration, reviewed loan rows and retry receipts. Asset rollback does not reverse user financial changes. Do not drop tables or delete entries as a frontend recovery step.

The public synthetic folio Worker remains version `5e0cb7ff-e84b-4095-9d17-cff53db0d267`, deployment `92d02c4b-850d-46ae-81ea-3b51d7ed58a6`, independently verified unchanged through the Cloudflare API. No paid service or automatic deployment was enabled. Existing Auth URLs and origin-scoped sessions were preserved.
