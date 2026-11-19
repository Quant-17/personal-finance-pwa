# Phase 1 validation

Verified in the Codex Cloud workspace on 16 November 2026 using Node 24.22.1 and npm 11.9.0. Fixtures are synthetic. No Supabase connection or real financial records were used. Cloudflare credentials are managed through the connected service; no credentials are committed to the repository.

| Check | Result |
| --- | --- |
| `npm run lint` | Passed, no warnings/errors |
| `npm run typecheck` | Passed, strict application/config/test TypeScript |
| `npm test` | 26 tests passed |
| `npm run build` | Passed; manifest and service worker generated |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npx playwright test` | 6 browser tests passed against the production build |
| Hosted browser suite against the Cloudflare preview | 7 checks passed, including offline behavior and deployed headers |
| Live asset integrity | All 13 paths return 200 and match the prepared build byte-for-byte |
| `git diff --check` | Passed |

## Calculation coverage
Known ₹1 lakh / 12% / 12-month EMI; zero-interest settlement and residual paise; zero/tiny principal; single-month loan; independent monthly amortisation settlement; integer outputs at the supported maximum; non-finite, negative and out-of-range inputs; tiny positive APR cancellation; rate/tenure effects; exact rupee parsing and rounded-up delayed savings. The finance module uses its own 40-digit decimal arithmetic context and the zero-rate limit for negligible rates.

## Browser coverage and visual review

CI initially exposed a browser-test race: the dashboard's compact simulator could receive an edit before the full simulator route mounted. Browser tests now wait for the destination heading before editing or capturing screenshots. The assertions and offline coverage are retained.

- Four-way simulator, editable price/APR/tenure/delay, emergency reserve shortfall, no-purchase surplus, invalid-input handling.
- Accounts and budgets previews, sample transaction CSV download, no uncaught JavaScript errors in the primary journey.
- 390 × 844 mobile viewport: drawer navigation, dark appearance, persisted appearance after reload, hash-route reload, no page-level horizontal overflow.
- Production manifest and all referenced app icons return successfully.
- After service worker activation: disable networking, reload dashboard, see offline status, navigate to simulator and calculate a new purchase.
- Cache inspection confirms static assets are present and no Supabase/API URLs are cached. Workbox has no runtime caching rules.
- Desktop dashboard (1440px) and mobile dark simulator screenshots inspected visually.

[Desktop screenshot](docs/screenshots/dashboard-desktop.png) · [Mobile dark simulator](docs/screenshots/simulator-mobile-dark.png)

Build splits chart code into a separate chunk (approximately 407 kB before compression); the main chunk is approximately 311 kB. Static precache is about 766 KiB. The large-chunk warning was resolved without raising the warning threshold.

## Phase 1 review follow-up

Reviewed the money engine and validation boundaries, synthetic fixtures, simulator navigation, mobile drawer flow, manifest and static-only caching configuration. Two reproduced usability defects were fixed:

- A dashboard purchase draft reset to ₹85,000 when opening the full simulator. The App now owns controlled simulator inputs in memory. Price, APR, tenure, selected method and delayed savings duration survive navigation and browser back/forward, and reset on refresh. No purchase inputs are stored locally or sent to a backend.
- Mobile navigation from the bottom of the dashboard landed 344px down the budgets page. Route transitions now start at the top without animated scrolling; modified link clicks retain native browser behavior.

Both regression tests failed before the fixes and passed afterward, alongside the existing browser suite (6 total browser checks). Finance tests remain at 26 and the financial calculation engine is unchanged. No additional blocking defects were identified in the reviewed Phase 1 paths; this does not replace the physical-device checks below.

## Deployment packaging

The Quality workflow uploads `dist/` as `folio-phase-1-preview` only after all checks pass, retaining the build artifact for 7 days. It does not publish to Cloudflare. [DEPLOYMENT.md](DEPLOYMENT.md) covers a separate temporary Direct Upload demo, build/asset/header checks, physical-device installation and future Git-integrated production setup.

The Cloudflare connection is now active and was used to repair the existing Workers preview. The hosted checks passed; physical-device results remain outstanding.

## Hosted deployment repair and verification · 17 November 2026

Live URL: [Folio Phase 1 preview](https://folio.sid-17061999.workers.dev/).

The initial deployment omitted the referenced JavaScript, CSS and icons and served the manifest as `application/octet-stream`. The complete asset manifest was uploaded through the connected Cloudflare API with correct MIME types, then attached to the same assets-only Worker. All 13 paths now return 200 and match the prepared build byte-for-byte; the manifest is served as `application/manifest+json`.

All 7 hosted browser checks passed in 20.1 seconds: simulator comparison/validation/export, mobile navigation and appearance, offline reload and offline simulator use, review screenshots, draft retention/reset, route scroll reset, and security/manifest/icon/service-worker headers. The live desktop screenshot was also inspected visually. The managed browser was configured temporarily to trust only the environment's known TLS proxy CA public key; this did not change the app or weaken repository/browser defaults for normal runs.

Deployed source commit: `52b7d17`. Known-good Worker version: `5e0cb7ff-e84b-4095-9d17-cff53db0d267`. Deployment: `92d02c4b-850d-46ae-81ea-3b51d7ed58a6`. The Worker URL and existing compatibility settings were retained, and no backend bindings or paid resources were added. This known-good version is available for rollback.

The browser harness accepts `PLAYWRIGHT_BASE_URL` for hosted testing. Its seventh check is intentionally skipped against local Vite because Vite does not apply Cloudflare `_headers` rules.

## Remaining manual checks / limits
- Physical iPhone Safari Add to Home Screen, standalone launch, offline reopening and storage eviction behavior.
- Physical Windows Edge/Chrome installation and accessibility with a screen reader.
- A new service-worker version's update prompt was implemented but cross-version activation was not exercised in browser automation.
- Supabase authentication, RLS, private CRUD and real-data calculations are intentionally unimplemented Phase 2 work. This preview itself has no access gate and contains no private data.

No known blocking defects remain in the tested Phase 1 flows. CI repeats lint, typecheck, unit tests, build and Chromium browser checks on pushes/PRs; its remote status is separate from these local results.

## Review handoff

The implementation is published on GitHub branch `feat/phase-1-prototype` for draft pull request review against `main`. Repository write access was verified by a successful push after the connector installation was corrected. The initial HTTP 403 publication blocker is resolved.

The Phase 1 preview has been repaired and verified on the existing Workers URL. The PR remains available for code review; Phase 2 authentication and real-data integration have not been started.
