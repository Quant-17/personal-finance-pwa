# Phase 1 validation

Verified in the Codex Cloud workspace on 16 November 2026 using Node 24.22.1 and npm 11.9.0. Fixtures are synthetic. No Supabase project, real credentials or financial records were used.

| Check | Result |
| --- | --- |
| `npm run lint` | Passed, no warnings/errors |
| `npm run typecheck` | Passed, strict application/config/test TypeScript |
| `npm test` | 26 tests passed |
| `npm run build` | Passed; manifest and service worker generated |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npx playwright test` | 4 browser tests passed against the production build |
| `git diff --check` | Passed |

## Calculation coverage
Known ₹1 lakh / 12% / 12-month EMI; zero-interest settlement and residual paise; zero/tiny principal; single-month loan; independent monthly amortisation settlement; integer outputs at the supported maximum; non-finite, negative and out-of-range inputs; tiny positive APR cancellation; rate/tenure effects; exact rupee parsing and rounded-up delayed savings. The finance module uses its own 40-digit decimal arithmetic context and the zero-rate limit for negligible rates.

## Browser coverage and visual review
- Four-way simulator, editable price/APR/tenure/delay, emergency reserve shortfall, no-purchase surplus, invalid-input handling.
- Accounts and budgets previews, sample transaction CSV download, no uncaught JavaScript errors in the primary journey.
- 390 × 844 mobile viewport: drawer navigation, dark appearance, persisted appearance after reload, hash-route reload, no page-level horizontal overflow.
- Production manifest and all referenced app icons return successfully.
- After service worker activation: disable networking, reload dashboard, see offline status, navigate to simulator and calculate a new purchase.
- Cache inspection confirms static assets are present and no Supabase/API URLs are cached. Workbox has no runtime caching rules.
- Desktop dashboard (1440px) and mobile dark simulator screenshots inspected visually.

[Desktop screenshot](docs/screenshots/dashboard-desktop.png) · [Mobile dark simulator](docs/screenshots/simulator-mobile-dark.png)

Build splits chart code into a separate chunk (approximately 407 kB before compression); the main chunk is approximately 311 kB. Static precache is about 766 KiB. The large-chunk warning was resolved without raising the warning threshold.

## Remaining manual checks / limits
- Physical iPhone Safari Add to Home Screen, standalone launch, offline reopening and storage eviction behavior.
- Physical Windows Edge/Chrome installation and accessibility with a screen reader.
- Cloudflare Pages security headers and update delivery on a deployed HTTPS origin. Deployment has not been performed.
- A new service-worker version's update prompt was implemented but cross-version activation was not exercised in browser automation.
- Supabase authentication, RLS, private CRUD and real-data calculations are intentionally unimplemented Phase 2 work. This preview itself has no access gate and contains no private data.

No known blocking defects remain in the tested Phase 1 flows. CI repeats lint, typecheck, unit tests, build and Chromium browser checks on pushes/PRs; its remote status is separate from these local results.

## Review handoff

The implementation is published on GitHub branch `feat/phase-1-prototype` for draft pull request review against `main`. Repository write access was verified by a successful push after the connector installation was corrected. The initial HTTP 403 publication blocker is resolved.

Only this handoff documentation changed during the publication retry. The implementation and recorded validation results are unchanged; no deployment or Phase 2 work was performed.
