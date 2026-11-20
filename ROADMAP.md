# Roadmap

## Phase 1 · merged

Synthetic dashboard, responsive shell/theme, four-way paise-safe purchase simulator, PWA assets/offline shell, docs, unit/browser checks and live Cloudflare demo. PR #1 merged on 19 November 2026.

## Phase 2 · merged and published at the private origin

- [x] Use the existing healthy free Supabase project; apply versioned schema without financial seed data.
- [x] Auth UI: signup/sign-in, confirmation and recovery callbacks; server user verification before data access.
- [x] RLS/grants/composite ownership and transactional accounting RPCs, including retry protection.
- [x] 101 database isolation/accounting assertions plus hosted rolled-back acceptance test.
- [x] Accounts/categories, income/expense editing, paginated ledger, atomic transfers and account archiving.
- [x] Budgets, savings earmarks, existing-loan tracking/repayments/estimated schedules and subscription forecasts.
- [x] Actual dashboard plus a private-plan purchase simulator; no synthetic data in private views.
- [x] Offline/background lock, sign-out clearing, exact-origin CSP and build-time configuration validation.
- [x] Owner supplied the exact private/local redirect allowlist and confirmed saving Site URL to the private origin (20 November 2026).
- [x] Owner reported successful account creation/confirmation, verified sign-in to Overview, and password reset followed by sign-in (19 November 2026).
- [x] User-approved isolated `folio-review` acceptance preview deployed; hosted mode/source/CSP/PWA checks passed.
- [x] Owner confirmed working confirmation/reset flows on the HTTPS review preview; raw dashboard configuration was not independently inspected.
- [x] Owner reported disposable cash-account income/expense entry and refresh persistence working; cleanup instructions supplied.
- [x] Owner reported the requested installed-PWA and Windows offline lock/reconnect checks working (device/browser versions not captured).
- [x] Controlled review update to v0.2.0-rc.1; cloud browser waiting-worker banner and activation verified.
- [x] Owner confirmed the requested installed-app v0.2.0-rc.1 update and return to Overview; device/browser versions were not captured.
- [x] Owner confirmed disposable income/expense removal, zero Test Wallet balance and archiving.

Phase 2 is merged into main and published at the existing private `folio-review` origin from source `766fa9c`. Main CI, hosted release checks and exact asset comparisons passed. Owner acceptance and Auth URL configuration are recorded separately from independent checks. The original public `folio` URL continues serving the Phase 1 synthetic demo. See PHASE2_SETUP.md for current release IDs.

## Phase 3 · combined release review

Saved comparisons and canonical CSV import are integrated from PRs #4 and #5, with the completed Phase 2 release documentation from PR #3. This branch preserves immutable assumption snapshots, explicit current-plan switching, local CSV validation, duplicate preview and atomic retry-safe posting. Combined tests include both SQL suites and the concurrent-import harness. Hosted migrations and publication remain pending the release decision. See PHASE3_RELEASE.md.

## Later

Broader bank-format column mapping, forecast automation, export/deletion UI, immutable audit history, optional reminders, broader accessibility/device audit. No paid APIs or bank integrations. Private offline editing needs a separate encryption, device trust and conflict-resolution design.
