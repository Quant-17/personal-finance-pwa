# Finance workflows

The owner requested all seven recommended additions on 22 November 2026 IST. This update extends the authenticated workspace; it does not import the supplied statement templates or modify existing balances.

## Monthly review and reconciliation

Open **Monthly review**, select a completed month and compare each full statement against the account ledger. Enter signed statement opening and closing balances (card debt is negative). Both must match exactly to the paise, the account baseline must cover the month, and the owner must confirm a row-by-row review. This stores reconciliation metadata, never a balance adjustment. Missing opening figures must be supplied by the owner in Accounts.

The report includes all dated month activity, independent of the dashboard cutoff: income, ordinary expenses, loan principal/interest, investment contributions and category budget comparisons. Transfers are neutral. Subscription charges remain part of expenses. Reconcile every listed account, then separately mark the month reviewed. Hashes cover the relevant rows and baselines; later edits make the review stale. Reviewing does not prevent corrections. Partial months can be inspected but not closed.

## Statement transfers and card payments

In **Transactions → Match transfers and card repayments from statements**, select source/destination accounts and locally read their PDFs. Candidates require an explicit debit and credit, exact amount and settlement dates within three days. Refunds, reversals and unclear directions are excluded. Similar amounts alone never authorize posting.

Review both descriptions, dates and accounts, check duplicates, then confirm. Select a matching existing transfer when present; otherwise record two balanced transfer legs with their separate settlement dates. Source markers protect both PDF rows against another import, and request IDs protect interrupted retries. A row previously imported as an expense must first be corrected through the ledger; this flow refuses to silently recategorize it. Card payments reduce bank cash and card debt, rather than becoming another expense. Single-leg/unreadable statements still need manual review. No OCR, Gmail or external document service is added.

## 90-day cash-flow forecast

Open **Cash-flow forecast**. Save salary day/account, living-cost funding account and each standalone loan's funding account. Active subscriptions and loans need deduction dates. Actual saved balances start day zero; only later dates are projected. The chart and day slider show expected balances, individual account shortages and cash above emergency/goal reserves.

Saved planned income, bills or transfers can repeat monthly/yearly. Mark an ordinary expense as inside the living budget to avoid allocating the same cash twice. Source accounts must be active cash/bank/savings accounts. Card purchases and card-linked EMI principal are not additional cash deductions; enter the expected bank-to-card payment separately. There is a limit of 100 planned events.

Forecasts use saved income/budget, scheduled bills, recorded current-month non-subscription spending and quoted EMIs with approximate monthly reducing interest. Everyday spending is spread in exact paise across remaining days; annual/weekly subscription equivalents are subtracted from the living allocation while actual due dates use their full charge. No scheduled entry posts money, bank connection or background payment exists. Refresh actual balances after importing transactions. Unexpected spending, contract-specific loan treatment and variable salary can change outcomes.

## Debt terms

In **Debt repayment simulator → Debt balances and prepayment assumptions**, enter prepayment percentage, fixed accelerated settlement charge, tax on fees and optional promotional APR/expiry. Save fee/promotion terms per debt; scenario APR/minimum overrides remain temporary. Percentage charges apply to extra principal; fixed charges apply once an accelerated debt closes, including closure in a later month. Fees and tax consume the cash budget. Normal scheduled repayment does not incur accelerated closure fees.

Promotional APR applies only to complete model months ending by expiry. A partial expiry month conservatively uses the normal rate. Lock-ins, reducing/flat-rate differences, eligibility and lender quotes still require review. Simulations never record repayments.

## Investment returns

Use **Savings & investments → Investment returns** on a holding. Full dated history is loaded (up to 10,000 rows), independently of a paginated screen. Either use the earliest statement value as opening capital or calculate from contributions. Confirm complete contributions/withdrawals for the period first. Employer contributions count as capital, not market gains.

Values are end-of-day snapshots; opening-date flows are already included in opening capital. Flows through the final value date are included, later flows are flagged and excluded. Growth/loss is closing value plus withdrawals minus opening and contributions. Annualised XIRR uses actual days/365 and numerical root solving; ambiguous cash flows with multiple sign changes do not show a single rate. Missing/incomplete history cannot establish actual performance. No live price feeds or statutory interest are invented.

## Export, restore and history

**Data & privacy** exports version-two JSON: the 21 explicit financial/history tables plus statement duplicate markers. Money fields are exact integer strings. Auth credentials, sessions, PDFs and passwords are excluded. Version-one exports remain readable, with a warning that source duplicate markers are unavailable.

Restore supports a maximum 20 MiB archive and 20,000 financial/history rows. It requires a separate empty financial workspace, replaces only its default profile/categories/settings, remaps every identifier/reference and validates ownership, schema, constraints, dates and accounting. Preview executes the complete restore in a rolled-back subtransaction. Confirmation requires the preview hash, ownership acknowledgement and exact phrase. Restore commits atomically, retries once per request and refuses to merge or overwrite an existing workspace. Archived reconciliations become stale; imported audit records are labelled unverified. Do not delete a current account as a restore workaround.

The owner-readable change history is populated by database triggers from deployment onward. Browser clients cannot modify/delete audit records. Before/after values, operation, entity and database time are recorded; no previous history or human attribution is fabricated. Imported history is distinguished from server-recorded events. This is application-level immutable history, not protection against a database administrator. Account deletion still removes all owned financial records/history through the existing guarded flow.

## Development and deployment

Apply `supabase/migrations/20261122102230_finance_workflows.sql` after all preceding migrations and before publishing this frontend. Applied migrations remain immutable. No new environment variables, services, paid APIs or secrets are needed. Use existing public Supabase URL/anon key configuration described in `.env.example` and PHASE2_SETUP.md. Never use a service-role key in Vite.

Preview with `npm ci`, existing private `.env.local` configuration and `npm run dev`. Demo mode remains separate. Run lint, typecheck, unit tests, private browser tests and production build; replay migrations and SQL acceptance against disposable PostgreSQL. Never run the test bootstrap on hosted Supabase. The CI database job includes the new workflow suite. All fixtures are synthetic; actual monthly statement acceptance and actual iPhone/Windows device checks remain owner tasks.

## Verification record

Local verification: lint and TypeScript checks passed; 187 Vitest tests and two release-verification tests passed. Private Chromium checks passed all 40 flows in the full run plus the additional lender-term-save flow separately (41 distinct tests now in CI). Six demo browser checks passed; its optional hosted-response check was skipped locally. Fresh PostgreSQL 17 replay passed the complete accounting/isolation suites, including 49 new workflow assertions and five concurrency suites. Demo and private production builds succeeded. Build tooling reports existing bundle-size and upstream comment-annotation warnings; these are not test failures. Browser emulation is not physical-device acceptance.

Deployment status: PR #27 is merged and private v0.4.0-rc.1 is live. Hosted migrations 20261122102230 and 20261122102340 are applied; the original workflow migration was renamed byte-for-byte to its managed version. All 49 hosted workflow assertions rolled back successfully; exact checks of all 20 deployed assets and hosted security/PWA preflight passed. The public demo is unchanged. See FINANCE_WORKFLOWS_RELEASE.md.
