# Folio · Personal Finance

A polished, synthetic personal-finance PWA for India. React + TypeScript + Vite, Tailwind, a local shadcn/ui-style component, Recharts and vite-plugin-pwa. **Phase 1 only: no login, no backend connection, no real financial data.** The eventual private app targets Supabase Auth/PostgreSQL and Cloudflare Pages.

[Desktop preview](docs/screenshots/dashboard-desktop.png) · [Mobile simulator preview](docs/screenshots/simulator-mobile-dark.png)

## Run locally / in Codex Cloud

Node 22.12+ (Node 24 used for this implementation):

```sh
npm ci
npm run dev
```

Open the Vite URL (port 5173). In a cloud workspace, use its port preview/forwarder for port 5173. No environment variables are required for the prototype. If the environment has a read-only home directory, use `npm ci --cache /tmp/folio-npm-cache`.

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run preview
```

Production preview is on port 4173. Service workers are enabled only in production builds. Optional browser verification after building: `npx playwright install chromium` then `npx playwright test`. If Chromium is already installed in a managed environment, use `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npx playwright test` instead. See [VALIDATION.md](VALIDATION.md) for actual results and remaining manual checks.

## What is included

Dashboard, read-only accounts/budgets/goals, sample ledger with CSV export, dark/light appearance, mobile navigation, four-way purchase simulator (cash / monthly EMI / delayed savings / skip), PWA installation assets and offline shell. Select a scenario to see the impact on cash, monthly surplus and emergency reserves. Adjust price, APR, tenure and delay duration. Your draft follows you between the dashboard and simulator, including browser back/forward, and resets on refresh. EMI calculations show exact paise and adjust the final instalment; fees and GST are excluded. All amounts and names are fictional. The demo ledger is a sample, not a reconciled set of transactions.

## Install / test offline

Serve the production build over HTTPS (or localhost). Open once while online and allow its service worker to activate. On iPhone, use Safari → Share → Add to Home Screen → Open as Web App (where offered). On Windows Chrome/Edge use the browser's install action. Reopen from the installed icon. After the first online load, the static demo is available offline; an offline indicator appears. iOS may evict offline storage. A new build shows an update button; activating it reloads the app and resets unsaved simulator inputs.

## Cloudflare Pages (free tier)

1. Push the reviewed branch to GitHub; merge only after review.
2. In Cloudflare Pages, connect this repository. Framework: Vite; build command: `npm run build`; output directory: `dist`; root: repository root. Use Node 22.12+ or 24 (for example `NODE_VERSION=24`).
3. Choose a branch preview or production branch intentionally. No secrets or environment variables are needed for Phase 1.
4. Confirm HTTPS, `manifest.webmanifest`, `/sw.js` and icons load. `public/_headers` is copied into `dist` and applies security/cache headers on Pages. Hash navigation works without rewrite configuration.
5. Verify desktop/mobile, standalone installation, a second visit offline, and an update from a previous build.

No deployment is performed automatically. This unauthenticated demo must not be mistaken for a private authenticated product.

## Future Supabase setup (documented only)

Do not configure real data for Phase 1. When Phase 2 is approved:

1. Create a free Supabase project. Choose an appropriate region and protect the database password.
2. Copy `.env.example` to `.env.local`; set the project URL and **publishable/anon key only**. These are browser-visible values. No client is initialized in this phase.
3. Configure Auth Site URL to the final HTTPS app origin, with exact localhost/approved preview callback URLs in the redirect allowlist. Enable the chosen email sign-in flow and review email quotas/delivery limits before relying on it.
4. Implement and apply reviewed migrations from [DATA_MODEL.md](DATA_MODEL.md), enable RLS and test owner/other-user/anonymous isolation before connecting UI queries. Do not create permissive public policies.
5. Add only the project-specific HTTPS (and WSS if needed) endpoint to the current `connect-src` CSP. Never use wildcard origins as a shortcut.
6. Put any service-role key exclusively in trusted backend secrets. **Never** use a service-role key in VITE_* variables, Cloudflare public build settings, logs or source. The current static app needs no such key.

## Documentation

[Product](PRODUCT_SPEC.md) · [Architecture](ARCHITECTURE.md) · [Data model](DATA_MODEL.md) · [Roadmap](ROADMAP.md) · [Agent guide](AGENTS.md) · [Validation](VALIDATION.md)

Original app icons can be regenerated with `python scripts/generate-icons.py` (requires Pillow). UI uses system fonts with no external font requests. Only appearance is persisted; no analytics or private API caching is included.
