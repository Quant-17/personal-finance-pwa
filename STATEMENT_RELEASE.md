# Monthly PDF statement release · v0.3.4-rc.1

The owner explicitly approved PR #14, its monthly_statement_import migration and app deployment, then supplied readable SBI and Kotak statement styles for private analysis. The adapters were corrected and validated before release. **The app is live; no attached statement transactions were imported.** The owner must select/review/confirm future imports in-app.

## Published artifacts

- Private app: https://folio-review.sid-17061999.workers.dev/#activity
- Approved PR: https://github.com/Quant-17/personal-finance-pwa/pull/14
- Merge/published source: `aca660f0df85b7f3c14a534ac22377fa05d32cd7`.
- Main CI: https://github.com/Quant-17/personal-finance-pwa/actions/runs/44904743931 — success. Final PR CI 44904491985 and push CI 44904488193 also succeeded.
- Cloudflare Worker version `3a69b746-8bef-4193-aa34-9c13e45536c5`, 100%; deployment `657a5c47-02ed-4990-8bee-e6fc48024c83`, published 18:09:10 IST on 21 November 2026.
- Hosted migration `20261121123639_monthly_statement_import.sql`. The tool assigned the actual timestamp; the reviewed file `20261121120400` is renamed in this bookkeeping branch with identical SQL bytes.
- Gmail remains retired: forward removal migration 20261121115333, no-access 410 Edge tombstone version 2, no credential/state/email tables or public email RPCs. No schedule is active from this integration. The owner may delete unused Google client/function secrets directly; no secret values were retrieved.
- Public synthetic demo unchanged: Worker `5e0cb7ff-e84b-4095-9d17-cff53db0d267`, deployment `92d02c4b-850d-46ae-81ea-3b51d7ed58a6`.

## Verification

Lint, strict TypeScript, 127 Vitest + 2 release tests, 24 private-browser and 6 local demo-browser tests passed (the deployed-origin-only demo test is intentionally skipped locally). Fresh Postgres replay, all existing SQL suites, 22 statement assertions, retirement preservation tests and three concurrency harnesses passed. The applied statement migration passed the 22-assertion synthetic hosted suite inside a rolled-back transaction; no fixture user/financial rows were retained.

Both owner-provided styles were analyzed with private local PDF.js extraction and independent printed-cell checks. All transaction anchors and movement amounts matched. SBI Post Date was selected, with Value Date retained in source context; Kotak row numbers, right-aligned debit/credit columns and wrapped/continued narration were reconstructed. A separate private browser preview using intercepted synthetic workspace APIs matched dates/amounts/narration/directions for both documents. All rows stayed unselected; no preview/posting or external API request occurred. No original customer fields, transaction values, PDFs or passwords entered repository fixtures/logs/screenshots. Extracted private analysis files were removed afterwards; original uploaded source files remain outside Git.

Clean production/hosted release checks passed mode, source, manifest, service worker, exact-origin CSP and security headers. All 20 hosted assets matched the approved production build byte-for-byte, including JavaScript MIME for the PDF worker module. Supabase reported no new security warnings; deny-by-default private source/request tables deliberately have RLS and no browser policies/grants. The pre-existing leaked-password-protection warning and bundle-size/dependency annotation warnings remain unchanged.

## Owner acceptance

Refresh or accept Update app, verify footer v0.3.4-rc.1, then Transactions → Import monthly PDF statement. Choose the correct account and statement ending month. For a protected PDF, enter its password before selecting it. Review dates, types, categories and amounts; verify counts/totals against the original, check duplicates, then explicitly confirm. A pre-period account opening balance/date is required; do not double count an end-of-period baseline plus its historical transactions.

SBI uses Post Date, not the first Value Date. Credits/refunds, transfers, repayments and EMIs need deliberate reconciliation/dedicated forms; they are not silently treated as income. Test iPhone installed-PWA and Windows flows before relying on statement completeness. Scanned/image PDFs have no OCR; revised/unrecognized layouts may still need another adapter or manual entry. Full behavior/limits: STATEMENT_IMPORT.md.

## Rollback

The pre-email v0.3.2-rc.1 Worker `4460c12d-f53d-48a3-bbfb-ca912afb8dfa` is the safe previous frontend. Its additive statement source/request schema can remain. Keep Gmail retired; do not restore v0.3.3's email frontend/backend. Never delete settled ledger entries, source markers, loan/investment data or subscriptions as an automatic rollback step. Metadata deletion/reimport decisions must be deliberate.
