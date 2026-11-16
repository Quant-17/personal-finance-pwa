# Roadmap

## Phase 1 · this review
- [x] Initialize React/TypeScript/Vite and documentation.
- [x] Responsive shell, navigation and dark/light appearance.
- [x] Synthetic dashboard and read-only account, budget, transaction previews.
- [x] Four-way buy simulator with integer-paise/decimal-safe arithmetic.
- [x] Manifest, icons, offline static shell and update prompt.
- [x] Unit tests and reproducible quality scripts.
- [x] Supabase environment template and free-tier deployment instructions.

## Phase 2 · requires a separate request
1. Review schemas and accounting rules, create Supabase project and migrations.
2. Implement authentication, recovery, RLS policies and cross-user isolation tests before financial CRUD.
3. Implement accounts, categories and transaction entry with transfer/reconciliation invariants.
4. Add budgets, goals, loan repayment schedules and subscriptions backed by live data.
5. Replace every demo computation and explicitly distinguish forecasts from settled transactions.

## Later
Saved simulations, CSV import with preview/deduplication, forecasting, export/deletion, optional reminders, accessibility audit and physical iPhone/Windows device acceptance. Bank integrations and paid APIs remain out of scope. Offline private-data editing needs a separate threat model, encryption and conflict resolution design.

## Release gates
Phase 1 quality scripts and browser flows must pass; physical iOS install and Windows Edge checks are manual. Before real data: verify RLS on every table, credential handling, recovery, user isolation, CSP, and that service workers never cache private API data. Free-tier quotas should be checked before deploying.
