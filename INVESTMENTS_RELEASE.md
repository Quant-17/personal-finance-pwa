# Savings & investments · published 21 November 2026 IST

The owner explicitly approved merging PR #10, applying its migration and deploying v0.3.2-rc.1. PR #10 merged as `863c3ad3382c2cc13f574f900d2135b44e7480ac`, containing reviewed head `e067ac24f1b188404a4a43408a813c307d793182`. Broader Stage 4 remains paused. No real portfolio records, bank postings or provider connections were created.

## Private release

- URL: https://folio-review.sid-17061999.workers.dev/
- Version: `0.3.2-rc.1`.
- Deployed source: `e067ac24f1b188404a4a43408a813c307d793182`, the clean reviewed build included in merged PR #10.
- Worker version: `4460c12d-f53d-48a3-bbfb-ca912afb8dfa`.
- Deployment: `fdcebf3e-a7ca-4d81-b7c5-21e8457874dd`, 100% private-origin traffic.
- Hosted root, manifest, app-shell/service-worker and exact-origin CSP verification passed. All 20 served asset paths matched the private build byte-for-byte; PDF worker MIME remains JavaScript.

Open **Savings & investments → Add investment**. NPS/PPF default to self-funding; EPF to payroll. Enter a reported balance/date, then track own and employer contributions separately. Contribution/withdrawal history does not deduct bank cash or infer a new statement value. Use Update value for full reported balances. Existing investment-account links prevent double-counting; their account balance remains authoritative for net worth. Holdings do not increase simulator spendable cash. See INVESTMENTS.md.

## Database and security

The reviewed additive DDL is applied as `20261121092504_savings_investments.sql`. The repository release bookkeeping renames the original review filename `20261121085750` to this actual assigned hosted version; SQL bytes are unchanged. All seven previous migrations remain intact. No bootstrap, destructive reset or live concurrency fixture harness was run on managed Supabase.

The DDL-free rollback-only investment acceptance passed on the actual project: exact paise, dated valuations, India FY history, cash separation, idempotent retries, stale/range rollback, account-link deduplication and owner/anonymous denial. Generated .invalid Auth users and synthetic financial records rolled back; a follow-up check confirmed none of those disposable users remained. Real owner portfolio rows were not inspected.

Both new tables have RLS and authenticated owner SELECT, while direct INSERT/UPDATE/DELETE and anonymous SELECT are denied. Privileged writes use private owner-checking functions; public wrappers remain invokers. Post-DDL advisors reported no new WARN/ERROR. The existing [leaked-password protection warning](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) remains unchanged because that protection is documented as Pro-only and this project must stay free. Existing private-receipt [no-policy INFO](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), unused-index INFO, and the previously documented loan-document [composite-index INFO](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys) remain separate from actionable findings. No paid upgrade or Auth setting change was made.

## Validation and remaining acceptance

[Quality run 44889045574](https://github.com/Quant-17/personal-finance-pwa/actions/runs/44889045574) passed on the reviewed head: lint/typecheck, 111 Vitest plus two release tests, six demo and nineteen private browser tests, clean builds and release verification, Postgres 17 migration replay, 51 new investment assertions, hosted-compatible smoke on disposable Postgres, and investment/CSV concurrency harnesses. The entire private browser suite also passed locally. A configured private production build passed before publication.

A fresh 390px Chromium check loaded the served v0.3.2-rc.1 shell, activated the service worker, confirmed same-origin static-only caches and no horizontal overflow. The served savings section and EPF/payroll versus PPF/self defaults were checked with intercepted synthetic Auth/API responses, not the owner account. [Synthetic served-UI screenshot](docs/screenshots/investments-served-synthetic.png). No actual portfolio API writes were made.

Physical iPhone Safari/installed-PWA and Windows acceptance remain owner work. Save open edits before Update app, verify v0.3.2-rc.1, then create a holding from an actual statement and review funding/net-worth treatment. No owner balances were seeded. Financial state remains online-only/in memory; no private API caching or new credential storage was added. Investment balances are dated snapshots, not live prices; no tax, statutory-interest or return calculation is inferred.

## Recovery and preservation

Previous private recovery version: `0b770b99-ce3c-4698-9207-608003901603` (v0.3.1-rc.1). Restore only private assets for a frontend regression and retain the additive investment schema, user history and retry receipts. Asset rollback does not reverse financial records or the approved schema migration.

The public synthetic folio Worker remains version `5e0cb7ff-e84b-4095-9d17-cff53db0d267`, deployment `92d02c4b-850d-46ae-81ea-3b51d7ed58a6`, independently checked through Cloudflare. No automatic deployment or paid service was enabled. Temporary asset-upload credential files were removed after deployment; their validity/expiry is controlled by Cloudflare, not by local file deletion.
