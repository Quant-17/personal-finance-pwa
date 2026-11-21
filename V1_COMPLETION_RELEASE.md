# V1 completion controls · private release

Published **22 November 2026, 01:30:44 IST** (21 November 20:00:44 UTC) at **https://folio-review.sid-17061999.workers.dev/**.

- Version: `0.3.10-rc.1`.
- Deployed application source: `7080724e4ba15a7cd30aab3fc8da6d3dfd537a19` (merged PR #25).
- PR #24: recipient rules with optional exact amount and settled day-of-month matching; merged `e263cfe7d1734504af3de1991824c22a3bf5f826`.
- PR #25: Data & privacy, full-history export, monthly import readiness and guarded permanent self-account deletion.
- Cloudflare Worker: `folio-review`.
- Worker version: `f8604e03-ae4a-4927-af5d-d70db0527f97`, serving 100%.
- Deployment: `a5f95e41-a142-4e77-b248-1626407ac999`.
- The public synthetic `folio` deployment remains `92d02c4b-850d-46ae-81ea-3b51d7ed58a6`, version `5e0cb7ff-e84b-4095-9d17-cff53db0d267`.

## Included behavior

Rules use structured statement recipients, account, direction and optional exact paise amount/calendar day. They suggest categories, standalone loans, subscription links or exclusions without selecting/posting rows. Save-rule-only teaching does not import a historical sample. EMI principal/interest splits are always reviewed afresh. Selected subscription charges become one normal expense plus an actual Monthly plan deduction date atomically.

Data & privacy offers an owner-only JSON archive of all financial tables, independent of pagination/report cutoff, with recursive exact paise strings and no Auth credentials or PDFs. There is no automatic archive restore. The month-specific checklist flags account/loan baselines and reporting cutoffs; it does not invent starting balances. Permanent self-account deletion requires exact typed confirmation, acknowledgement, a new memory-only password sign-in, recent signed password AMR, an active own session and a confirmed owner. No service-role credential reaches the browser.

No original sample statement transaction was imported. No actual owner account was exported/deleted. Private starter mappings have not been seeded: automatic approval review rejected the account/category/subscription name/ID lookup because it requires explicit permission to expose that metadata to the agent. The owner's latest corrections remain runtime setup requirements and are deliberately absent from source/fixtures. Unclear payees remain unclassified. Opening amounts were not backdated or fabricated.

## Verification

- Lint and strict typecheck passed.
- 172 Vitest tests plus 2 release-verification tests passed.
- 34 private browser tests passed, using intercepted synthetic APIs; 6 demo browser tests passed with one hosted-only check skipped locally.
- Fresh sorted PostgreSQL 17 replay and all existing accounting/owner-isolation suites passed, including all four concurrency harnesses.
- 32 recipient-rule assertions passed on disposable Postgres.
- 40 data-control assertions passed both locally and on hosted Supabase, using newly created synthetic `.invalid` users and rolling back the entire fixture transaction. The tests verified successful self-deletion, cascade cleanup, other-owner preservation and rejection of stale/future/forged password proof, missing/expired sessions and incorrect confirmation.
- GitHub CI passed for PR #24 head `c295bb8`: push `44941301018`, PR `44941306437`; PR #25 head `e5df2cf`: push `44942454966`, PR `44942484986`; deployed merged source `7080724`: main `44942723138`.
- Clean production artifact preflight passed for the exact private Supabase origin.
- All 20 hosted files matched the approved build's SHA-256-prefix hashes and byte counts; JavaScript/PDF-worker MIME checks passed.
- Hosted root, version/source metadata, exact-origin CSP, manifest, service worker and shell verification passed.
- Temporary scoped Cloudflare upload credentials were deleted after publication.

## Schema history

Hosted versions are retained as filenames without reapplying their SQL:

- `20261121193723_remembered_statement_recipients.sql`, SHA-256 `773f664be046be0da31bafd18656eeb1253eeccf3312ba809699a19f17cb461f`.
- `20261121195741_private_data_controls.sql`, SHA-256 `c3b0c72f6acdc5f2ebe86ba8a9445c2862d711fd5cf9ab95cbdb13b19b91c466`.

Hosted migration `20261121200425_cover_financial_owner_foreign_keys.sql` addresses the advisor's three composite-owner FK index findings (statement source markers, structured loan documents and remembered rules). Catalog verification confirmed all three indexes, and the advisor no longer reports uncovered foreign keys. It changes no records, policies or accounting. The already published frontend source stays unchanged by this schema/documentation follow-up.

Security advisors showed no new warnings: four intentional private receipt/source-marker tables have RLS and no browser policies ([advisor](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)), and the existing Auth leaked-password-protection setting remains disabled ([guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)); no paid Auth setting was enabled. Newly created indexes may be reported unused until their access paths are exercised; do not remove FK-covering indexes solely for that informational finding.

## Acceptance still requiring the owner

1. Open the private app and accept its update prompt; verify version `0.3.10-rc.1`.
2. Review Data & privacy for the intended statement month. Supply correct opening figures before importing a full month; do not import the sample PDFs used to teach rules.
3. Save/review starter classifications in-app, or explicitly approve the limited metadata lookup if the agent should configure them. Excluding a PPF/self/card-bill row does not itself record a bank transfer or investment contribution.
4. Verify export/download and the normal monthly workflow on the installed iPhone PWA and Windows browser. Browser emulation is not physical-device acceptance. Do not delete the real account as an acceptance test.

## Rollback

The previous private Worker version is `60b7d234-2c5a-4d1e-a05c-cbf3e46b0a7f` (v0.3.8-rc.1). Reverting the frontend does not restore a user who independently chose deletion. Keep the additive tables/functions/indexes and confirmed records during a frontend rollback. No wider Auth configuration change, email reconnection, OCR, paid API or automatic financial action was included.

See STATEMENT_RULES.md and DATA_PRIVACY.md for feature details and limits.
