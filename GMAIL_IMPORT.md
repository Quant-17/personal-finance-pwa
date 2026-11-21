# Gmail receipt import — review implementation

This branch implements Gmail/Google Workspace receipts and their Monthly Plan links. **It is not connected or enabled on the live app yet.** It needs review, a database migration, an Edge Function deployment, owner-controlled Google OAuth configuration and a server schedule. The ChatGPT Gmail connector does not authorize Folio. No real inbox was read to develop or test this change.

## What the owner sees

Transactions opens with an Email receipts inbox, while manual expenses, rent, transfers, loan repayments and the complete ledger remain. CSV is preserved under a collapsed **Advanced: legacy CSV import** disclosure for compatibility with the existing release; it is no longer the primary import flow.

Connect Gmail explains the permission and opens Google's consent screen in the same window to support Safari/PWA navigation; live consent and physical-device acceptance remain pending. After consent, return to Transactions and Sync receipts. Initial sync searches the previous 30 days; subsequent syncs overlap the last completed window by 48 hours. Each invocation processes one page of at most 20 messages with five concurrent fetches. A stored encrypted checkpoint resumes larger backlogs. Fifteen-minute server scheduling is independent of an open browser; a free Supabase project must remain active and within quotas. A paused project, revoked consent, provider failures, or a missing scheduler stops automatic checking. Manual sync has a one-minute throttle.

Sender filtering covers uber.com/uber.in, zomato.com, swiggy.in/swiggy.com, amazon.in and their subdomains. Amazon Pay, bank alerts, other merchants and other country domains are outside this first parser. The sender and email content are **untrusted evidence**, not payment verification. Sender allowlisting does not authenticate a payment or prove the sender's identity. Marketing, order confirmations, COD, refunds and cancellations are never automatically posted. A source Gmail link lets the owner inspect the original; Google may ask the owner to choose the correct mailbox.

Supported candidates show an amount in integer paise, the email's arrival date in Asia/Kolkata (a suggestion, **not a verified payment date**), a labeled order/trip/invoice reference if available, and a membership hint for Amazon Prime, Swiggy One, Zomato Gold or Uber One. Ambiguous totals stay blank. Extraction is deterministic plain-text/HTML parsing: **no OCR, attachments, paid AI or paid API**. Actual merchant templates may differ from synthetic fixtures; manually review every field. PDF/image-only receipts, provider responses above 2 MB, email text bodies above the parser limit and unsupported layouts need manual entry. Missing messages are not proof that an expense did not occur.

Choose the actual account/category, edit the settled amount/date and check existing expenses. A matching account/date/amount requires selecting the existing expense instead of posting again. Cross-account/date matches and split payments need manual reconciliation. Confirmation posts one expense through the existing accounting function, or links an existing one. Owner-scoped locking, unique receipt keys and a final status lock make repeated sync pages and concurrent confirmations safe. Two genuinely separate, identical payments can be entered manually. Conflicting same-order amounts and known refunds/cancellations with the same merchant/reference flag the charge for manual reconciliation, regardless of arrival order; an approved charge is never silently overwritten. Refund/cancellation drafts must be reconciled manually with the source payment and then dismissed; the app does not yet have automatic refund accounting.

A membership hint is a suggestion only. Add/review the subscription's amount, cadence and next renewal in the existing editor, then link the draft to that subscription. No subscription is auto-created and its renewal date is not advanced automatically. Linking labels the single settled expense; it never creates a second charge. Monthly Plan now also contains subscription controls and shows their normalized monthly estimate (monthly amount, yearly / 12, weekly × 52 / 12, rounded once), settled expenses, linked subscription charges **within** those expenses, and pending draft count. Subscription forecasts remain **inside the existing living budget**, so the simulator continues to subtract living costs and loan EMIs once each. Existing saved comparisons remain immutable.

## Data and security

- `gmail_connections`: owner-readable connection status/mailbox/cursor; clients cannot mutate it directly.
- `gmail_receipts`: owner-readable, minimal extracted candidates. No email bodies, subjects, HTML, full addresses from messages, card numbers, attachments or raw statements are stored. Stored Gmail message IDs and order references are still private financial metadata.
- `subscription_charges`: owner-readable links from an existing expense to a subscription. Deletes of ledger entries remove their links. Edits are reflected by the plan query, which includes expense-kind entries only.
- `folio_private.gmail_credentials`: AES-256-GCM encrypted refresh token and sync checkpoint, bound to owner and purpose with authenticated additional data. Access tokens live only in function memory. Encryption key is a server secret separate from the database, never `VITE_*`.
- `folio_private.gmail_oauth_states`: random state hash, owner, generation, encrypted PKCE verifier and a 10-minute expiry. Consumption atomically deletes state. Disconnect/generation fencing prevents an in-flight callback or sync from restoring access. Expired states are purged on the next connection attempt.
- Backend RPC `gmail_service` is granted only to `service_role`, checks its JWT role, and calls a private security-definer implementation with an empty search path. No browser API exposes credentials or OAuth state. Owner RPCs explicitly validate ownership and use the existing accounting path and financial range checks.
- Every new exposed table has RLS with cached `auth.uid()`/`auth.jwt()` predicates and denies anonymous JWTs. Browser views remain memory-only and unmount on lock/sign-out. Workbox still has no API runtime caching. Function responses use `Cache-Control: no-store` and restricted-origin CORS.
- `verify_jwt=false` is necessary for Google's callback and the scheduler. It is **not** public access to user actions: each is authenticated with Supabase `getUser`, requires a confirmed, non-anonymous user, and selects its owner from that verified user. Callback uses state + PKCE; scheduler uses a separate random server secret. There are no owner IDs accepted from the client.
- Do not add body/header/request-URL logging around OAuth callbacks or provider calls; keep provider logs/access controls and retention limited. OAuth authorization codes in callback URLs are short-lived secrets. The app redirects immediately to a clean status URL with a no-referrer response.

Disconnect deletes Folio's retained credential and OAuth state, invalidates leases and disables sync. It does not delete posted financial records or revoke the Google Account grant itself; the owner can revoke Folio under Google Account → Security → Third-party connections. **Remove imported receipt details** also disconnects and deletes all receipt metadata, retaining approved ledger entries/subscriptions. Reconnection can rediscover recent messages; reconcile them against the retained ledger. Deleting a posted ledger entry leaves its receipt reconciled with a null transaction link so a later sync does not recreate it unexpectedly.

## Google configuration — owner action, no secrets in chat

1. In a Google Cloud project, enable the **Gmail API**. Configure Google Auth Platform branding/audience and a **Web application** OAuth client. Folio's Supabase email/password login is separate; do not replace it with Gmail login.
2. For the current private project, add this exact authorized redirect URI:
   `https://bjswwsciiuryfflxnflw.supabase.co/functions/v1/gmail-receipts/callback`
   The Google client secret belongs in Supabase Edge Function secrets, never the React environment, repository, or chat.
3. Request only `https://www.googleapis.com/auth/gmail.readonly`. This is a **restricted scope covering mailbox reading**, not a permission restricted to four senders. The vendor search query is Folio behavior, not Google's access boundary. This app never requests send/modify/delete scopes.
4. For a personal development trial, keep the app in Testing and add the owner's Google account as a test user (a Workspace admin may prohibit it). **Gmail refresh tokens for external Testing apps normally expire after seven days.** Reconnect when required. Production personal use may qualify for Google's verification exceptions and still show an unverified-app warning/user cap. Do not promise permanent verified access simply by switching publishing status.
5. Before expanding beyond private personal use, review Google's restricted-scope verification, Limited Use and security-assessment requirements. A production server handling restricted Gmail data can require verification and an annual independent assessment, which may incur costs. This first release targets private personal use; it does not solve a public multi-user compliance launch. No paid service has been provisioned.

Official references checked for this implementation:
- [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes)
- [Web-server OAuth with offline access](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Refresh-token expiry, including Testing](https://developers.google.com/identity/protocols/oauth2)
- [Restricted scope verification and exceptions](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification)
- [Supabase scheduling with Cron, pg_net and Vault](https://supabase.com/docs/guides/functions/schedule-functions)

## Server configuration and deployment — after release approval

Replay migration `supabase/migrations/20261121102424_gmail_receipts.sql` in the approved Supabase project. Apply through the migration workflow; never run `supabase/tests/bootstrap.sql` on managed Supabase. If the migration tool assigns a different version timestamp, align the repository filename with the actual migration record without changing SQL bytes, as in previous releases.

Deploy `supabase/functions/gmail-receipts/index.ts` with its shared `.ts` files and the `verify_jwt=false` setting in `supabase/config.toml`. The entrypoint pins supabase-js 2.119.0. Configure these **server-only** secrets in the Supabase dashboard:

| Name | Value |
| --- | --- |
| `FOLIO_APP_URL` | `https://folio-review.sid-17061999.workers.dev/` (exact origin, trailing slash) |
| `GOOGLE_GMAIL_CLIENT_ID` | Google Web client ID |
| `GOOGLE_GMAIL_CLIENT_SECRET` | Google Web client secret |
| `GMAIL_TOKEN_ENCRYPTION_KEY` | 32 random bytes encoded base64url |
| `GMAIL_SCHEDULER_SECRET` | A separate random secret of at least 32 bytes |

Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in the function environment. Do not copy the service-role key into frontend settings or print it. Generate random secrets locally with a trusted password manager or `openssl rand -base64 32`; store them directly in server secrets. Rotating the encryption key makes old encrypted credentials unreadable; disconnect/reconnect affected users as part of that rotation. Do not leave unencrypted backups or keys in command history.

The browser requires no new secret and uses its existing Supabase URL/publishable key. Publish the reviewed frontend to the private origin using the existing asset release checks; preserve the synthetic public demo. Test OAuth in the actual Safari/PWA environment after Google consent setup. The callback is a server endpoint to avoid confusing Google's code with Supabase's PKCE login callback.

### Scheduling

Enable `pg_cron`, `pg_net`, and Vault using Supabase's supported dashboard/extensions flow. In Vault, securely add:
- `folio_gmail_function_url`: the HTTPS function URL (without `/callback`).
- `folio_gmail_scheduler_secret`: the same value as server secret `GMAIL_SCHEDULER_SECRET`.

Run this reviewed SQL in the private project's SQL editor **after** configuring/deploying the function and completing a manual sync. It contains no literal credentials:

```sql
select cron.schedule('folio-gmail-receipts', '*/15 * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='folio_gmail_function_url'),
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='folio_gmail_scheduler_secret')
    ),
    body := '{"action":"scheduled"}'::jsonb,
    timeout_milliseconds := 120000
  );
$$);
```

This selects the oldest eligible connected/error owner, skips active leases and processes one bounded page per invocation. No schedule is installed by the migration, and no code runs a paid scheduler. Review Cron job results / pg_net HTTP status; the app reports last complete sync, backlog and reconnection status. Never put credentials into a cron job literal or logs. Stop with `select cron.unschedule('folio-gmail-receipts');`. Disable the schedule before rolling back its function; deployed database tables can remain without affecting existing manual accounting.

## Validation and limits

Unit tests use synthetic receipts and mocked Google HTTP; SQL tests roll back synthetic `.invalid` owners; browser tests intercept fake Supabase endpoints. They validate isolation, encrypted owner binding, state replay denial, draft/ledger separation, exact paise, retry-safe posting, duplicate linking, refunds, subscription subset accounting and memory/cache behavior. They **do not** validate live Google consent, actual vendor templates, Workspace policies, Google production eligibility or a live scheduled run. An existing advanced CSV disclosure remains available as a fallback. The owner must complete a small real receipt review after deployment before relying on completeness.

Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build:demo`, `npm run build:private-test`, `npm run test:private`. Check the Edge entrypoint using `deno check supabase/functions/gmail-receipts/index.ts` (Deno 2.5.6 tested). Replay all migrations on disposable Postgres 17 and run the existing SQL suites plus `supabase/tests/gmail_receipts.sql`. Do not use real email as a test fixture.

## Local review results · 21 November 2026 IST

- Lint, strict TypeScript and Deno 2.5.6 entrypoint checks passed.
- 132 Vitest tests and 2 release-verification tests passed; 23 private-browser tests passed against fake intercepted Supabase endpoints.
- All sorted migrations replayed on disposable Postgres 17. Existing accounting/security, saved comparisons, CSV, loan document, investment and hosted-compatible rollback suites passed. The new Gmail suite passed 47 assertions; investment, CSV and Gmail concurrent-write harnesses passed. Local catalog checks confirmed RLS on all five new tables and denied backend RPC execution to browser roles.
- Demo/private production builds completed during implementation; final clean-source build/preflight and CI results are reported on the review PR. Existing PDF bundle-size and dependency annotation warnings remain non-blocking.
- No managed database migration, Edge Function deployment, server secret, cron job or actual Gmail consent/sync was performed. The current live private release remains v0.3.2-rc.1.
