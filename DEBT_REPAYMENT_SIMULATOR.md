# Adaptive debt repayment simulator

The owner requested a repayment simulator that changes with their finances and chose monthly surplus plus an optional one-time payment from spare cash. This adds **Debt repayment simulator** beside the existing Buy simulator. This is a comparison tool; it never makes payments, changes loan terms, withdraws savings or posts financial records.

## Current finances and scenarios

The starting point is the authenticated workspace’s current tracked debt balances, saved monthly income/living plan, quoted EMIs, liquid cash after existing goal earmarks, and emergency reserve. Subscriptions already sit inside living costs and are not subtracted again. A separate scenario field protects planned monthly savings; investment history is not silently assumed to be a recurring cash contribution.

Debt balances always follow the latest saved workspace. Recalculation follows imports/manual updates, return to the authenticated app, explicit Refresh finances, and a 60-second refresh while the simulator is visible. This is periodic synchronization with Folio’s records, not a bank feed or a Supabase Realtime subscription. Forecast income/living costs remain the saved monthly assumptions until the owner changes them; actual received income/partial spending is not treated as a complete future budget automatically.

Typing income/cost/rate/minimum/fee controls creates visible scenario overrides, pinned until **Use current finances** resets them. Controls stay in memory, not localStorage or a new database table. The original buy simulator/saved comparisons remain unchanged. The next calendar month is the default first repayment month; the owner can choose the current/future month. Payoff outputs show months rather than claiming a precise bank settlement day.

## Coverage and safeguards

- Include every positive tracked loan balance, including closed tracking with outstanding principal.
- Split a credit card into linked EMI principal plus its remaining revolving balance, counting the total once. Missing/mismatched card linkage or EMI principal above the card balance blocks a full plan until reconciliation.
- Require explicit rates and monthly minimums for revolving cards/overdrafts; do not invent zero-interest or zero-minimum assumptions. Negative investment balances require review rather than silently becoming a repayment loan.
- Cap the optional one-time payment at `max(0, liquid cash − reserve)`. Liquid cash already excludes goal earmarks. Locked investments are not liquidated.
- Allocate monthly surplus after living costs, protected monthly savings and all quoted minimums. A one-time payoff can remove enough minimums to make an otherwise short monthly plan affordable. Unaffordable scenarios produce no payment schedule or debt-free date.

## Strategies and calculations

Minimum-only pays stated monthly minimums without surplus/lump cash or rollover. Highest-interest-first (avalanche) and smallest-balance-first (snowball) cover all minimums, then allocate extra cash by priority. They keep a fixed affordable monthly debt budget, rolling freed EMIs into eligible remaining balances. The lowest total modelled interest plus charges among fully cleared scenarios is labelled; highest-rate-first is not promised to win when fees/eligibility differ.

Money is integer paise. Decimal.js with 40-digit precision computes monthly reducing interest and extra-payment charges, rounded half-up once to paise. Each month conserves opening debt + interest − payments = closing debt. Payments + charges + unused cash equal the monthly budget. Final minimums/payments cap at the remaining amount; no negative balance or fractional paise is created. Extra-payment fees consume the same cash budget and are not capitalized. A bounded search finds the largest affordable extra reduction including its rounded charge. One-time payments apply before the first modelled month, so fully cleared balances accrue no future interest.

The model supports up to 100 debts, 360 months and the existing supported financial range. A non-amortizing, range-limited or unaffordable scenario never claims a debt-free date or full-lifetime savings. Costs shown for unresolved scenarios cover only generated rows. Stable identity tie-breaks make repeated simulations deterministic, and source balances are never mutated.

## Assumptions requiring owner review

Rates default to saved nominal rates. The calculation assumes monthly reducing balance; flat-rate structures, daily interest, lender rebates, insurance, rate changes, new purchases and changing contractual minimums are not inferred. Extra payments default to eligible and charges to 0% as explicit editable assumptions. The owner must check lock-ins and lender prepayment terms; disabling extra payments locks them out for the model horizon. The percentage charge applies to each extra payment and should include applicable taxes; fixed/closure-specific charges need lender review. This is not a lender-confirmed foreclosure quote.

Interactive comparisons, a balance chart, payoff order, month inspector and accessible monthly/allocation tables show the trade-offs. Scheduled minimum dates reuse saved anchors, while estimated payoff dates remain month-level. Financial views remain in memory and unmount on session lock; private API caches and runtime caching remain unchanged.

## Validation and release

New tests cover final-payment caps, half-up rounding, priority allocation, rollover, fee-inclusive budgets, locked extras, full lump payoff with zero ongoing budget, affordability, bounded/non-amortizing plans, input validation, conservation, closed balances, linked-card partitioning and mismatches. Browser tests verify reserve/savings guards, source refresh, automatic timer refresh, missing card terms, mobile containment and absence of financial mutation RPCs. The new navigation item exposed short-window sidebar overflow; desktop navigation now scrolls within the sidebar, retaining Appearance/Sign out access. Existing privacy and sign-out tests passed with this fix.

No schema migration, new credentials, paid API or real financial import is required. Release identifiers will be recorded after the clean build and hosted verification.
