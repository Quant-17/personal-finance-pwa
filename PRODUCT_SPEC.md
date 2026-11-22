# Folio · Product specification

A private personal finance PWA for an individual in India, for iPhone Safari (including installation) and Windows browsers. Premium, calm UI; INR/en-IN formatting, Asia/Kolkata accounting dates; no paid APIs.

## Phase 1 demo

Synthetic November 2026 dashboard and read-only account, budget, goal and transaction examples; CSV example export, appearance, navigation, purchase comparisons, static PWA shell. The public demo remains separate from private mode. Its sample ledger is intentionally incomplete and is never used in private reports.

## Phase 2 workspace

A new signed-in user starts with zero values, an empty financial ledger and default category names. Require a server-verified, confirmed, non-anonymous Supabase Auth session. Provide signup, confirmation callback, password reset/update and device sign-out.

Show actual net worth, available liquid cash, current India-month income/outflow and six-month cash flow. Support named bank/savings/cash/investment/credit-card accounts with signed opening balances/dates, edit and archive. Provide personal categories, positive rupee income/expense entry, immutable account selection when editing an entry, date validation, 50-row ledger pagination and deletion. Transfers post both legs atomically; card repayments are transfers, avoiding duplicate expense recognition.

Track existing loans with principal, APR, remaining term, estimated schedule and status. Actual manual repayments split principal/interest; cash and remaining debt update once. Subscription forecasts can be edited/paused and never automatically post expenses. Current-month category budgets derive actual expense spend. Savings goals earmark existing cash and can be released; they do not create assets. Profile plans separate expected income/living/reserve from actual transactions. Living costs include subscriptions; active loan EMI is separate.

The Buy Decision Simulator compares cash, EMI, delayed purchase and no purchase using the user's plan and available cash after earmarks. Drafts stay in memory. Changing assumptions never posts a financial record. Four scenarios remain visible; reserve and monthly shortfall warnings explain trade-offs.

## Financial conventions

All money boundaries use integer paise or decimal-safe parsing/calculation. Purchase principal ₹0.01–₹1 crore, APR 0–60%, 1–120 whole months. Monthly reducing-balance EMI rounds interest half-up to paise and clears residual in the last payment; totals sum actual modeled payments. Loan schedules exclude lender-specific day counts, fees/GST, insurance, price inflation and returns. Estimates are illustrations, not advice or lender quotes.

## Privacy and offline experience

No bank credentials, full card numbers, real financial fixtures, analytics or external fonts. Use only a public publishable Supabase client key; RLS is authoritative. Financial API responses never enter HTTP/runtime/service-worker caches. React memory holds financial views; offline/backgrounding unmounts them and verifies the session on return. Supabase stores the auth session on-device until local sign-out; appearance alone is other persisted UI state. The shell can load offline but private mode stays locked. Update controls reload and discard unsaved edits. No offline financial editing.

## Acceptance and limits

Lint, strict typecheck, money/schedule tests, real-Postgres ownership/accounting tests, demo/private browser flows and production builds must pass. Test responsive 390px layout, offline privacy, confirmed-user guard, sign-out and private simulator assumptions. Before private publication, configure exact Auth redirects, complete real owner confirmation/recovery, inspect hosted CSP and verify actual iPhone/Windows installation. These manual release gates remain pending.

Broader bank feeds, multi-currency, push reminders, dedicated refund matching, audit history, personal-data export/deletion UI and automatic loan posting are outside this release.

## Before Stage 4 · reviewed loan documents

Locally read digital CRED/Credit Saison, Kotak card EMI and L&T documents, review/edit whitelisted terms and schedule rows with source pages, then explicitly confirm before saving to a new or existing loan. Retain quoted EMI separately from calculated estimates and nominal interest separately from disclosed APR. Require a dated current balance or an explicitly confirmed payment-history suggestion. Missing/rounded lender tables stay clearly estimated, and estimated first dates require owner confirmation. Permit later manual corrections without the original PDF. Linked card plans avoid counting the same principal twice. Preserve posted payments and never synthesize bank history. No original PDF archive, OCR, paid API, automatic payment detection or Stage 4 work is included. See LOAN_DOCUMENT_IMPORT.md for current release status.

## Savings & investments

Add a dedicated private navigation section for NPS Tier I/Tier II, PPF, EPF/EPFO and other manually valued investments. Provide reported value/date, provider, descriptive funding source, optional lock-in/access date, allocation and India financial-year contribution cards. Default NPS/PPF to self-funding and EPF to payroll; separate own and employer history. Permit corrections, withdrawals, statement updates, paginated history and archive/reopen. History-only contributions do not post cash or infer market value; statement valuations update net worth. Link an existing investment-type account to avoid duplicate assets, exclude holdings from spendable cash, and preserve archived value. No account identifiers, statutory rates, live prices, automated payroll, bank postings, return/tax calculations or provider credentials are needed. See INVESTMENTS.md; the owner-approved v0.3.2-rc.1 feature is published at the private origin; physical-device acceptance remains pending.

## Monthly PDF statement review · published

Replace email integration with a once-per-month local PDF upload for Kotak Mahindra and SBI bank/card statements. Keep manual expenses and all existing ledger functions. Read common text-table layouts, support a locally supplied PDF password, show source-page references and editable date/description/amount/type/category fields. Do not retain raw documents/passwords or send them to any service. Explicitly identify unsupported/scanned layouts; no OCR or paid services.

The owner verifies selected rows/totals against the original document, checks duplicates and confirms one atomic batch. Treat credits, refunds, transfers, card repayments and EMIs as needing classification/dedicated accounting rather than silently calling them ordinary income/expenses. Persist stable source markers and retry hashes to prevent duplicate monthly reimports. Settled entries flow into actual dashboard/monthly/category-budget totals. Planned living costs continue to include subscription forecasts once; saved assumptions stay immutable. The email integration is retired on the live backend/UI; owner-approved statement posting and v0.3.4-rc.1 are published; real in-app import/physical-device acceptance remains owner work (STATEMENT_RELEASE.md). See STATEMENT_IMPORT.md.

Adaptive debt repayment planning compares monthly strategies against current tracked balances and the saved monthly plan, optionally using cash above reserve/earmarks. It recalculates as Folio data changes, exposes lender assumptions, and never executes financial actions. See DEBT_REPAYMENT_SIMULATOR.md.

## V1 data controls

Provide Data & privacy navigation with a full-history private JSON download, clear export limits and no automatic-restore claim. Show a month-specific account/loan baseline and reporting-cutoff checklist without changing dates or balances. Permit deliberate permanent self-account deletion only after an exact typed phrase, acknowledgement and current-password confirmation; verify recent password AMR, active session and confirmed owner server-side. Never delete the actual owner in development or acceptance tests. Existing physical-device and first-month reconciliation acceptance remains owner work. See DATA_PRIVACY.md.

## Owner-requested finance workflows

Add reconciled monthly reports, reviewed paired statement transfers, an interactive 90-day cash forecast, saved lender fee/promotion assumptions, complete-history investment return estimates, safe empty-workspace backup restore and owner-readable immutable change history. These preserve explicit owner confirmation for financial writes; forecasted payments are never actual payments. See FINANCE_WORKFLOWS.md for calculation assumptions and supported limits.

## Compact navigation

The authenticated app opens/reopens on Overview with a closed Sections menu. The menu lists sections vertically, scrolls on shorter screens and closes after selection, Escape or an outside click. The selected page uses the full available width. Appearance and sign-out stay accessible in the compact header; financial data and auth/recovery behavior are unchanged.

## iPhone-first presentation

Use the iPhone benchmark and acceptance criteria in IOS_DESIGN.md: a clear cash/net-worth hierarchy, grouped actual monthly totals, safe-area-aware navigation, bottom quick actions, accessible light/dark colors, scalable type and keyboard-aware form sheets. Keep exact paise, all existing financial workflows and the Overview-first Sections navigation. The public demo remains independent.
