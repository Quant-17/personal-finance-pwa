# Folio Business workspace handoff

Prepared 25 November 2026, Asia/Kolkata. This document carries project context into a new ChatGPT Business workspace. Repository history, deployed build metadata and managed migration history are the authoritative technical records. Recheck them before changing a release.

## Start here

Repository: https://github.com/Quant-17/personal-finance-pwa

Private app: https://folio-review.sid-17061999.workers.dev/

Public synthetic demo: https://folio.sid-17061999.workers.dev/

The latest completed work is the iPhone monthly-routine update in merged PR #35. The current request is to prepare this handoff. There is no pending owner instruction to implement another feature.

Read AGENTS.md, this document, PRODUCT_SPEC.md, ARCHITECTURE.md and DATA_MODEL.md first. Consult the feature-specific documents listed below for the area being changed. Several older release documents and README/ROADMAP sections describe historical states. The current release table below supersedes those historical version claims.

## Continuing in Business

1. Open a new project/conversation in the intended Business workspace and upload this document plus BUSINESS_STARTER_PROMPT.md, or use their copies in GitHub.
2. Connect GitHub and grant repository access to Quant-17/personal-finance-pwa in that workspace. Where Codex repository access is offered, select this repository and main as the starting branch.
3. Connect Supabase and Cloudflare in that workspace when database or deployment work is needed. Access granted in the previous workspace should be verified separately. Workspace administrators may control connector availability.
4. Continue using the existing Supabase project, Cloudflare account and Workers listed below. A new chat does not require new financial infrastructure or a new Folio user account.
5. For local private development, create an ignored .env.local using .env.example and the existing project's public client configuration through the normal local configuration workflow. The repository's synthetic demo works without Supabase configuration.
6. Paste BUSINESS_STARTER_PROMPT.md and then describe the next feature or issue.

The handoff contains no credentials, raw statements, financial exports or personal account records. Supabase/Cloudflare identifiers below are resource references. Obtain any required credentials through the appropriate connection/configuration flow. Uploaded PDFs and this chat's tool sessions are not part of a fresh repository checkout. If a future task needs a source PDF, the owner can supply it in the new workspace.

This preparation does not move the current conversation, connector authorizations or live financial data between ChatGPT workspaces. The existing deployed app continues using the same backend.

## Verified release baseline

Verified from hosted folio-build.json and Cloudflare deployment metadata during handoff preparation.

| Item | Current value |
| --- | --- |
| App version | 0.7.0-rc.1 |
| Mode | private |
| Approved app source | 70658637c06aa2825b7cfdde9b0d6a0254cad86e |
| Main application merge | 09621e86a6a0dd285622945c6a702e87f63b539f |
| Feature PR | https://github.com/Quant-17/personal-finance-pwa/pull/35 |
| Cloudflare account | ad2c2562e2024766f9cb489d6eb8260c |
| Private Worker | folio-review |
| Private Worker version | 49b8b583-baa9-4a5e-a969-19b61e693c14 at 100% |
| Private deployment | 73c5bd30-830f-48d7-9abd-c1d23a1aea76 |
| Published | 24 November 2026, 22:10:36 IST |
| Public demo Worker | folio |
| Public demo version | 5e0cb7ff-e84b-4095-9d17-cff53db0d267 |
| Public demo deployment | 92d02c4b-850d-46ae-81ea-3b51d7ed58a6 |
| Supabase project | bjswwsciiuryfflxnflw |
| Supabase origin | https://bjswwsciiuryfflxnflw.supabase.co |

The approved app source differs from the merge commit because the tested production artifact was built from the feature head before merging. A documentation-only handoff merge can advance main further without changing the deployed app version.

The private app is currently deployed through Workers Static Assets. Earlier project plans mention Cloudflare Pages. Preserve the actual deployed Worker configuration when maintaining it.

## Product and owner preferences

Folio is a private personal-finance PWA for iPhone Safari installed to the Home Screen and Windows browsers. It uses INR, Indian digit grouping and Asia/Kolkata dates. The project uses free services and APIs.

Keep the full transaction ledger. The owner changed an earlier request to remove it and explicitly wants monthly expenses such as rent, food and commute.

The owner rejected Gmail/Google receipt integration and chose monthly PDF statement upload from SBI and Kotak. Historical email-related migrations remain in the repository, followed by removal migrations. Do not recreate the email integration from historical files.

Open on Overview, including after returning from background. Keep the closed vertical Sections dropdown. The owner requested this navigation pattern. The iPhone presentation uses system typography, safe-area spacing, large tap targets, accessible light/dark appearance and keyboard-aware editor sheets.

The latest UI work adds segmented view buttons where the user switches context. Preserve meaningful labels, pressed states, keyboard operation, zoom and text resizing.

Financial names, contribution amounts, EMI amounts, first-payment dates and deduction schedules belong in private runtime records. This handoff deliberately omits the owner's private financial figures. The app's saved records and the owner's review are the source for future tasks.

## Completed capabilities

- Supabase signup/sign-in, email confirmation and password recovery using PKCE, with verified-user checks before private data loads.
- Accounts, credit cards, categories, income/expense editing, atomic transfers, account archiving, transaction pagination and linked loan repayments.
- Category budgets, savings goals/earmarks, monthly income/living-cost/reserve assumptions, dashboard cash flow and net worth.
- Loans, actual principal/interest payments, quoted or estimated EMIs, reviewed document extraction, reported on-time instalment progress and payment charts.
- Subscriptions with amounts, cadences, schedules, pause/resume, monthly equivalents and optional manual monthly payment windows.
- NPS, PPF, EPF and other investment holdings, contributions/withdrawals, manual valuations, growth history and XIRR with completeness checks. Self-funded and payroll contributions have distinct accounting behavior.
- Local PDF statement extraction, review, duplicate checking and retry-safe import. Remembered recipient/category/loan/subscription rules support optional exact amounts and deduction days. EMI splits remain reviewed inputs.
- Paired transfer/card-bill matching, account statement reconciliation and monthly review with stale-review detection.
- Ninety-day cash forecast with funding accounts, planned events and reserve/earmark protection.
- Buy simulator comparing cash, EMI, delayed purchase and no purchase, with saved comparisons and a financial summary.
- Debt repayment simulator comparing minimum-only, highest-interest-first and smallest-balance-first strategies. It uses current finances, optional spare-cash payments, lender fees/promotional terms and reserve constraints.
- History-preserving loan/subscription removal with automatic current-finance/simulation refresh, linked-rule disabling, atomic optional subscription budget adjustment and retry protection.
- Financial export, validated restore into an empty workspace, immutable audit history and account deletion controls.
- Static PWA shell caching, app icons/manifest, update prompt, offline/background lock and sign-out clearing.

## Latest iPhone monthly-routine update

PR #35 is merged and published. It adds the following behavior.

- PDF review uses mobile cards, All rows / Needs attention / Remembered views, progress counts, statement/account/date context and an optional same-account/date/amount ledger comparison.
- Successful imports save a session-scoped account/month navigation checkpoint. Overview can show Continue reconciliation, and Monthly review opens with that account/month.
- Overview shows a next action and a per-account balance-date disclosure.
- Payment agenda has Next 7 days / This month / Recorded views. Manual monthly subscription windows use a first day and a deadline. Fixed-date plans retain a null window field.
- Account and budget actions open filtered Transactions. Monthly plan exposes category remainders. Quick entry puts amount first and offers recent account/category choices.
- Loans/subscriptions use expandable Manage controls. Investment contributions are expandable and valuations have explicit dates.
- Forecast has a shortcut to inspect its lowest projected cash day. Buy option cards choose payment method directly, with assumptions behind a disclosure. Debt summaries show the first modelled extra-payment target.

## Accounting and privacy rules to preserve

- Use integer paise or decimal-safe arithmetic. Keep exact balances and paise in calculations.
- Posted ledger entries determine actual money movements. Expected deduction dates, reported paid-through dates, forecasts and simulations never post money by themselves.
- Loan outstanding principal derives from its saved principal and recorded principal repayments. Reported on-time instalment progress is separate. Never infer that all debt is cleared because payments were reported on time.
- A normal Close tracking action stops scheduled EMI planning but leaves outstanding debt visible to the debt simulator. Removal explicitly excludes the tracked liability from current calculations and retains history.
- Removing a linked card EMI preserves its card account balance. The remaining card debt may require revolving APR/minimum inputs in the debt simulator.
- Subscription costs are already included in the living budget. Avoid counting them twice. Deletion offers an optional monthly-equivalent budget reduction, capped at the current budget. Paused subscriptions release no extra budget.
- Transfers and card-bill payments must not become ordinary expenses. Linked card EMI principal must not be counted twice in net worth or debt simulations.
- Saved purchase comparisons freeze their original financial context. Fresh comparisons use current finances. Recalculation of a saved comparison is an explicit current-plan action.
- Never fabricate opening balances, loan baselines, repayment splits, missing rates or transaction history. The owner clarified that December-start tracking means reviewing November statements. Reporting cutoff and account/loan opening dates have separate purposes.
- Owner-supplied sample statements were layout/rule templates. Do not import those sample rows as real ledger activity.
- Keep confirmed-owner RLS, ownership-preserving foreign keys, private privileged functions, row locking, stale-preview checks and idempotency protections.
- Never hardcode credentials or expose secret/service-role keys in client code. VITE_* configuration is public browser configuration.
- Raw PDFs and PDF passwords remain on the device, outside logs/source/storage uploads. Private API/auth responses are not cached by the service worker. Financial views remain in memory and unmount on lock/sign-out.
- Checkpoint sessionStorage contains only navigation account/month identifiers scoped to the user. It is not a financial draft backup. Follow the existing auth storage policy and do not add broad financial caching.
- Develop and test with synthetic records, disposable users or rolled-back transactions. Never delete, restore, export or seed the real owner's workspace as a release test.

## Known limits and acceptance work

1. Physical iPhone acceptance of the latest update remains pending. WebKit with an iPhone viewport is automated browser coverage. Earlier owner reports cover older releases.
2. PDF support is readable-text extraction with tested SBI/Kotak layout adapters. OCR/scanned PDFs and all possible issuer formats are not guaranteed.
3. Reopening after a completed import can resume reconciliation. Unconfirmed PDF row edits do not survive app eviction and need the PDF reselected.
4. Ledger comparison searches the same account/date/signed amount and shows up to ten candidates. It requires review. It is not fuzzy merchant/date matching or automatic linking.
5. Overview's next action uses the current checkpoint or upcoming schedules. It does not independently prove that every monthly review is complete.
6. Balance-date disclosure shows the last saved reconciliation month or opening date. Later edits can make reconciliation stale. Do not present that label as a live bank verification or an all-accounts current balance timestamp.
7. Recent transaction shortcuts derive from the currently loaded ledger page/filter. Manage controls are expandable disclosures, while editors retain their existing sheets.
8. Missing funding accounts or debt terms can limit forecasts/simulations. Surface the missing input and preserve affordability checks.
9. During PR #35 development, one earlier full local browser run hit a restore-context teardown timeout. The focused final rerun and both final GitHub runs passed.
10. Older security review reported six intentional private-table RLS-with-no-policy INFO findings and an existing Auth leaked-password-protection warning. Recheck current advisors if doing security/database work. Avoid changing paid Auth settings as an incidental task.

An appropriate next step, if requested by the owner, is physical-iPhone acceptance of statement upload, windowed payments, foreground locking, keyboard behavior and reconciliation continuation, followed by fixes to any observed issues.

## Repository map

| Area | Main files |
| --- | --- |
| Private shell, navigation, Overview | src/private/PrivateApp.tsx |
| iPhone design | src/private/ios.css, src/private/private.css, IOS_DESIGN.md |
| Workspace loading and filtered ledger | src/private/workspace.ts |
| Common editor | src/private/Editor.tsx |
| Buy simulator and saved contexts | src/components/Simulator.tsx, src/private/SavedSimulations.tsx, src/private/simulations.ts |
| Debt simulator and model | src/private/DebtSimulator.tsx, src/private/debtPlan.ts |
| Statements, layout/rules, comparison | src/private/StatementImport.tsx, statements.ts, statementLayouts.ts, statementRules.ts, StatementMatches.tsx |
| Reconciliation and reviews | src/private/MonthlyReview.tsx, workflowSchemas.ts |
| Payments | src/private/PaymentAgenda.tsx, RecurringDeductions.tsx, recurring.ts, monthlyPlan.ts |
| Investments | src/private/Investments.tsx, investments.ts, InvestmentPerformance.tsx |
| Forecast | src/private/CashForecast.tsx, forecast.ts |
| Privacy and restore | src/private/dataPrivacy.ts, DataControls.tsx, ArchiveRestore.tsx |
| Schema and regression checks | supabase/migrations, supabase/tests, tests/private/workspace.spec.ts |
| Release verification | scripts/verify-release.mjs, tests/release-verification.test.mjs |
| CI | .github/workflows/ci.yml |

Documents worth consulting include COMMITMENT_REMOVAL.md, STATEMENT_IMPORT.md, STATEMENT_RULES.md, LOAN_PROGRESS.md, DEBT_REPAYMENT_SIMULATOR.md, FINANCE_WORKFLOWS.md, DATA_PRIVACY.md and PHASE2_SETUP.md.

## Build and validation

Use Node 24 and the committed npm lockfile.

```sh
npm ci
npm run lint
npm run typecheck
npm test
npm run build:demo
npx playwright install --with-deps chromium webkit
npx playwright test
npm run build:private-test
npm run test:private
npm run test:ios
npm run build
npm run verify:release -- dist private https://bjswwsciiuryfflxnflw.supabase.co
```

Configure .env.local before the private production build. Synthetic private browser tests intercept fake API endpoints. Rebuild private-test artifacts before those tests. Do not overwrite dist-private while a browser suite is running. Run Chromium and WebKit sequentially when sharing their preview port.

For SQL checks, use disposable PostgreSQL 17 and the bootstrap/migration/test sequence in CI. Never run supabase/tests/bootstrap.sql on managed Supabase. Existing migration files are immutable after application. Create forward migrations with the supported Supabase CLI and align a byte-identical local filename with the managed version assigned on application.

Most recent applied migrations:

- 20261122102230_finance_workflows
- 20261122102340_index_restore_owner
- 20261124160920_delete_commitments
- 20261124163456_subscription_payment_windows

Preserve the complete earlier migration chain, including the retired email integration and its removal.

PR #35 release validation passed lint, typecheck, production build, 189 unit tests plus two release tests. Final CI runs 45439074408 and 45439017028 passed frontend/browser, SQL and concurrency jobs. The final private suite contained 50 checks and local iPhone WebKit contained 14. Subscription window checks passed locally and on managed Supabase using rolled-back synthetic records. All 20 hosted assets matched the approved production build, with manifest, service-worker, shell and exact-origin CSP preflight passing.

## Release workflow

Create a focused branch and review PR. Run checks appropriate to the change and preserve the public demo. Use fresh connection/tool capabilities in the new workspace instead of assuming this workspace's CLI sessions or /tmp helpers exist.

Private releases use the existing folio-review Worker and Workers Static Assets upload-session flow, including the built _headers content and single-page-application fallback. Build from a clean committed source so folio-build.json records the true revision. Verify the current deployment before publishing to avoid overwriting an unexpected update.

After publishing, confirm the expected version and source revision from hosted folio-build.json. Then compare every hosted asset's bytes/hash/size with the approved build and run the hosted release preflight. A preflight passing against an older version is insufficient proof of the intended release. Record release evidence in the PR and delete any temporary scoped asset-upload credentials.

Current hosted check:

```sh
npm run verify:release -- https://folio-review.sid-17061999.workers.dev/ private https://bjswwsciiuryfflxnflw.supabase.co
```

No deployment or database recreation is needed just to use this handoff.
