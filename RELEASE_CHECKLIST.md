# Phase 2 release checklist

Prepared 19 November 2026; completed status recorded 20 November. The plan below is retained as a historical procedure, not authorization for future operations.

Completed: owner-authorized PR #1 and #2 merges, successful main CI, owner-confirmed private Site URL/exact redirect allowlist, prior owner Auth/device/update/persistence/cleanup acceptance, and publication of merged main to the existing private origin. Hosted checks and all 18 artifact-byte comparisons passed. The synthetic demo remains unchanged. See PHASE2_SETUP.md for current source/deployment IDs. The private origin remains `folio-review`; replacing `folio` was not part of this release.

## Accepted release candidate

- Version: `0.2.0-rc.1`; deployed app source: `00a1bc5995da6156fe378b3de33803106d609ad7`.
- Review origin: https://folio-review.sid-17061999.workers.dev/.
- Review Worker version: `3b994d27-44c1-476a-a0dc-382731b1844f`.
- Lint, typecheck, 53 unit/release tests, eight private browser flows, production build and hosted release verification passed for this candidate. Full Quality CI also tests the demo and 101 SQL assertions.
- Cloud browser verified the previous worker's Update app banner and activation into the visible new version.
- Owner reported working Auth/recovery, persistence, installed/offline behavior, update/Overview return and disposable-data cleanup. No personal records were inspected by the assistant. Device/browser versions were not recorded.

## Before merging or publishing

1. Review PR #1, then PR #2. Both were mergeable with successful checks when this checklist was prepared; PR #1 is still draft and PR #2 has no submitted review. Recheck the latest heads before merging.
2. Decide the permanent private origin. The conservative option is to keep the accepted private app on `folio-review` and retain `folio` as the synthetic demo. Replacing `folio` requires a separate explicit decision and its own origin/device acceptance; the review installation and auth storage do not transfer between origins.
3. In Supabase Auth URL Configuration, verify Site URL equals the chosen private HTTPS origin with trailing `/`, and Redirect URLs contains that exact origin. Preserve required review/local callbacks; avoid wildcard public previews. Keep email confirmation enabled. Do not expose keys or confirmation links in review evidence. The connected database tooling cannot verify these settings.
4. Record the selected origin and dashboard verification. Obtain the merge/deployment decision before executing the sequence below.

## Approved merge sequence

1. Mark PR #1 ready, merge it into `main` after review/checks, preserving the Phase 1 branch until the stacked PR is retargeted.
2. Retarget PR #2 from `feat/phase-1-prototype` to `main`. Review the resulting diff, resolve any conflicts on the review branch and wait for the latest Quality checks. Do not bypass failing checks or branch protection.
3. Merge PR #2 only after that review. Merging does not deploy: the current workflow builds artifacts and does not publish to Cloudflare.
4. Record the merge commit. If building a new artifact from it, use a clean checkout, `npm ci`, the existing private project URL/publishable key and `VITE_APP_MODE=private`. Never publish the demo artifact or `.env.private-test` build as private production. Recheck lint, typecheck, tests and production build; verify build identity with `npm run verify:release -- dist private https://bjswwsciiuryfflxnflw.supabase.co`.

## Approved deployment sequence

1. Save the target Worker's current deployment/version and exact asset routing/header configuration. Upload the complete tested static asset manifest with correct MIME types. Retain `html_handling: auto-trailing-slash`, `not_found_handling: none`, `run_worker_first: false` and generated `_headers`. No backend bindings or paid resources are needed.
2. Attach the completed asset upload to only the approved Worker. Use a fresh complete-manifest session when setting asset configuration; `keep_assets` did not update routing in the earlier repair.
3. Run hosted `verify:release` against the exact approved root URL and private project origin. Match the intended source/version in `folio-build.json`; verify root, manifest/icons, service worker, security headers and exact-project CSP.
4. Verify sign-in/recovery callbacks on that origin, then installed-app update, session verification, offline lock/reconnect and sign-out. Only the owner handles credentials. Avoid adding more financial fixtures now that cleanup is complete.
5. Record deployed source/version, checks and owner acceptance. Do not enable automatic deployment as part of this manual release without a separate reviewed configuration change.

## Recovery

If a review-only update fails, restore the previous known-good review asset version and verify its root and security headers. The accepted review version above is the recovery point for subsequent updates. Review-only operations leave `folio` untouched.

If replacement of `folio` is explicitly approved later, its original synthetic recovery version is `5e0cb7ff-e84b-4095-9d17-cff53db0d267` (deployment `92d02c4b-850d-46ae-81ea-3b51d7ed58a6`). Restoring it removes private workspace access from that origin until a private build is restored; it does not delete Supabase records. Diagnose an Auth-only issue before rolling back assets. Do not roll back database migrations, delete financial records or remove Supabase callback entries as part of asset recovery. Previously issued auth sessions are not revoked by changing app assets.
