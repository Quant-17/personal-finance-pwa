# Phase 3 · saved purchase simulations

The owner authorized this slice on 20 November 2026. CSV import is now integrated in the combined release candidate; see CSV_IMPORT.md. This branch adds private immutable comparisons to the existing Buy Simulator. It does not post transactions, create loans, alter the monthly plan or change the synthetic demo's save behavior.

## Behavior

Name and save a comparison, then reopen it from the paginated Saved comparisons list. The snapshot includes purchase price in integer paise, APR, tenure, delay, payment method and the five financial assumptions used by the simulator. A saved item opens with its original assumptions; **Use current plan** explicitly switches to today's plan/cash. Changed inputs can be saved as a new comparison. Existing snapshots are immutable; delete uses a confirmation. Saving the same unchanged draft again or retrying an interrupted response reuses its UUID and does not duplicate it.

Version 1 uses the existing monthly reducing-balance/paise-rounding calculation. Results are recomputed from validated saved inputs, rather than trusting a saved verdict. Future calculation changes must preserve the v1 engine or introduce explicit handling for older versions. Unsupported stored versions fail validation instead of silently producing a different comparison. Current limits: ₹0.01–₹1 crore price, 0–60% APR, 1–120 EMI months, and 3/6/12/24 delay months.

Saved records remain in React memory and Supabase only. The AuthGate unmounts the view offline/in background/on sign-out; in-flight list reads are aborted on unmount. API requests use the existing no-store client; Workbox runtime caching remains empty. No private records are added to browser storage, URLs, logs or fixtures.

## Migration and rollout

`supabase/migrations/20261120190842_saved_purchase_simulations.sql` adds only `public.saved_simulations`. It enables RLS before granting access, indexes owner/date/id, and grants authenticated non-anonymous owners SELECT/INSERT/DELETE. No UPDATE is granted. User ID defaults to auth.uid(); ownership checks reject another owner's ID. The UUID conflict path is INSERT ON CONFLICT DO NOTHING, so retries cannot overwrite snapshots. The table has no ledger or loan references and changes no existing financial functions.

The migration was applied to the hosted project in the approved release on 21 November 2026 IST; the filename is aligned to the version assigned by Supabase. The follow-up cache_saved_simulation_identity migration preserves ownership checks and optimizes JWT caching. CI replays it on disposable PostgreSQL alongside all prior migrations, then runs the existing financial/isolation suites and `supabase/tests/saved_simulations.sql`. Never run bootstrap.sql on managed Supabase. Before publishing the app, apply the reviewed additive migration to the existing project, refresh generated types if needed and run Supabase advisors. If the app is rolled back, retain the new table; older app builds ignore it. Do not drop saved data as an asset rollback step.

Phase 3 is now published at the existing private origin; see PHASE3_RELEASE.md for actual source/deployment IDs and owner acceptance still to perform. To preview locally, run `npm run build:private-test`, then `npm run test:private` for intercepted fake-project endpoints. For a manual signed-in preview use the existing private .env.local configuration only after applying the migration to an appropriate database; do not mix fake-project builds with the live project. No paid branch/resource is needed.

## Validation

Unit tests cover all four payment methods, exact amount/APR/EMI restoration, changed-current-plan independence, name/input/amount limits and unsupported calculation versions. The browser flow covers save after an interrupted response, stable retry UUID, refresh/reopen, original versus current assumptions, deletion, offline lock and no cached saved API response. The new SQL suite checks owner access, foreign-owner denial, immutable rows, signed-out/anonymous denial, invalid data and unchanged financial summary after save/delete. All fixtures use .invalid identities and are rolled back.

Observed implementation checks: lint/typecheck passed; 64 Vitest tests and two release regression tests passed; all nine private Chromium flows passed. The push CI database job passed the prior suites plus 22 new saved-comparison assertions on disposable PostgreSQL. Full CI also covers the six demo flows. Package version is `0.3.0-rc.1` for the next reviewed app build; no hosted migration or deployment has occurred.
