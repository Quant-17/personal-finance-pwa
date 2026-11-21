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

## Phase 3 · published, owner device acceptance pending

Saved comparisons and canonical CSV import are integrated from PRs #4 and #5, with the completed Phase 2 release documentation from PR #3. This branch preserves immutable assumption snapshots, explicit current-plan switching, local CSV validation, duplicate preview and atomic retry-safe posting. Combined tests include both SQL suites and the concurrent-import harness. The approved migrations are applied and the combined app is published as v0.3.0-rc.3. Hosted rolled-back acceptance, exact asset checks and browser update activation passed; physical-device feature acceptance remains owner work. See PHASE3_RELEASE.md.

## Before Stage 4 · loan-document review published

The owner requested this slice before Stage 4. Implemented local digital-PDF extraction for CRED/Credit Saison, Kotak card EMI and L&T, editable terms and repayment rows with page references, explicitly confirmed paid-through suggestions, quoted EMI versus estimates, dated current-balance updates, owner-only structured persistence, retry/revision/duplicate guards and linked-card liability treatment. No original documents or owner financial figures are fixtures. See LOAN_DOCUMENT_IMPORT.md for limits and review/release gates. The owner explicitly approved PR #8 merge, hosted migration and private publication on 21 November 2026 IST. The release is live; owner device acceptance remains pending. Stage 4 is not started. See LOAN_DOCUMENT_RELEASE.md.

## Owner-requested savings & investments · published

NPS Tier I/Tier II, PPF, EPF/EPFO and other manual holdings; separate own/employer/payroll history, dated statement valuations, India FY totals, allocation view, editable/paginated history and archive support. Investment values contribute to net worth without becoming available cash; existing investment-account links prevent double-counting. Contributions do not automatically post bank transactions or adjust a statement value. See INVESTMENTS.md. The owner explicitly approved PR #10 merge, migration and private publication. v0.3.2-rc.1 is live; actual-device acceptance remains pending. See INVESTMENTS_RELEASE.md. This narrow owner-requested slice does not start broader Stage 4 work.

## Gmail retired; monthly PDF statements · in review

The owner explicitly cancelled Gmail/Google integration and requested monthly PDFs for Kotak Mahindra and SBI. The live endpoint now returns 410, the removal migration deletes OAuth state/credentials/email metadata/RPCs and any named schedule/Vault entries, and the frontend was restored to the pre-email finance release. Settled accounting and subscriptions are retained. The original SQL remains in migration history.

The replacement implements local readable-PDF extraction, optional local passwords, editable transaction/date/amount/type/category review, selected-row duplicate preview and atomic retry-safe batch posting. Source hashes/row markers protect against reimport after classification edits. Summary/budget calculations use normal settled transactions; subscription forecasts stay inside the existing living budget. No mailbox access, paid service, AI API or OCR. Actual issuer templates need owner acceptance; unsupported/scanned layouts fail safely rather than claiming complete extraction. The owner approved PR #14, its new migration and v0.3.4-rc.1 deployment, and supplied both statement styles for private analysis. Dedicated SBI post-date/multiline and Kotak numbered-row/right-alignment adapters are validated before publishing. See STATEMENT_IMPORT.md. Broader Stage 4 stays paused.

## Later

Broader bank-format column mapping, forecast automation, export/deletion UI, immutable audit history, optional reminders, broader accessibility/device audit. No paid APIs or bank integrations. Private offline editing needs a separate encryption, device trust and conflict-resolution design.
