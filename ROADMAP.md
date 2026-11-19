# Roadmap

## Phase 1 · implemented, separate review

Synthetic dashboard, responsive shell/theme, four-way paise-safe purchase simulator, PWA assets/offline shell, docs, unit/browser checks and live Cloudflare demo. PR #1 remains separate from Phase 2.

## Phase 2 · current review branch

- [x] Use the existing healthy free Supabase project; apply versioned schema without financial seed data.
- [x] Auth UI: signup/sign-in, confirmation and recovery callbacks; server user verification before data access.
- [x] RLS/grants/composite ownership and transactional accounting RPCs, including retry protection.
- [x] 101 database isolation/accounting assertions plus hosted rolled-back acceptance test.
- [x] Accounts/categories, income/expense editing, paginated ledger, atomic transfers and account archiving.
- [x] Budgets, savings earmarks, existing-loan tracking/repayments/estimated schedules and subscription forecasts.
- [x] Actual dashboard plus a private-plan purchase simulator; no synthetic data in private views.
- [x] Offline/background lock, sign-out clearing, exact-origin CSP and build-time configuration validation.
- [ ] Review final production Supabase Auth Site URL/redirect allowlist before promotion; effective review callbacks passed owner acceptance.
- [x] Owner reported successful account creation/confirmation, verified sign-in to Overview, and password reset followed by sign-in (19 November 2026).
- [x] User-approved isolated `folio-review` acceptance preview deployed; hosted mode/source/CSP/PWA checks passed.
- [x] Owner confirmed working confirmation/reset flows on the HTTPS review preview; raw dashboard configuration was not independently inspected.
- [x] Owner reported disposable cash-account income/expense entry and refresh persistence working; cleanup instructions supplied.
- [x] Owner reported the requested installed-PWA and Windows offline lock/reconnect checks working (device/browser versions not captured).
- [x] Controlled review update to v0.2.0-rc.1; cloud browser waiting-worker banner and activation verified.
- [ ] Confirm v0.2.0-rc.1 activation and session preservation on installed iPhone/Windows devices.

Phase 2 core functional acceptance is complete based on automated checks and owner reports; the PR is ready for code review. Production promotion still requires final Auth URL review, removal of disposable test entries and the controlled app-update check. The existing public URL continues serving the Phase 1 demo. A separate user-approved `folio-review` URL serves the Phase 2 acceptance build.

## Later

Saved simulations, CSV preview/import/deduplication, forecast automation, export/deletion UI, immutable audit history, optional reminders, broader accessibility/device audit. No paid APIs or bank integrations. Private offline editing needs a separate encryption, device trust and conflict-resolution design.
