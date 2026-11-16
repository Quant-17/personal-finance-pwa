# Folio · Product specification

## Purpose and audience
A private personal finance PWA for an individual in India, usable in iPhone Safari (including Add to Home Screen) and Windows browsers. Folio brings everyday finances and purchase trade-offs into one calm, readable workspace. Phase 1 is a **publicly viewable synthetic prototype**; it does not yet provide private accounts or authentication.

## Phase 1 experience
- Responsive sidebar/drawer navigation; URL hash navigation supports refresh and browser back/forward.
- System-based initial dark/light appearance with a persistent local preference.
- November 2026 synthetic dashboard: savings, income, living expenses, surplus, six-month cash flow, expense breakdown, upcoming loan/subscription payments and sample transactions.
- Read-only account, budget and emergency reserve previews; fictional transaction CSV export.
- Dashboard and full simulator share the same in-memory purchase draft across navigation, including browser back/forward. Route navigation opens the destination at the top.
- Purchase simulator with price, selected payment method, annual APR, EMI tenure and delayed savings duration. All four options remain visible for comparison.
- Cash: purchase cost deducted from existing liquid cash, with a reserve shortfall warning.
- EMI: fixed reducing-balance instalments; total interest, total paid, final adjusted instalment and monthly surplus remaining.
- Delay: price divided over 3/6/12/24 months, funded from new monthly surplus; existing cash remains intact until purchase. Last savings contribution can be lower by the rounding residual.
- No purchase: no new payment, original surplus and cash retained.
- Offline static app shell, original icons, standalone PWA manifest, user-initiated update prompt.
- Synthetic data labels, offline status and no network transmission of purchase inputs.

## Financial conventions
Currency INR, grouping `en-IN`; all persisted/model money uses integer paise. EMI math uses decimal.js and half-up monthly interest rounding, with the final instalment clearing the outstanding amount. Default loan terms are illustrative. Price must be ₹0.01–₹1 crore; APR 0–60%; tenure 1–120 whole months. Display summaries may round to rupees; loan payment/cost details show paise. Timestamps in future live data must display using `Asia/Kolkata`. Phase 1 uses explicit November 2026 demo dates, not the device clock.

Snapshot: monthly income ₹1,25,000; living expenses ₹48,750 (including subscriptions); existing EMI ₹12,250; surplus ₹64,000. Liquid cash ₹2,42,500; reserve target ₹1,50,000. Total savings/investments ₹8,42,500 includes liquid cash. Sample ledger is incomplete and clearly labelled; trend percentages are fictional June–November series comparisons (income vs October, savings assumed prior-period), not live derived analytics.

## Privacy and boundaries
No real financial data, credential entry, Supabase client, authentication, banking integrations or private API caching. Only appearance is stored locally. Simulator values reset on refresh. No analytics, paid APIs, externally loaded fonts or paid services.

## Acceptance criteria
Lint, strict TypeScript, EMI tests and production build pass. Layout works at 390px and desktop widths without page overflow. Invalid inputs produce an inline error instead of calculations. Mobile navigation, appearance switch, CSV download and purchase scenario selection work. After one successful production load, the demo shell reloads offline. Icons and manifest are served. No Phase 2 data mutations.

## Excluded
Authenticated data access, CRUD, ledger reconciliation, transfers, multi-currency, statement imports, notifications, real forecasts, investment returns, GST/fees, real credit eligibility or financial advice. Demo notifications are a static upcoming-payments panel, not push notifications.
