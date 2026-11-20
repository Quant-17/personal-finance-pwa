# Loan document review · before Stage 4

Status: v0.3.1-rc.1 review branch. This feature is not deployed and its migration is not applied to the hosted project. No owner loans have been created. Stage 4 remains unstarted.

## Use the feature

1. Open the authenticated workspace → **Loans & subscriptions → Import loan PDF**.
2. Choose a new tracked loan or explicitly select an existing loan to attach/update. Choose a digital CRED/Credit Saison, Kotak credit-card EMI or L&T Finance PDF (10 MiB / 60 pages maximum). Password-protected PDFs must be unlocked locally first. Scanned-image OCR and other lenders are unsupported; use manual loan tracking for those.
3. Check every extracted value against the original. Source page references are shown. Correct the **quoted EMI** if needed. Annual nominal interest drives estimates; disclosed APR is retained separately. Processing fees/net disbursal are disclosures and do not post money.
4. Enter the **current outstanding principal**, remaining instalments and balance date from a current lender statement. An original agreement does not establish today's balance.
5. Alternatively, enter the actual first due date and explicitly confirm every instalment paid through a date. Request a suggested balance. A complete, tightly reconciled lender table can supply a schedule-derived balance; missing, partial or rounded tables use a clearly labelled reducing-balance estimate with the quoted EMI. Confirm against the lender. GST, fees, broken-period interest, insurance and day-count adjustments are not inferred. No past transactions are posted.
6. For card EMI, explicitly choose separate debt or the owned card whose balance already includes it. Linking avoids a second principal deduction in net worth, but keeps the EMI in monthly commitments. Pay linked cards using bank-to-card transfers and update plan balances separately.
7. Expand the repayment table to edit amounts, add manual rows, remove the last row or discard an unreliable table. Dates are monthly projections from the date you confirmed, not extracted row dates. Saison's displayed closing balances are converted to opening-balance rows. Source figures are retained, including small lender rounding differences (maximum ₹1 per row); those tables never produce an exact schedule-derived balance.
8. Confirm the final review and save. **Edit loan** reopens saved document details without requiring the PDF again. Updating requires a fresh balance and remaining term; existing Folio repayments are preserved. Quoted EMI feeds the dashboard and simulator. The old generated EMI/schedule remains an estimate for manually tracked loans.

Keep the original PDF yourself: this is structured data import, not a document archive. Each distinct PDF hash can belong to only one of your loans. Select that loan to correct or replace its document. No automatic lender sync or payment detection occurs.

## Privacy and accounting

PDF.js runs locally in a same-origin worker; no OCR service, paid API or AI endpoint is called. PDF bytes, filename, raw text, identifiers and document passwords are not persisted or uploaded. Selected files are not sent to Supabase Storage. Only the reviewed whitelisted terms, page references, rows, SHA-256 duplicate fingerprint and owner confirmation dates are saved behind owner-only RLS. Raw document instructions are treated as text, never commands.

Review state lives in React memory. Pending reads abort on unmount/lock/sign-out; no document fields enter localStorage, IndexedDB, API caches or Workbox caches. Only static application/worker files are precached. Existing Supabase device auth storage remains unchanged. Original files remain on the owner's device.

Saving is atomic and retry-safe. Source-hash uniqueness rolls back duplicate creations. Revision checks reject stale edits, including a repayment posted while a review is open. Existing posted principal is retained in the tracking baseline, so replacing today's balance never subtracts those repayments twice. Card linking is refused for loans with posted repayments to prevent reclassifying their history. Zero balance closes the plan. Ownership, bounds, dates, schedule reconciliation and allowed fields are checked again on the server.

## Preview, validate and release

Use Node 24, `npm ci`, existing private `.env.local` setup, then `npm run dev`. A disposable database must replay all migrations including `20261120200827_loan_document_review.sql`. Do not apply `supabase/tests/bootstrap.sql` to managed Supabase. Test data in the repository is synthetic.

```sh
npm run lint
npm run typecheck
npm test
npm run build:private-test
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:private
npm run build:demo
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npx playwright test
```

CI replays migrations on disposable Postgres 17 and runs all existing suites plus `supabase/tests/loan_documents.sql`. `supabase/tests/loan_documents_hosted_acceptance.sql` is a DDL-free rollback-only smoke suite prepared for the hosted project after migration approval; it also runs in disposable CI. See the PR for exact results. Production `npm run build` uses your build-time publishable configuration. `npm run verify:release -- dist private <SUPABASE_ORIGIN>` validates the build. No service-role key is required.

Release order after review: merge approved code, apply only the new migration to the existing free project, run rollback-only hosted acceptance/security-advisor checks, build private mode from the reviewed revision, deploy to the private review origin, verify assets/CSP/PWA update, then owner-test an unlocked document on iPhone Safari and Windows. The public synthetic demo stays separate. Hosted migration, deployment and physical-device acceptance are pending; this branch is not permission to publish them.

## Known limits

Text layouts vary by lender/version. Missing/conflicting fields stay blank; always review. L&T's blank schedule is not invented and an estimated first date must be confirmed. Kotak taxes can be billed separately. No arbitrary PDF attachments, OCR, encrypted document vault, bulk automatic creation, historical cash posting or automatic daily accrual. The PDF engine adds approximately 1.3 MB of static worker code plus a lazily loaded parser; private views still require an online verified session. Modern Safari/Chromium device acceptance remains a release gate.
