# Working on Folio

## Scope
Phase 2 was explicitly authorized by the user. Keep the synthetic demo and authenticated workspace in separate build modes and use the existing free Supabase project. The user explicitly approved an isolated `folio-review` Cloudflare deployment on 19 November 2026 to perform Auth/device acceptance. Preserve the existing `folio` demo deployment. Do not enter real financial fixtures or promote private mode to production before the documented Auth/device checks. Use a review branch. Keep the product calm, responsive and accessible on iPhone Safari PWA and Windows browsers.

## Commands
`npm ci`, `npm run dev`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run build:demo`, `npm run build:private-test`, `npm run test:private`, `npm run preview`.
Optional browser checks: `npx playwright install chromium`, then `npx playwright test`. Demo tests use the demo build; private browser tests use build:private-test with fake intercepted Supabase endpoints. Both start preview servers. Replay sorted SQL migrations on disposable Postgres and run the 101-assertion integration suite. Never run bootstrap.sql on managed Supabase.

## Engineering rules
- Store/model amounts as integer paise; use decimal-safe financial math. Changes to loan assumptions require tests and documentation.
- INR/en-IN formatting, Asia/Kolkata for live time display. Fixture dates remain explicitly synthetic.
- No credentials, real statements or personal financial data in source, fixtures, logs or screenshots. Never expose service-role keys; VITE_* values are public.
- Do not cache private API responses or auth/session responses in HTTP/Workbox caches. Only Supabase SDK auth tokens may persist in its scoped device storage; financial views stay in memory and unmount on lock/sign-out. Keep Workbox runtime caching empty until an explicitly reviewed caching design exists.
- Reuse UI components/tokens; honor reduced motion, keyboard focus, touch targets and dark appearance.
- Verify lint, typecheck, relevant tests and production build before handoff. Document any checks that could not run.
- Keep package-lock.json committed; use no paid services or paid APIs.
