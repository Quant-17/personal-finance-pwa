# Finance workflows · private v0.4.0-rc.1

Published 22 November 2026, 15:54:59 IST (10:24:59 UTC) at https://folio-review.sid-17061999.workers.dev/.

- Feature PR: https://github.com/Quant-17/personal-finance-pwa/pull/27, merged as `2c15cd798026c183f32d6be84503e3b91d7dfa8f`.
- App version: `0.4.0-rc.1`; clean build metadata identifies source `2c15cd7`, private mode and the existing exact Supabase origin.
- Worker version: `549af9b5-d2cb-4f5b-9ae8-8febd5e0b743`, 100% traffic.
- Deployment: `cf5bf844-c4ba-4233-8612-fa21ee533740`.
- Hosted migrations: `20261122102230_finance_workflows` and `20261122102340_index_restore_owner`.
- Original workflow SQL SHA-256: `9e5874822fc24f9d20c4b5b8deadca23df955f9b5215b3a88159a0ad57566a7f`. The local filename was aligned to its managed timestamp without changing its SQL. Do not reapply it.

## What shipped

Monthly statement reconciliation and reviewed reports; two-statement transfer/card-payment review; an interactive 90-day cash forecast; saved lender fee/tax/promotion assumptions; investment growth/loss and conventional XIRR; validated empty-workspace archive restore and server-recorded financial change history. See FINANCE_WORKFLOWS.md for user flows and limitations.

No sample statements were imported, actual owner financial records exported/restored/deleted, or opening figures invented. Forecasts and scheduled bills never post payments. Original PDFs/passwords remain local. The deployment changes only the authenticated Worker and additive database schema.

## Evidence

- Feature push/PR CI `45011258043` and `45011306772`: both frontend and database jobs passed.
- Local lint/typecheck, 187 Vitest tests and two release-verification tests passed.
- 41 private browser flows passed (40 in the complete local run plus lender-term save separately; all 41 included in feature CI).
- Six demo browser checks passed; one optional hosted-demo response check was skipped locally. The demo was not redeployed.
- Fresh PostgreSQL 17 replay and all accounting/isolation suites passed, including 49 workflow assertions and five concurrent-write suites.
- Managed Supabase executed the complete workflow acceptance suite inside a rolled-back transaction: **49 assertions passed**. A subsequent count confirmed zero leftover workflow fixture users.
- Restore-owner covering index presence was verified; performance advisors no longer report an uncovered foreign key.
- Production build from clean merged source passed exact-origin CSP, manifest, app-shell and service-worker preflight.
- All **20 hosted asset files** match the tested build by byte length and SHA-256 prefix; JavaScript/worker MIME checks passed.
- Hosted release preflight passed for app source `2c15cd7`, security headers, manifest, shell and PWA assets.
- Short-lived asset-upload credentials were removed after deployment; no service-role key was read or exposed.

## Database advisory notes

Six private receipt/source/restore tables deliberately have RLS with no browser policies and no browser grants. Their [RLS-no-policy INFO](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) is expected: only private owner-validating functions access them. New indexes may be reported unused before normal activity; retain the covering indexes.

The pre-existing Auth [leaked-password-protection warning](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) remains. No paid Auth setting was changed. There were no new public-table RLS or mutable-search-path findings.

## Rollback and remaining acceptance

Previous private Worker version: `f8604e03-ae4a-4927-af5d-d70db0527f97`; previous deployment `a5f95e41-a142-4e77-b248-1626407ac999`. A frontend rollback does not roll back database schema, audit events or owner-confirmed records. Previous archive clients can reject version-two exports; prefer a forward-compatible fix for export/restore behavior rather than claiming full old-client compatibility. Do not drop tables or undo financial records as a rollback shortcut.

Public demo remains deployment `92d02c4b-850d-46ae-81ea-3b51d7ed58a6`, Worker version `5e0cb7ff-e84b-4095-9d17-cff53db0d267`.

The owner still needs to supply correct opening figures, review the first actual monthly statement, enter forecast funding settings, confirm complete investment history before interpreting XIRR, and test their physical iPhone/Windows devices. Restore must never overwrite an existing workspace. No production restore/deletion test is needed for acceptance.
