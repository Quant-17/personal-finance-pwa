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
- [ ] Verify final Supabase Auth Site URL/redirect allowlist in the dashboard (email confirmations are already enabled).
- [ ] Owner completes actual confirmation and password-reset email round trips; default email sender restrictions may apply.
- [ ] Publish a reviewed private build to a deliberately selected Cloudflare origin; verify its CSP and auth redirects.
- [ ] Physical iPhone installed PWA and Windows browser acceptance, including update and offline lock.

The Phase 2 implementation is reviewable; production/private-data acceptance is not complete until those remaining release gates pass. The existing public URL continues serving the Phase 1 demo.

## Later

Saved simulations, CSV preview/import/deduplication, forecast automation, export/deletion UI, immutable audit history, optional reminders, broader accessibility/device audit. No paid APIs or bank integrations. Private offline editing needs a separate encryption, device trust and conflict-resolution design.
