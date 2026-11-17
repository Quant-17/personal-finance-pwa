# Phase 2 setup and release checklist

## Current state

The review branch is `feat/phase-2-private-finance`, stacked on the Phase 1 branch because PR #1 is not merged. The public https://folio.sid-17061999.workers.dev/ still serves the synthetic demo. Phase 2 has not replaced that deployment.

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

## Cloudflare private deployment · after review

Use free Cloudflare Pages or Workers Static Assets with Node 24, repository root, build command `npm run build`, output `dist`. Add only `VITE_APP_MODE=private`, `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` to the build environment. Rebuild after changing values. No runtime Worker, service-role key or paid resource is needed. Do not merge automatically; select the branch/environment intentionally.

Prefer a separate private origin during acceptance. Ensure Supabase Auth URLs match it exactly. The build generates `_headers` with `connect-src 'self' https://YOUR_PROJECT.supabase.co`; it needs no wildcard or realtime websocket. Check document security headers, manifest/icons and `Cache-Control: no-cache` for `/sw.js` on the actual deployed host. Vite preview does not serve Cloudflare `_headers` rules.

Test desktop/mobile, confirmation/recovery, two-user isolation, sign-out, online → background/offline → lock → verified return, service-worker update and installed iPhone/Windows behavior. Financial API URLs must never appear in Cache Storage. Don't enter actual bank data until this release checklist is complete.

## Database test reproduction

Use a disposable PostgreSQL 17 instance (CI provisions one). Run `supabase/tests/bootstrap.sql`, each migration in sorted filename order with `psql -v ON_ERROR_STOP=1 --single-transaction`, then `security_and_accounting.sql` and `hosted_acceptance.sql`. Both fixture suites roll back. Bootstrap only supplies local Auth stubs and roles; hosted Supabase already owns those.

Hosted acceptance is DDL-free: it creates two transient Auth users and verifies accounting/retry/isolation inside BEGIN/ROLLBACK. Do not insert fixtures through Auth email APIs. Full tests assert all ten public tables, write permissions, foreign-owner parents, anonymous denial, date/amount constraints, transfers, debt, budgets, earmarks and unchanged retries.

Advisors: no security WARN/ERROR and no RLS-performance WARN after optimization. The private receipt table intentionally has no RLS policy/client table privileges ([advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)); this is deny-by-default, accessible only inside narrow privileged mutation functions. New-project unused-index INFO notices are expected ([reference](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index)); retain ownership/FK/reporting indexes until representative usage exists.
