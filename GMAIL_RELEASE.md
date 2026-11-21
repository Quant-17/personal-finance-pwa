# Gmail receipt release · v0.3.3-rc.1

The owner explicitly approved merging PR #12, applying its migration and deploying the Gmail backend/frontend on 21 November 2026 IST. Those operations are complete. Google consent, the first real receipt review and background scheduling are still pending; no owner email was read through chat.

## Published artifacts

- Private origin: https://folio-review.sid-17061999.workers.dev/
- Approved PR: https://github.com/Quant-17/personal-finance-pwa/pull/12
- Published source / merge: `5e6572a834b0f2c6ec8676e1ace7a236c609a19f`.
- Main CI: https://github.com/Quant-17/personal-finance-pwa/actions/runs/44898496447 — successful.
- Worker version: `9fb15e49-addf-40ed-b605-2ef901acf9ae`, 100%.
- Worker deployment: `0bed86b7-15c0-47f7-8cd4-75d9298a2280`, published at 17:00:44 IST on 21 November.
- Supabase migration: `20261121112759_gmail_receipts.sql`. The tool assigned the hosted timestamp; the review filename `20261121102424` is aligned in this release-record branch with SQL bytes unchanged.
- Edge Function `gmail-receipts`: ID `da485052-85e3-4ac8-8780-7b0005f4dae6`, version 1, ACTIVE; bundle SHA-256 `bdc84f6e45c8c29293e6d2fc61b5e6ed693f35482d59ed4a3c6af5e96f22d197`.
- JWT platform verification is disabled for the callback/scheduler; the function independently checks confirmed user JWTs, callback state/PKCE and the scheduler secret. This setting matches the approved implementation.

## Verification

The approved code passed lint, strict TypeScript, Deno entrypoint checks, 132 Vitest + 2 release tests, 23 private-browser and 6 demo-browser tests, all existing SQL suites and three concurrency harnesses. The deployed migration passed the 47-assertion synthetic hosted acceptance suite in a rolled-back transaction. No persistent test users or financial fixtures were added.

The deployed backend returned 401 for signed-out sync, 303 to the correct private origin for an invalid OAuth state, and 204 with the correct CORS origin/no-store policy for preflight. This confirms startup and server authorization boundaries; it does not validate the Google client secret or encryption key against an actual OAuth exchange. The owner reported saving the secrets; their values were not retrieved by the assistant.

The clean private production build and hosted release preflight passed mode/source/manifest/service-worker/exact-origin CSP checks. All 20 hosted assets were compared byte-for-byte against the production build. The public synthetic demo remained on Worker version `5e0cb7ff-e84b-4095-9d17-cff53db0d267`, deployment `92d02c4b-850d-46ae-81ea-3b51d7ed58a6`.

Supabase security advisors reported no new warnings: private OAuth/receipt tables deliberately have RLS enabled without browser policies and revoked browser grants. The existing leaked-password-protection warning remains. Existing bundle-size/dependency annotation warnings remain non-blocking.

## Owner acceptance / remaining setup

1. Refresh/update the installed PWA and verify footer v0.3.3-rc.1.
2. Transactions → Email receipts → acknowledge the scope → Connect Gmail. Complete Google consent as the configured test user. The restricted read-only scope covers the mailbox; Folio filters merchant receipts. Testing-mode refresh access normally expires after seven days.
3. Sync receipts; inspect one actual receipt and verify amount, actual payment date, category and account. Confirm only if settled, or link its existing ledger charge. Refunds/cancellations need manual reconciliation.
4. After a successful manual sync, configure Vault and the fifteen-minute schedule using GMAIL_IMPORT.md. No cron job was created during this deployment. Until then, sync is manual; do not describe it as active background synchronization.
5. Check iPhone installed-PWA and Windows consent/receipt review; do not commit real receipt contents or screenshots.

## Rollback

Previous private Worker version: `4460c12d-f53d-48a3-bbfb-ca912afb8dfa` (v0.3.2-rc.1). Restoring it hides the new inbox; additive Gmail tables can remain. Stop the cron job first if enabled. Disable the Edge Function if necessary and revoke Google access. Never drop posted transactions, subscriptions or owner records as part of rollback; receipt metadata and source links need deliberate handling. Detailed setup, token rotation and deletion behavior: GMAIL_IMPORT.md.
