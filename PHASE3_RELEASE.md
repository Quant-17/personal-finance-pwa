# Phase 3 · published 21 November 2026 IST

The owner continued after the concrete merge/migrate/private-deploy approval question. PR #6 merged as `0b33b1afd6d6446991ccd20f49464641d5c9dc57`, including the heads of PRs #3/#4/#5; GitHub marked those PRs merged too. Main Quality run [44799336630](https://github.com/Quant-17/personal-finance-pwa/actions/runs/44799336630) passed. No later feature is included.

## Current private app

- URL: https://folio-review.sid-17061999.workers.dev/
- Version: `0.3.0-rc.3`; deployed source: `0b33b1afd6d6446991ccd20f49464641d5c9dc57`.
- Worker version: `58afee9a-fb3d-48d0-a376-0f9af9121bc2`.
- Deployment: `41cbf922-ab23-49e0-a640-559e864575c0`, 100% private-origin traffic.
- Hosted release verification passed; all 18 served asset paths matched the clean configured-private build byte-for-byte. Automatic HTML handling and security headers are preserved.
- A signed-out browser running v0.2.0-rc.1 showed Update app, activated it and rendered v0.3.0-rc.3 with the banner gone. No credentials were entered. Release screenshot: [signed-out app after update](docs/screenshots/phase3-signin.jpg). Physical iPhone/Windows activation and owner feature acceptance are not independently established by that browser check.

The private Buy Simulator now saves/reopens immutable named comparisons with original assumptions or an explicit current-plan switch. Transactions supports the documented UTF-8 CSV format, local validation, duplicate preview and confirmed atomic import. Invalid/duplicate rows are excluded; import retries are idempotent, and batches exceeding supported derived totals roll back completely. Bank-specific column guessing, CSV transfers/loan repayments and forced duplicates remain outside scope. See PHASE3_SETUP.md and CSV_IMPORT.md.

## Applied database state

Supabase assigned actual UTC migration versions during connected-tool application; repository filenames are aligned so a future CLI push will not replay their CREATE statements:

1. `20261120190842_saved_purchase_simulations.sql`
2. `20261120190854_csv_import_preview_and_commit.sql`
3. `20261120191041_cache_saved_simulation_identity.sql`

The first two contain the reviewed additive feature DDL. Post-DDL advisors flagged the saved policies' JWT-extraction form; the third applies the same cached-JWT-object form already used by Phase 2. Ownership predicates, anonymous denial and ACLs are preserved. Performance WARN/ERROR findings then cleared. Original Phase 2 migrations remain intact. Do not run bootstrap.sql or the concurrency harness on managed Supabase.

Access inspection confirmed saved_simulations has RLS and authenticated owner SELECT/INSERT/DELETE, with no UPDATE or anon access. Private CSV receipts have RLS and no client table privileges. Public RPC wrappers are invokers, private entry points are owner-checking definers, and anon cannot execute them. Internal validation/detection helpers have no client execution grants.

`supabase/tests/phase3_hosted_acceptance.sql` is a DDL-free smoke suite run against the actual project. It passed precision/frozen-assumption checks, duplicate preview without posting, atomic import/retry/range rollback, immutable rows, cross-user denial and signed-out RPC denial. Generated .invalid Auth/financial fixtures all rolled back. The assistant did not inspect personal account rows, send email or leave persistent financial fixtures.

## Validation and remaining acceptance

The reviewed combined release passed lint/typecheck, 85 unit tests plus two release regression tests, six demo and thirteen private browser flows, builds/release checks, combined SQL suites and the concurrent-import harness. A new combined flow proves that a CSV expense changes current cash without changing a saved comparison's original assumptions. Hosted smoke, deployed-byte checks and public browser activation provide separate live evidence.

The owner should reopen the installed app, save open work before Update app, verify the v0.3.0-rc.3 footer, and use the existing account. Buy simulator contains Saved comparisons; Transactions contains Import transactions from CSV and an empty template download. Confirm save/reopen and CSV preview on the actual device. Any live financial import requires the owner's own explicit in-app selection/confirmation; no real-file import or automatic deletion is part of this release.

The existing [leaked-password-protection warning](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) remains: Supabase documents it as Pro-only, while the owner requires no paid services. No plan/Auth settings or third-party password checks were changed. Intentional private receipt no-policy INFO and new-index INFO notices are recorded separately from actionable findings.

## Recovery and preservation

The original synthetic folio Worker remains version `5e0cb7ff-e84b-4095-9d17-cff53db0d267`, deployment `92d02c4b-850d-46ae-81ea-3b51d7ed58a6`, verified unchanged through the API. No automatic deployment was enabled.

The previous private recovery version is `ba81d6f6-dd97-42aa-8ad2-78592e4c8c4c` (source 766fa9c). For an app regression restore the private asset version and verify root/headers; retain the additive tables and retry receipts, which older app code ignores. Asset rollback does not undo financial imports. Do not drop tables, purge receipts or delete financial entries as an asset recovery step. Preserve existing origin-scoped sessions and the owner-confirmed Auth callback.
