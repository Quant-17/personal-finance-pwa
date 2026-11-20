# Architecture

## Modes and boundaries

React 19 + TypeScript/Vite, Tailwind tokens, local shadcn/ui Button, Recharts, vite-plugin-pwa. `src/App.tsx` selects a lazy-loaded synthetic `DemoApp` or authenticated `private/PrivateApp` using build-time `VITE_APP_MODE`. Explicit demo builds use `.env.demo`. Invalid modes or missing private production configuration fail the build. Client validation rejects secret, service-role and legacy keys; modern publishable keys are browser-visible by design.

`private/AuthGate.tsx` subscribes to Supabase Auth events synchronously and verifies the current user separately with `getUser()`. PKCE handles email callbacks. The gate rejects anonymous and unconfirmed users. Background/offline events clear the verified user and unmount the workspace; returning online/visible verifies again. Sign-out clears the device session and reloads to sign-in even if remote revocation fails. It is local device sign-out, not revocation on other devices.

`private/workspace.ts` initializes an empty workspace (profile and category names only), fetches one aggregate snapshot and a 50-row ledger page. Abort signals and unmount guards discard late responses. All financial state and purchase drafts live in React memory. No query persistence, cross-user response cache or realtime subscription exists. Refresh explicitly to see other-device changes.

`private/Editor.tsx` translates rupee input to integer paise and uses typed Supabase operations. Money-changing RPCs carry a stable UUID across an unchanged retry; changing fields creates a new intent. Private `mutation_receipts` store only the operation, payload hash and result ID. Database locks serialize matching retries and cross-row accounting operations. Direct record creation uses UUIDs, so repeating an ambiguous request cannot silently create duplicate IDs; if it reports a duplicate after a network interruption, close and refresh before creating again.

## Database trust boundary

Every public table has RLS, explicit grants and owner policies. Protected transactions, loan payments and allocations are SELECT-only through the Data API. Public invoker wrappers call narrow SECURITY DEFINER functions in the unexposed `folio_private` schema. These use an empty search_path, verify `auth.uid()`/anonymous status, pin ownership and lock affected rows. Composite foreign keys prevent child records from linking another owner's parent.

Snapshot and ordinary table access use caller privileges/RLS. UID and JWT calls are cached in scalar subqueries in policies. No public SECURITY DEFINER function is exposed. No service-role key is used by the app. The private receipt table intentionally has RLS with no client policies or table grants; only privileged mutation functions access it.

## Financial engine

`src/lib/finance.ts` uses decimal.js precision 40 and ROUND_HALF_UP, with integer paise at boundaries. EMI uses monthly reducing balance; interest rounds monthly and the final payment clears the residual. `private/schedule.ts` exposes the same estimated month-by-month principal/interest/balance calculation. SQL generates nominal EMI with numeric arithmetic; actual repayment records are authoritative. Forecasts do not post ledger rows.

`private/domain.ts` validates snapshots with Zod, parses aggregate bigint strings without silent rounding, rejects unsafe/out-of-range totals and converts India dates explicitly. Account balance derives from opening balance plus all entries, not the displayed ledger page. The simulator receives private plan/cash/EMI explicitly; its synthetic defaults are used only by the demo.

## Hosting and caching

Cloudflare Pages or Workers Static Assets serves `dist` over HTTPS. Vite adds the exact configured Supabase HTTPS origin to generated `_headers` in private builds; no wildcard/WSS is needed. Validate headers on the actual host: Vite preview does not emulate `_headers`.

Workbox precaches static assets only; runtimeCaching is empty. API/auth navigation paths are excluded from fallback. Supabase fetches use `cache: no-store`. No financial responses or auth responses enter Cache Storage. Supabase persists its session token via its browser SDK storage; this is separate from offline caching. Signing out removes this app's auth storage keys. Shared devices should sign out; an installed PWA is not a separate account boundary.

After one online load, private mode can load its shell offline but stays locked; the synthetic demo remains fully offline capable. Updates require a visible user action and reload, discarding unsaved forms. iOS may evict storage. Hash routes simplify static hosting; responsive semantic controls use system fonts and reduced-motion tokens. Physical iPhone/Windows acceptance remains necessary.

## Version identification

Vite compiles the public package version into private-mode footers as `__FOLIO_VERSION__`. `folio-build.json` exposes the same `appVersion` alongside the Git revision and mode. This lets acceptance testers confirm service-worker activation without inspecting browser storage or exposing user data. A release-version change updates the app chunks/precache manifest and exercises the existing waiting-worker update prompt.

## Phase 3 · private saved comparisons

SavedSimulations wraps the existing simulator only in private mode. It validates incoming records, snapshots the five financial assumptions and restores those assumptions until the user explicitly chooses the current plan. The immutable v1 input format is paired with the existing paise-safe calculation; future math changes must preserve version compatibility. Reads paginate in stable date/id order and abort on unmount. The existing AuthGate and no-store fetch policy cover saved financial assumptions, with no browser persistence. Saving uses a stable content-associated UUID with INSERT ON CONFLICT DO NOTHING; no UPDATE policy or ledger RPC is introduced.
