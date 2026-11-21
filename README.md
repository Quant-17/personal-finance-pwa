# Folio · Personal Finance PWA

An INR finance manager for iPhone Safari PWA and Windows browsers, built with React, TypeScript, Vite, Tailwind, shadcn/ui patterns, Recharts and Supabase. Phase 1 is the synthetic demo. Phase 2 adds an authenticated workspace with manual financial entry. No bank integration or paid API is used.

The public https://folio.sid-17061999.workers.dev/ remains the synthetic demo. Phases 2–3 are merged and published at https://folio-review.sid-17061999.workers.dev/. The local loan-document review feature is merged from PR #8 and published as v0.3.1-rc.1 at the private origin, ahead of Stage 4. See [LOAN_DOCUMENT_IMPORT.md](LOAN_DOCUMENT_IMPORT.md).

The **Savings & investments** section for NPS, PPF, EPF and other manual holdings is merged from PR #10 and published as v0.3.2-rc.1 at the private origin. See [INVESTMENTS.md](INVESTMENTS.md).

The owner retired Gmail/Google receipt syncing. Email access and its metadata have been removed, and the pre-email UI was temporarily restored before the new PDF release. The owner-approved **monthly PDF statement review/import** is published as **v0.3.4-rc.1**, with adapters validated against the supplied SBI/Kotak styles. The attached statement rows were not imported; the owner must review/confirm entries in-app. See [STATEMENT_RELEASE.md](STATEMENT_RELEASE.md). See [STATEMENT_IMPORT.md](STATEMENT_IMPORT.md) for supported layouts, password handling, duplicate safeguards, remaining limits and release status.

Private **v0.3.5-rc.1** adds **EMI / loan repayment** to statement row types, with a linked loan and exact reviewed principal/interest split. The owner-approved release is live; see [STATEMENT_EMIS_RELEASE.md](STATEMENT_EMIS_RELEASE.md). See [STATEMENT_IMPORT.md](STATEMENT_IMPORT.md#reviewed-statement-emis--review-branch).

## Preview

Requires Node 24 and npm.

```sh
npm ci
# Synthetic demo; no credentials needed
npm run dev -- --mode demo
# Or build and preview the demo
npm run build:demo
npm run preview
```

For the private workspace, copy `.env.example` to `.env.local`, set `VITE_APP_MODE=private`, your Supabase HTTPS project URL and modern **publishable** client key, then `npm run dev`. For a production preview: `npm run build` followed by `npm run preview`. Environment values are read at build time, so rebuild after changing them. Never put a secret or service-role key into any `VITE_*` variable.

The existing connected free Supabase project was initially empty. The six Phase 2–3 migrations have been applied there. Loan-document, savings/investment and historical Gmail migrations were applied; a forward removal migration now retires the email integration. The monthly-statement migration is now applied as 20261121123639. Migration history is preserved rather than rewriting the previously applied SQL. No financial seed data or persistent test users were added. This workspace has an ignored `.env.local` using that project's publishable key; fresh checkouts must configure their own local file.

## Phase 2 features

- Email/password sign-in, signup confirmation and password-recovery screens using Supabase PKCE. A server-verified, confirmed, non-anonymous user is required before records load.
- Empty personal dashboard, actual six-month cash flow, monthly actual income/outflow, net worth and available liquid cash.
- Account creation/editing/archiving, user categories, paise-safe income/expense entry and editing, paginated ledger, atomic transfers and deletion of paired transfers.
- Loan tracking, estimated repayment schedules, actual principal/interest repayments and remaining debt; recurring subscription forecasts with edit/pause controls.
- Monthly category budgets, savings goals and cash earmarks, plus a separate monthly income/living-cost/reserve plan.
- Buy Decision Simulator uses the signed-in user's plan, cash and active loan EMI. It does not post purchases or loans.
- RLS, ownership-preserving composite foreign keys, private privileged functions and retry identifiers on money-changing RPCs.
- Offline/background lock: private views unmount, financial requests abort and session verification is required on return. Financial records never enter localStorage or Cache Storage. Supabase persists only the authentication session on this device; sign-out clears it. Appearance is also saved locally.

## Supabase setup and release gate

See [PHASE2_SETUP.md](PHASE2_SETUP.md) for migrations, exact Auth redirects, email limitations, security checks and Cloudflare build settings. **Auth redirect settings and a real owner confirmation/recovery round trip must be verified before publishing private mode or entering real financial information.** The owner has reported successful confirmation/recovery, financial-entry persistence, installed-app/offline behavior, the v0.2.0-rc.1 update and disposable-data cleanup. These reports are separate from automated checks. The owner supplied the redirect allowlist and confirmed saving the private Site URL on 20 November; the assistant did not independently inspect the dashboard. Merged main is published at the existing private origin, while the synthetic demo is preserved. See [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) for the remaining promotion steps.

## Validation

```sh
npm run lint
npm run typecheck
npm test
npm run build:demo
npx playwright install chromium
npx playwright test
npm run build:private-test
npm run test:private
npm run build
npm run verify:release -- dist private https://YOUR_PROJECT.supabase.co
```

`build:private-test` uses a committed fake project/key with intercepted browser responses; it never creates real Supabase users or sends email. SQL integration tests use disposable Postgres fixtures and roll back. GitHub Quality replays all migrations on Postgres 17, checks isolation/accounting, and runs demo and private browser suites. See [VALIDATION.md](VALIDATION.md) for observed results and limits.

## Documentation

[Product](PRODUCT_SPEC.md) · [Architecture](ARCHITECTURE.md) · [Data model](DATA_MODEL.md) · [Roadmap](ROADMAP.md) · [Agent guide](AGENTS.md) · [Phase 2 setup](PHASE2_SETUP.md) · [Phase 1 deployment](DEPLOYMENT.md)

No analytics, external fonts, bank credentials, full card numbers, push notifications or private offline editing. Loan estimates exclude fees, GST, insurance and lender-specific day counts. Original icons: `python scripts/generate-icons.py` (Pillow required).

## Phase 3 · available in the private app

Private saved comparisons and CSV import are integrated in this release branch. Save/reopen comparisons with original assumptions or switch explicitly to the current plan; preview a canonical UTF-8 CSV and confirm selected rows for atomic duplicate-safe posting. See [PHASE3_SETUP.md](PHASE3_SETUP.md), [CSV_IMPORT.md](CSV_IMPORT.md) and [PHASE3_RELEASE.md](PHASE3_RELEASE.md). The approved release is published at https://folio-review.sid-17061999.workers.dev/ as v0.3.0-rc.3. The additive migrations and hosted acceptance checks passed. Reopen the installed app and use Update app when offered. The original synthetic demo is preserved.
