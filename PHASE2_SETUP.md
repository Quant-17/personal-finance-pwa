# Phase 2 setup and release checklist

## Current state

The review branch is `feat/phase-2-private-finance`, stacked on the Phase 1 branch because PR #1 is not merged. The public https://folio.sid-17061999.workers.dev/ still serves the synthetic demo. Phase 2 has not replaced that deployment. The user-approved acceptance preview is now deployed separately at https://folio-review.sid-17061999.workers.dev (19 November 2026).

The connected existing **free** Supabase project is `bjswwsciiuryfflxnflw` (Singapore). Its public schema was empty before this work. These migrations are applied and match the committed filenames:

1. `20261117172916_phase2_private_finance.sql`
2. `20261117174854_retry_safe_financial_mutations.sql`
3. `20261117175808_cache_rls_identity.sql`

No service-role key is used. No real financial rows or persistent test users were inserted. Tests use `.invalid` addresses inside rolled-back SQL transactions and send no mail. Don't reset/drop an existing project to replay this schema.

## Local configuration

Copy `.env.example` to ignored `.env.local`. Set private mode, the exact project HTTPS URL and the modern publishable key from Supabase Project Settings → API Keys. These values are public client configuration; the database must remain protected by RLS. Never copy a secret, service-role or legacy JWT key into the app.

```sh
npm ci
npm run dev
# Production preview
npm run build
npm run preview
```

`npm run build:demo` deliberately selects the synthetic mode even when `.env.local` is configured. `.env.private-test` uses a fake endpoint/key for intercepted tests only. Don't deploy that test build.

For a fresh empty project, use an authenticated Supabase CLI (run `supabase init` first if configuration is missing; then `supabase link --project-ref YOUR_REF`, review `supabase db push --dry-run`, then `supabase db push`). Consult the installed CLI help for its version. Do not run SQL-test `bootstrap.sql` against managed Supabase. Existing connected project migrations are already applied; do not blindly replay their CREATE statements. CLI-generated local migrations were aligned to the hosted migration versions after application through the connected migration tool.

## Auth dashboard configuration · pending verification

The connected database tooling cannot edit Auth URL settings. In [Supabase URL Configuration](https://supabase.com/dashboard/project/bjswwsciiuryfflxnflw/auth/url-configuration):

- Set Site URL to the chosen private deployment origin, including trailing `/` (not the synthetic demo unless deliberately replacing it).
- Add exact redirect URLs for `http://localhost:5173/`, `http://127.0.0.1:5173/`, `http://localhost:4173/`, `http://127.0.0.1:4173/` and the chosen HTTPS private origin + `/` as needed. Avoid wildcard public preview origins.
- Public Auth settings were verified: email/password enabled, email confirmation required, signup enabled. Preserve **Confirm email** in provider settings. Anonymous sign-in is not supported. Use a strong server password policy as well as the client 12-character signup/change minimum.
- Review email delivery limits. Supabase's default email sender is restricted/rate-limited and may send only to project team addresses. A free custom SMTP provider is optional if a wider audience is required; no paid service has been provisioned here.

Callbacks use PKCE and return to the same origin `/`. Complete confirmation/reset in the same browser profile that started the request; cross-device PKCE handoff is not supported. Never paste tokens into this chat.

Before real financial entry, the owner must confirm a fresh account, sign in, request/reset its password, sign out and sign back in. Automated tests mock these UI endpoints and verify actual RLS separately; they do not prove live email delivery or dashboard redirect settings.

## Cloudflare production deployment · after acceptance

Use free Cloudflare Pages or Workers Static Assets with Node 24, repository root, build command `npm run build`, output `dist`. Add only `VITE_APP_MODE=private`, `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` to the build environment. Rebuild after changing values. No runtime Worker, service-role key or paid resource is needed. Do not merge automatically; select the branch/environment intentionally.

Prefer a separate private origin during acceptance. Ensure Supabase Auth URLs match it exactly. The build generates `_headers` with `connect-src 'self' https://YOUR_PROJECT.supabase.co`; it needs no wildcard or realtime websocket. Check document security headers, manifest/icons and `Cache-Control: no-cache` for `/sw.js` on the actual deployed host. Vite preview does not serve Cloudflare `_headers` rules.

Test desktop/mobile, confirmation/recovery, two-user isolation, sign-out, online → background/offline → lock → verified return, service-worker update and installed iPhone/Windows behavior. Financial API URLs must never appear in Cache Storage. Don't enter actual bank data until this release checklist is complete.

## Database test reproduction

Use a disposable PostgreSQL 17 instance (CI provisions one). Run `supabase/tests/bootstrap.sql`, each migration in sorted filename order with `psql -v ON_ERROR_STOP=1 --single-transaction`, then `security_and_accounting.sql` and `hosted_acceptance.sql`. Both fixture suites roll back. Bootstrap only supplies local Auth stubs and roles; hosted Supabase already owns those.

Hosted acceptance is DDL-free: it creates two transient Auth users and verifies accounting/retry/isolation inside BEGIN/ROLLBACK. Do not insert fixtures through Auth email APIs. Full tests assert all ten public tables, write permissions, foreign-owner parents, anonymous denial, date/amount constraints, transfers, debt, budgets, earmarks and unchanged retries.

Advisors: no security WARN/ERROR and no RLS-performance WARN after optimization. The private receipt table intentionally has no RLS policy/client table privileges ([advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)); this is deny-by-default, accessible only inside narrow privileged mutation functions. New-project unused-index INFO notices are expected ([reference](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index)); retain ownership/FK/reporting indexes until representative usage exists.

## Build and deployment identity

Every new build publishes `folio-build.json` containing its mode, Git source revision and (for private mode) Supabase origin. It contains no API key, user identity or financial data, and has `Cache-Control: no-store`. The checker rejects dirty/unidentified builds, the wrong mode/project, missing PWA files and an incorrect CSP.

Run after committing changes (Node 24.5+):

```sh
npm run build
npm run verify:release -- dist private https://bjswwsciiuryfflxnflw.supabase.co
```

After an approved private deployment, check the actual chosen origin:

```sh
npm run verify:release -- https://YOUR_PRIVATE_ORIGIN/ private https://bjswwsciiuryfflxnflw.supabase.co
```

The hosted check also verifies document/manifest/service-worker headers. Vite preview cannot emulate Cloudflare headers, so use artifact verification for local builds. Existing Phase 1 deployments predating this change have no build identity and will correctly fail this Phase 2 release check. The checker needs no account credentials and never calls financial APIs.

A private review ZIP is prepared locally under ignored `artifacts/` after the clean-source build check. It contains only `dist` output, with the browser-visible publishable key required for Auth. Do not publish it until the Auth/device release checks above are complete. To review locally, extract it and serve its root over localhost; callbacks must be allowlisted for the exact localhost port. It does not contain `.env.local`, source files, database credentials or financial records.

During continuation, both dashboard browser connection attempts timed out before a page could be inspected. Therefore no Auth URL configuration was read or changed through the dashboard, and no new publication or PR merge was performed. All four existing Phase 2 PR checks were confirmed green before this release-verification follow-up.

## Deployed acceptance preview · 19 November 2026

The user explicitly authorized this isolated preview before completing Auth/device checks. It is not a production promotion or PR merge.

- URL: https://folio-review.sid-17061999.workers.dev
- Worker: `folio-review`, static assets only; no Worker code or additional backend bindings.
- Deployed source: `e422ec71ea6d04b250b89c2b3fbd0cd3de88479a` (the previously reviewed build).
- Worker version: `ed95fa49-817c-4e12-ae3b-8b1e71278254`.
- Deployment: `60d1e570-4a01-4647-bdfa-2eab9b382ed8`, 100% review traffic.
- Hosted `verify:release` passed mode/source/project identity, manifest, app shell, service worker headers and exact-project CSP. The initial checker incorrectly tested `/index.html` rather than the root and missed a root 404. This was corrected on 19 November; `/` now returns 200 and the sign-in form was visibly verified in a browser. Authenticated owner/device acceptance is still pending.
- The original `folio` Worker remains on `5e0cb7ff-e84b-4095-9d17-cff53db0d267` at 100%; verified through the Cloudflare API.

**Before clicking Create account or Forgot password in the preview**, add this exact callback under Supabase Auth → URL Configuration → Redirect URLs and save:

```text
https://folio-review.sid-17061999.workers.dev/
```

Keep the localhost callbacks already added by the owner. The client explicitly supplies its current origin as redirectTo; no Site URL change is required for this acceptance preview. Preserve any existing redirect entries. Then create/confirm a Folio account using an email permitted by the project's sender, sign in to the empty Overview, test reset in the same browser, sign out and sign back in. The assistant has not sent any confirmation/reset messages or entered real financial records.

The app shell is public; data requires a confirmed, non-anonymous Supabase user and owner RLS. The preview uses the existing Supabase project. Owner email acceptance, hosted visual interaction and physical iPhone/Windows installation/offline/update checks remain pending. Removing this preview later means deleting only `folio-review`, retaining the original Worker and all Supabase data.

### Root-routing repair

The first preview used `html_handling: none`, which served `/index.html` but returned 404 for `/`. The corrected asset configuration uses `auto-trailing-slash`; `/` serves the app and `/index.html` redirects to `/`. Preserve `not_found_handling: none` for the hash-routed app and keep all `_headers` rules. When changing asset configuration, register the complete existing manifest again and attach its completion token with the new config. `keep_assets: true` reused the old config in the attempted update and did not apply the routing fix.

Hosted release checks now request `/` directly. `tests/release-verification.test.mjs` uses local HTTP fixtures to reject the previous root-404/index-200 failure and accept a working canonical root with an index redirect. Both tests run under `npm test`. On 19 November, browser inspection of the repaired HTTPS root showed the Folio heading, email/password inputs and Sign in/Create account controls. No credentials were entered.

## Owner-reported Auth acceptance · 19 November 2026

The owner confirmed successful account creation/confirmation, sign-in through session verification into Overview, and password recovery followed by new-password sign-in. This supersedes earlier email-flow-pending notes for the review origin. The assistant did not inspect credentials or independently read the raw dashboard configuration. Final production URL configuration remains a pre-promotion check.

For a disposable live accounting check, create `Test Wallet` as cash with an opening balance of ₹0. Add an acceptance-test income of ₹1,000 and expense of ₹100 using matching categories. Verify ₹900 on Accounts, refresh and verify it persists. Delete those two entries and verify ₹0 before archiving the wallet, so no synthetic balance remains in net worth. Use only these fictional amounts. Record pass/fail without personal financial values. Follow with the physical-device checks already listed above.

## Current acceptance status · 19 November 2026

The owner reported working account confirmation/sign-in/recovery, live cash-account entry with refresh persistence, and the requested installed-PWA/Windows offline lock and reconnect behavior. These reports supersede earlier pending notes for those particular review-origin checks. Browser/device versions and final disposable-data cleanup were not independently inspected.

Phase 2 core functionality is ready for code review. Before any production promotion, review final Auth URL configuration, confirm the disposable transactions are removed and Test Wallet is zero/archived, and perform a controlled service-worker update/activation check on installed devices. PR review readiness is not permission to merge PRs or replace the existing demo. No additional deployment occurred during this documentation update.
