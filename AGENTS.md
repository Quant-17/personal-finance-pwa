# Working on Folio

## Scope
Phase 1 is a synthetic-data prototype. Do not connect real financial data, implement Phase 2 or deploy to a public host unless explicitly requested. Use a review branch. Keep the product calm, responsive and accessible on iPhone Safari PWA and Windows browsers.

## Commands
`npm ci`, `npm run dev`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run preview`.
Optional browser checks: `npx playwright install chromium`, then `npx playwright test`. Tests start a production preview server themselves after a build.

## Engineering rules
- Store/model amounts as integer paise; use decimal-safe financial math. Changes to loan assumptions require tests and documentation.
- INR/en-IN formatting, Asia/Kolkata for live time display. Fixture dates remain explicitly synthetic.
- No credentials, real statements or personal financial data in source, fixtures, logs or screenshots. Never expose service-role keys; VITE_* values are public.
- Do not cache private API responses or auth/session data. Keep Workbox runtime caching empty until an explicitly reviewed caching design exists.
- Reuse UI components/tokens; honor reduced motion, keyboard focus, touch targets and dark appearance.
- Verify lint, typecheck, relevant tests and production build before handoff. Document any checks that could not run.
- Keep package-lock.json committed; use no paid services or paid APIs.
