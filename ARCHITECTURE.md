# Architecture

## Phase 1
React 19 + TypeScript on Vite. Tailwind CSS provides utilities and tokens; local shadcn/ui-style Button uses Radix Slot, class-variance-authority and class merging. Recharts renders the cash-flow and spending charts. All data lives in `src/lib/data.ts` as fictional immutable examples. No backend is called.

- `src/App.tsx`: app shell, hash navigation, theme, status, dashboard and read-only finance previews.
- `src/components/Simulator.tsx`: transient input state, validation and scenario comparison.
- `src/lib/finance.ts`: pure money boundaries and loan engine; decimal.js internally, integer paise externally.
- `src/components/ui/button.tsx`: reusable shadcn/ui pattern; `components.json` tracks component configuration. Styles import utilities through relative paths; additional generated components should follow that convention or add an explicit Vite/TS alias.
- `src/index.css`: visual system, dark tokens, responsive layout, reduced-motion support.
- `vite.config.ts`: static precaching through vite-plugin-pwa/Workbox.
- `public/_headers`: Cloudflare Pages security headers; restrictive same-origin CSP for the current frontend.

## Financial engine
APR / 1200 gives the monthly decimal rate. EMI = P × r × (1+r)^n / ((1+r)^n − 1); zero APR uses P/n. Round the nominal instalment and each month's interest to integer paise with ROUND_HALF_UP. Cap payments at the amount due and settle the entire residual in the last period. Total cost sums actual payments, not nominal EMI × tenure. Reject malformed, non-integer, negative, non-finite or unsupported values at the boundaries. This is a monthly model, not a lender quote.

## PWA and caching boundary
Only build-time assets are precached. No runtime response cache exists. API and auth paths are excluded from navigation fallback. The service worker must never cache authenticated API responses. A visible update control activates a waiting worker; the user can lose unsaved simulator edits when updating. Offline capability requires at least one online load. iOS installation uses Safari Share → Add to Home Screen; native browser installation UX is not implemented. iOS may evict offline storage. Production HTTPS is required (localhost is accepted for development).

## Future private deployment (not implemented)
Supabase Auth with one user identity per owner, PostgreSQL RLS on every financial table, authenticated queries from a browser client using a publishable key. Service-role keys only in trusted server-side secrets, never in Vite variables. Session callbacks must use allowlisted URLs; consider PKCE and secure recovery flows. Authenticated navigation offline must show an intentionally designed locked state rather than restoring private data from generic caches.

Cloudflare Pages serves `dist`, with GitHub integration and free-tier quotas. No deployment is created in Phase 1. The current CSP will need an explicit project-specific Supabase `connect-src` allowlist when the integration is implemented. Do not loosen it to a wildcard.

## Constraints
Hash navigation keeps static hosting simple. No central state library is needed yet. Tables and controls are semantic HTML; charts have accessible summaries and data is also represented in dashboard values. All typography is system-local. Theme storage failure is safe. Automated browser coverage complements unit tests; device installation remains a manual verification step.
