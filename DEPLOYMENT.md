# Phase 1 device preview

This deploys the synthetic demo only. There is no authentication gate or real financial data. Supabase configuration is not required. The repository does not publish automatically: CI produces an upload bundle only after lint, TypeScript, unit tests, build and browser tests pass.

## Get the tested build

1. Open this repository's GitHub **Actions → Quality** page and select a successful run for the reviewed commit on `feat/phase-1-prototype`.
2. Under **Artifacts**, download **folio-phase-1-preview**. GitHub downloads a ZIP archive; artifacts expire after 7 days. Pick a newer successful run if it has expired.
3. Inspect the archive before uploading: `index.html`, `_headers`, `manifest.webmanifest`, `sw.js`, `assets/` and `icons/` must be at the archive root, without a containing `dist/` directory. The archive contains compiled static assets only, not the repository or `.env` files.

For a local build, run `npm ci` and `npm run build`, then upload the **contents of `dist/`**. Never upload the repository directory or source-code ZIP from GitHub's Code menu.

## Temporary Cloudflare Pages demo

Use a separate temporary project, suggested name **folio-phase-1-preview**. Direct Upload projects cannot be converted to Git integration later; the eventual production project should use Git integration separately.

1. Sign in to your free Cloudflare account and open **Workers & Pages**.
2. Choose **Create application → Get started → Drag and drop your files** in the Pages flow. Dashboard wording may vary; choose **Pages / Direct Upload**, not a Worker.
3. Enter the temporary project name (or an available variation) and upload the tested ZIP or the folder containing the built files.
4. Review the synthetic-only contents and choose **Deploy site** when you want to publish the demo. This makes the demo accessible through its generated HTTPS `pages.dev` URL. Keep real financial data out of it.
5. Record the actual URL from Cloudflare. A URL is not reserved or active just because a suggested project name appears in this document.

No Cloudflare token is needed in chat or GitHub for this upload flow. Publishing is performed by the signed-in account owner. This workspace has not created a Pages project or deployed the app.

## Existing Workers preview: incomplete upload

The supplied `workers.dev` URL was checked on 17 November 2026. Its HTML and root service worker load, but the exact JavaScript, stylesheet and icon URLs referenced by the app return HTTP 404. The manifest is JSON but was served as `application/octet-stream`. This is an incomplete deployment, not a successful app acceptance result.

Workers Static Assets can host this prototype and supports `_headers`; moving to Pages is not required to repair it. The repository now explicitly sets the manifest response type to `application/manifest+json`.

To repair the existing Worker, extract the new build ZIP and upload the **complete extracted build folder**, including the `assets/` and `icons/` subfolders. Do not upload only the root files. In Cloudflare's upload listing, verify that the files referenced in `index.html` appear under their exact `/assets/...` paths and that `/icons/icon-192.png` is present before publishing the replacement. Use a folder upload if the selected ZIP workflow does not preserve nested paths. A fresh ZIP with directory entries is provided in the handoff.

After uploading, verify the exact current entry paths in the served HTML, `/icons/icon-192.png`, `/manifest.webmanifest` and `/sw.js`. A root page returning 200 alone does not prove the application is working. The hosted browser suite can be run with:

```sh
PLAYWRIGHT_BASE_URL=https://your-deployment.example npx playwright test
```

This skips the local Vite server and tests the deployed origin. It adds a hosted-only check for security headers, actual JS/CSS entry responses, manifest type, icon PNG dimensions and service-worker cache headers. Optional `PLAYWRIGHT_PROXY_SERVER` supports a test-network proxy; it does not disable certificate validation. Local Vite runs skip this one hosted-only check.

## Verify the hosted build

Open the exact deployment URL on desktop first:

- Dashboard, Accounts, Budgets, Transactions and Buy Simulator load. Navigation opens pages at the top.
- Edit a purchase on the dashboard, open the full simulator and check that price/APR/tenure/method remain. Browser back/forward preserves the draft; refresh clears it.
- `/manifest.webmanifest` is JSON with `display: standalone`; icons load; `/sw.js` is JavaScript rather than a fallback HTML page.
- In browser developer tools → Network, check the document response has `Content-Security-Policy`, `X-Content-Type-Options: nosniff` and `X-Frame-Options: DENY`. The service worker response should include `Cache-Control: no-cache`. These come from `_headers`; Vite's local preview does not emulate Cloudflare header rules.
- After the first online visit, reload with networking disabled: the shell and simulator work, and the offline indicator appears. Re-enable networking afterward.

## iPhone Safari / installed PWA

1. Open the HTTPS URL in Safari, allow the initial online load, then use **Share → Add to Home Screen** (and **Open as Web App**, where offered).
2. Launch the installed icon and verify the Folio icon/name and standalone layout.
3. Test the drawer, appearance toggle and simulator controls; inputs should not trigger page zoom. Check portrait and landscape layouts.
4. Close and reopen the app offline after its successful online visit. Verify the dashboard and a fresh simulator calculation still work. iOS can evict offline storage, so record whether this succeeds on the actual device.
5. Reconnect, publish a later tested build to the same project/origin, close/reopen or reload the app to trigger an update check, then use **Update app** when shown. Verify it reloads successfully. Unsaved purchase drafts reset during reload/update.

## Windows Edge / Chrome

Open the HTTPS URL, use the browser's install action, and launch the installed app. Test keyboard focus, drawer behavior at narrow widths, appearance, sample CSV download, simulator validation, offline reload and update delivery. Record browser/version, pass/fail and any reproduction steps. Actual-device checks remain outstanding until performed.

## Production project after review

After the Phase 1 PR is reviewed and merged, use a separate **Git-integrated Cloudflare Pages project** connected to `Quant-17/personal-finance-pwa`, production branch `main`, build command `npm run build`, output `dist`, Node 24, repository root `/`, and no Phase 1 environment variables. Until that merge, `main` contains only the initial README and is not buildable as the app. Use branch preview controls intentionally; choosing a Git integration and its branches can enable automatic publication.

Keep the temporary demo separate from any future private deployment. Authentication, RLS and real-data integration are Phase 2 work.

## References

- [Cloudflare Pages Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/): supported upload methods and project-type limitations.
- [Workers static asset headers](https://developers.cloudflare.com/workers/static-assets/headers/): `_headers` is also supported by Workers Static Assets.
- [Cloudflare Pages headers](https://developers.cloudflare.com/pages/configuration/headers/): `_headers` rules for static responses.
